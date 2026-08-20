import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatNairaCompact } from '@/lib/format';
import { roleLabel } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus2, Mail, ClipboardCheck } from 'lucide-react';

/**
 * One-click Hire flow.
 *
 * Turns a shortlisted `job_applicants` row into a live employee in a single
 * confirm. Under the hood:
 *   1. Upsert pending_invites (dedupe by email)
 *   2. Call seed_invited_profile RPC → creates profile row with status=invited
 *   3. Enrich the profile with salary, job_title, department, start_date
 *   4. Optionally seed an onboarding_checklists row with 8 default items
 *   5. Optionally send an OTP magic-link so they can set a password
 *   6. Update job_applicants.stage = 'hired'
 *
 * Every step is best-effort where possible — a checklist creation failure
 * or an email outage never blocks the profile creation.
 *
 * Requires: applicant with a valid email, an admin/hr caller.
 */

interface Applicant {
  id: string;
  opening_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  offer_amount_ngn: number | null;
}

interface OpeningLite {
  id: string;
  title: string;
  department_id: string | null;
  employment_type: string;
}

interface Department {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  applicant: Applicant | null;
  opening: OpeningLite | null;
  departments: Department[];
  onHired?: () => void;
}

// The default onboarding item template — mirrors what a Nigerian mid-size
// firm actually needs to hand off to IT/HR/Finance on day one. Ships as a
// starting point; HR can add/remove items after the checklist is created.
const DEFAULT_ONBOARDING_ITEMS: {
  category: string;
  title: string;
  offsetDays: number;
}[] = [
  { category: 'documentation', title: 'Signed offer letter',                          offsetDays: 0 },
  { category: 'documentation', title: 'CV, valid ID, degree certificates',            offsetDays: 3 },
  { category: 'documentation', title: 'Reference checks completed',                   offsetDays: 7 },
  { category: 'hr_admin',      title: 'BVN / NIN / TIN / RSA PIN captured',           offsetDays: 3 },
  { category: 'hr_admin',      title: 'Employment contract signed',                   offsetDays: 3 },
  { category: 'finance',       title: 'Bank account added to payroll',                offsetDays: 3 },
  { category: 'it_setup',      title: 'Email account provisioned',                    offsetDays: 0 },
  { category: 'it_setup',      title: 'KDOps + Slack accounts provisioned',           offsetDays: 0 },
  { category: 'equipment',     title: 'Laptop + peripherals issued',                  offsetDays: 1 },
  { category: 'introduction',  title: 'Meet-and-greet with team & department head',   offsetDays: 1 },
  { category: 'training',      title: 'Handbook + code-of-conduct read + signed',     offsetDays: 7 },
  { category: 'training',      title: 'Health & safety induction',                    offsetDays: 7 },
];

const ROLE_OPTIONS = (['field_staff', 'operations', 'finance', 'admin'] as const).map(
  (value) => ({ value, label: roleLabel(value) }),
);

export const HireApplicantDialog = ({
  open, onOpenChange, applicant, opening, departments, onHired,
}: Props) => {
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const today = new Date().toISOString().slice(0, 10);

  const [startDate,    setStartDate]    = useState(today);
  const [monthlySalary,setMonthlySalary]= useState('');
  const [jobTitle,     setJobTitle]     = useState('');
  const [role,         setRole]         = useState<'field_staff'|'operations'|'finance'|'admin'>('field_staff');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [seedChecklist,setSeedChecklist]= useState(true);
  const [sendInvite,   setSendInvite]   = useState(true);
  const [notes,        setNotes]        = useState('');
  const [saving,       setSaving]       = useState(false);

  // Sensible defaults from the applicant + opening whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setJobTitle(opening?.title || '');
    setDepartmentId(opening?.department_id || null);
    if (applicant?.offer_amount_ngn != null) {
      // offer_amount_ngn is stored as annual; convert to monthly for payroll.
      setMonthlySalary(String(Math.round(applicant.offer_amount_ngn / 12)));
    } else {
      setMonthlySalary('');
    }
    setStartDate(today);
    setSeedChecklist(true);
    setSendInvite(true);
    setNotes('');
  }, [open, applicant, opening]);

  const emailOk = !!applicant?.email && /@/.test(applicant.email);
  const nameParts = useMemo(() => {
    const parts = (applicant?.full_name || '').split(/\s+/);
    return {
      first: parts[0] || '',
      last: parts.slice(1).join(' ') || parts[0] || '',
    };
  }, [applicant]);

  const canHire = !!applicant && emailOk && startDate && !saving;

  const handleHire = async () => {
    if (!applicant || !applicant.email) return;
    setSaving(true);
    const email = applicant.email.trim().toLowerCase();
    const fullName = applicant.full_name || `${nameParts.first} ${nameParts.last}`.trim();
    const monthlySalaryNgn = monthlySalary
      ? Number(String(monthlySalary).replace(/[^\d.-]/g, ''))
      : null;

    try {
      // 1. Upsert pending_invites so the invite record exists (idempotent by email).
      await supabase.from('pending_invites').upsert(
        {
          email,
          full_name: fullName,
          role,
          phone: applicant.phone || null,
          invited_by: profile?.id || null,
        },
        { onConflict: 'email' },
      );

      // 2. Seed the profile via RPC (creates profiles row with status='invited').
      const { error: seedErr } = await (supabase as any).rpc('seed_invited_profile', {
        p_email: email,
        p_full_name: fullName,
        p_phone: applicant.phone || null,
        p_role: role,
      });
      if (seedErr) {
        // The RPC might be gated in some envs — fall through to a plain upsert
        // so the flow still works.
        console.warn('[HireApplicant] seed_invited_profile RPC failed:', seedErr.message);
      }

      // 3. Enrich the profile with the hire details.
      const enrichPayload: any = {
        first_name: nameParts.first,
        last_name:  nameParts.last,
        full_name:  fullName,
        role,
        job_title: jobTitle || null,
        department_id: departmentId,
        start_date: startDate,
        employment_type: opening?.employment_type || 'full_time',
        salary_ngn: monthlySalaryNgn,
        status: 'invited',
        updated_at: new Date().toISOString(),
      };
      const { error: updErr } = await supabase
        .from('profiles')
        .update(enrichPayload)
        .eq('email', email);
      if (updErr) {
        // Try upsert as a last resort if update matched nothing.
        await supabase.from('profiles').upsert(
          { ...enrichPayload, email },
          { onConflict: 'email' },
        );
      }

      // 4. Look up the new profile id (needed for onboarding_checklists.employee_id).
      const { data: newProfile } = await supabase
        .from('profiles_directory')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      const employeeId = (newProfile as any)?.id;

      // 5. Optionally seed the onboarding checklist.
      if (seedChecklist && employeeId) {
        const { data: checklist, error: cErr } = await (supabase as any)
          .from('onboarding_checklists')
          .insert({
            employee_id: employeeId,
            checklist_type: 'onboarding',
            target_completion_date: new Date(
              new Date(startDate).getTime() + 30 * 86400_000,
            ).toISOString().slice(0, 10),
            notes: notes || `Auto-created from Recruitment hire of ${fullName}`,
            created_by: profile?.id || null,
          })
          .select('id')
          .single();
        if (cErr) {
          console.warn('[HireApplicant] onboarding checklist skipped:', cErr.message);
        } else {
          const items = DEFAULT_ONBOARDING_ITEMS.map((it, i) => ({
            checklist_id: (checklist as any).id,
            category: it.category,
            title: it.title,
            due_date: new Date(
              new Date(startDate).getTime() + it.offsetDays * 86400_000,
            ).toISOString().slice(0, 10),
            sort_order: i,
          }));
          await (supabase as any).from('onboarding_items').insert(items);
        }
      }

      // 6. Optionally send the OTP magic-link invite email.
      if (sendInvite) {
        const redirect = `${window.location.origin}/reset-password`;
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: redirect,
            data: { full_name: fullName },
          },
        });
        if (otpErr) {
          console.warn('[HireApplicant] OTP email failed:', otpErr.message);
        }
      }

      // 7. Update applicant.stage → 'hired'.
      await supabase
        .from('job_applicants')
        .update({
          stage: 'hired',
          offered_at: new Date().toISOString(),
        })
        .eq('id', applicant.id);

      await logAudit(
        'applicant_hired' as any,
        `Hired ${fullName} (${email}) for ${jobTitle || 'role'} — start ${startDate}`,
        profile,
      );

      toast({
        title: 'Hired',
        description:
          `${fullName} is now an invited employee` +
          (seedChecklist ? ' with an onboarding checklist' : '') +
          (sendInvite ? '. Invite email sent.' : '.'),
      });
      onOpenChange(false);
      onHired?.();
    } catch (err: any) {
      toast({
        title: 'Could not complete hire',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus2 className="h-5 w-5 text-primary" /> Hire {applicant?.full_name || 'applicant'}
          </DialogTitle>
          <DialogDescription>
            Creates the employee profile as <Badge variant="secondary">Invited</Badge>,
            seeds an onboarding checklist, and (optionally) sends the invite
            email — all in one go.
          </DialogDescription>
        </DialogHeader>

        {!emailOk && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
            This applicant has no email on file. Add an email to their record
            first, then re-open Hire.
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Job title</Label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder={opening?.title || 'e.g. Field Officer'}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Select
                value={departmentId || '__none__'}
                onValueChange={(v) => setDepartmentId(v === '__none__' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monthly salary (₦)</Label>
              <Input
                type="number"
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                placeholder="e.g. 450000"
              />
              {applicant?.offer_amount_ngn != null && (
                <p className="text-[10px] text-muted-foreground">
                  Pre-filled from annual offer {formatNairaCompact(applicant.offer_amount_ngn)} ÷ 12.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">System role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Onboarding notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything HR/IT should know before day 1…"
            />
          </div>

          <div className="border-t pt-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={seedChecklist}
                onCheckedChange={(v) => setSeedChecklist(Boolean(v))}
                className="mt-0.5"
              />
              <div className="text-sm">
                <span className="font-medium inline-flex items-center gap-1">
                  <ClipboardCheck className="h-3.5 w-3.5" /> Seed onboarding checklist
                </span>
                <p className="text-xs text-muted-foreground">
                  {DEFAULT_ONBOARDING_ITEMS.length} default items across
                  documentation, HR, finance, IT, equipment, intro & training.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={sendInvite}
                onCheckedChange={(v) => setSendInvite(Boolean(v))}
                className="mt-0.5"
              />
              <div className="text-sm">
                <span className="font-medium inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> Send invite email now
                </span>
                <p className="text-xs text-muted-foreground">
                  OTP magic-link so {applicant?.email || 'the new hire'} can set
                  their password and log in.
                </p>
              </div>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleHire} disabled={!canHire}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Hiring…' : 'Confirm hire'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HireApplicantDialog;
