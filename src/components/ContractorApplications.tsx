import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Check,
  X,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { isValidRejectionReason } from '@/lib/rejections';
import { formatDate } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';

interface Application {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  linkedin_full_name: string | null;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  linkedin_profile_url: string | null;
  linkedin_email: string | null;
  bank_name: string;
  bank_code: string | null;
  account_number: string;
  account_name: string | null;
  heyreach_password_enc: string | null;
  default_amount_ngn: number | null;
  additional_info: string | null;
  status: 'pending' | 'pending_review' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
}

const applicantName = (a: Application) =>
  a.first_name && a.last_name
    ? `${a.first_name} ${a.last_name}`
    : (a.full_name ?? a.email);

const linkedInUrl = (a: Application) => a.linkedin_url || a.linkedin_profile_url;

const isPending = (a: Application) => a.status === 'pending';

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  pending_review: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
};

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await supabase.functions.invoke('send-email', { body: { to, subject, html } });
  } catch {
    // Email is best-effort — never block the UI on failure.
  }
}

export function ContractorApplications() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Approve in-progress tracking
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contractor_applications')
      .select('*')
      .order('created_at', { ascending: false });
    setApps((data as Application[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (app: Application) => {
    setApprovingId(app.id);
    try {
      // Extract a usable LinkedIn handle from the URL.
      const linkedIn = linkedInUrl(app) ?? '';
      const linkedinHandle = linkedIn.replace(/\/$/, '').split('/').pop() || linkedIn;

      // Create the contractor record.
      const { data: contractor, error: cErr } = await supabase
        .from('contractors')
        .insert({
          full_name: app.linkedin_full_name || applicantName(app),
          first_name: app.first_name,
          last_name: app.last_name,
          email: app.email,
          phone: app.phone,
          bank_name: app.bank_name,
          bank_code: app.bank_code || '',
          account_number: app.account_number,
          account_name: app.account_name,
          linkedin_url: app.linkedin_url || app.linkedin_profile_url,
          heyreach_email: app.linkedin_email,
          heyreach_password_enc: app.heyreach_password_enc,
          default_amount: app.default_amount_ngn || 0,
          default_amount_ngn: app.default_amount_ngn || 0,
          status: 'active',
        })
        .select('id')
        .single();
      if (cErr) throw cErr;

      // Mark application as approved — error is checked so a failed update
      // surfaces immediately rather than being silently swallowed.
      const now = new Date().toISOString();
      const { error: appUpdateErr } = await supabase
        .from('contractor_applications')
        .update({
          status: 'approved',
          reviewed_by: profile?.id,
          reviewed_at: now,
          approved_by: profile?.id,
          contractor_id: (contractor as any).id,
        })
        .eq('id', app.id);
      if (appUpdateErr) throw appUpdateErr;

      // Send approval email.
      await sendEmail(
        app.email,
        'Your KD Squares application has been approved!',
        `<p>Hi ${app.first_name ?? app.full_name ?? 'there'},</p>
<p>Great news — your application to join the KD Squares LinkedIn Outreach Partner network has been <strong>approved</strong>!</p>
<p>Our team will be in touch shortly with next steps and your onboarding details.</p>
<p>Welcome aboard!</p>
<p>— The KD Squares Team</p>`,
      );

      await logAudit(
        'contractor_added',
        `Application from ${applicantName(app)} (${app.email}) approved — contractor created`,
        profile,
      );
      toast({ title: `${applicantName(app)} approved`, description: 'Contractor record created and welcome email sent.' });
      load();
    } catch (err: any) {
      toast({ title: 'Approval failed', description: err?.message, variant: 'destructive' });
    } finally {
      setApprovingId(null);
    }
  };

  const openReject = (app: Application) => {
    setRejectTarget(app);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!isValidRejectionReason(rejectReason)) {
      toast({ title: 'Reason required (min 10 characters)', variant: 'destructive' });
      return;
    }
    setRejecting(true);
    try {
      const now = new Date().toISOString();
      await supabase
        .from('contractor_applications')
        .update({
          status: 'rejected',
          rejection_reason: rejectReason.trim(),
          reviewed_by: profile?.id,
          reviewed_at: now,
        })
        .eq('id', rejectTarget.id);

      // Send rejection email.
      await sendEmail(
        rejectTarget.email,
        'Update on your KD Squares application',
        `<p>Hi ${rejectTarget.first_name ?? rejectTarget.full_name ?? 'there'},</p>
<p>Thank you for applying to the KD Squares LinkedIn Outreach Partner network.</p>
<p>After careful review, we are unable to move forward with your application at this time.</p>
<p><strong>Reason:</strong> ${rejectReason.trim()}</p>
<p>We encourage you to reapply in the future if your situation changes.</p>
<p>— The KD Squares Team</p>`,
      );

      await logAudit(
        'contractor_deactivated',
        `Application from ${applicantName(rejectTarget)} rejected: ${rejectReason.trim()}`,
        profile,
      );
      toast({ title: 'Application rejected', description: 'Rejection email sent to applicant.' });
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err: any) {
      toast({ title: 'Reject failed', description: err?.message, variant: 'destructive' });
    } finally {
      setRejecting(false);
    }
  };

  const pendingCount = apps.filter(isPending).length;
  const approvedCount = apps.filter((a) => a.status === 'approved').length;
  const rejectedCount = apps.filter((a) => a.status === 'rejected').length;

  const visible = apps.filter((a) => {
    if (tab === 'all') return true;
    if (tab === 'pending') return isPending(a);
    return a.status === tab;
  });

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="pending">
              Pending
              {pendingCount > 0 && (
                <Badge className="ml-2 bg-warning text-warning-foreground h-5 px-1.5 text-[10px]">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedCount})</TabsTrigger>
            <TabsTrigger value="all">All ({apps.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : visible.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {tab === 'pending'
                    ? <>No pending applications. Share <code className="font-mono">/join</code> to start receiving applications.</>
                    : `No ${tab} applications.`}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Applicant</TableHead>
                      <TableHead>LinkedIn</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((a) => {
                      const busy = approvingId === a.id;
                      const pending = isPending(a);
                      const li = linkedInUrl(a);
                      return (
                        <TableRow key={a.id} className="kd-transition">
                          <TableCell>
                            <p className="font-medium">{applicantName(a)}</p>
                            <p className="text-xs text-muted-foreground">{a.email}</p>
                            {a.phone && <p className="text-xs text-muted-foreground">{a.phone}</p>}
                          </TableCell>
                          <TableCell>
                            {li ? (
                              <a
                                href={li}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              >
                                Profile <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{a.bank_name}</TableCell>
                          <TableCell>
                            <p className="font-mono text-sm">{a.account_number}</p>
                            {a.account_name && (
                              <p className="text-xs text-muted-foreground">{a.account_name}</p>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[180px]">
                            {a.additional_info ? (
                              <p className="text-xs text-muted-foreground line-clamp-2">{a.additional_info}</p>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_CLS[a.status] ?? ''}>
                              {a.status === 'pending_review' ? 'pending review' : a.status}
                            </Badge>
                            {a.rejection_reason && (
                              <p className="text-xs text-destructive mt-1 max-w-[140px] line-clamp-2">
                                {a.rejection_reason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDate(a.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            {pending ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => approve(a)}
                                  title="Approve"
                                >
                                  {busy
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Check className="h-4 w-4 text-success" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => openReject(a)}
                                  title="Reject"
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost">
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {a.status === 'rejected' && (
                                    <DropdownMenuItem onClick={() => approve(a)}>
                                      Re-approve
                                    </DropdownMenuItem>
                                  )}
                                  {a.status === 'approved' && (
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => openReject(a)}
                                    >
                                      Revoke approval
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => { if (!v) { setRejectTarget(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject application</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>Rejecting application from <strong>{applicantName(rejectTarget)}</strong>. A rejection email will be sent to {rejectTarget.email}.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required — min 10 characters)"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!isValidRejectionReason(rejectReason) || rejecting}
            >
              {rejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject and notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
