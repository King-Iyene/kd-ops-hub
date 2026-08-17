import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatNaira, formatDate } from '@/lib/format';
import { sanitizeHtml } from '@/lib/sanitize';
import { renderTemplate } from '@/lib/mustache-lite';
import { signAndStore, tryGetGeo } from '@/lib/e-sign';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileSignature, ShieldCheck, Download } from 'lucide-react';
import SignaturePad from './SignaturePad';

/**
 * Generate + sign an offer letter for a new hire in one dialog.
 *
 * Flow:
 *   1. HR picks a template (permanent / fixed-term / internship).
 *   2. Template renders live with the current vars (name, salary, etc.)
 *   3. HR draws their signature on the canvas.
 *   4. Confirm → we compute SHA-256 hash of the rendered HTML, insert into
 *      signed_documents (immutable), and toast a link to download the HTML.
 *
 * Persists the signed HTML in the row so the letter can be reproduced
 * verbatim later even if the template changes.
 */

interface Applicant {
  id: string;
  full_name: string;
  email: string | null;
  offer_amount_ngn: number | null;
}

interface Opening {
  id: string;
  title: string;
  location: string | null;
  employment_type: 'full_time' | 'part_time' | 'contract' | 'intern';
  department_id: string | null;
}

interface Department {
  id: string;
  name: string;
}

interface Template {
  id: string;
  code: string;
  name: string;
  description: string | null;
  html_body: string;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  applicant: Applicant | null;
  opening: Opening | null;
  departments: Department[];
  startDate: string;
  monthlySalary: string;
  reportingManagerName?: string;
  onSigned?: (signedDocId: string) => void;
}

const DEFAULT_TEMPLATE_BY_TYPE: Record<Opening['employment_type'], string> = {
  full_time: 'permanent_full_time',
  part_time: 'permanent_full_time',
  contract:  'fixed_term',
  intern:    'internship',
};

export const OfferLetterDialog = ({
  open, onOpenChange, applicant, opening, departments, startDate,
  monthlySalary, reportingManagerName, onSigned,
}: Props) => {
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateCode, setTemplateCode] = useState<string>('permanent_full_time');
  const [endDate, setEndDate] = useState<string>('');
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState('KD Squares');
  const [issuerTitle, setIssuerTitle] = useState('HR Manager');

  // Load templates + company name whenever dialog opens.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [tRes, cRes] = await Promise.all([
        supabase
          .from('offer_letter_templates' as any)
          .select('id, code, name, description, html_body, active')
          .eq('active', true)
          .order('name'),
        supabase
          .from('company_settings')
          .select('company_name')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
      setTemplates(((tRes.data ?? []) as any[]) as Template[]);
      if (cRes.data) setCompanyName((cRes.data as any).company_name || 'KD Squares');
    })();
    if (opening) setTemplateCode(DEFAULT_TEMPLATE_BY_TYPE[opening.employment_type]);
    setSignaturePng(null);
    setEndDate('');
  }, [open, opening]);

  const template = useMemo(
    () => templates.find((t) => t.code === templateCode) ?? templates[0],
    [templates, templateCode],
  );

  const vars = useMemo(() => {
    const parts = (applicant?.full_name || '').split(/\s+/);
    const dept = departments.find((d) => d.id === opening?.department_id);
    const salaryNumeric = monthlySalary
      ? Number(String(monthlySalary).replace(/[^\d.-]/g, ''))
      : null;
    return {
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' ') || '',
      job_title: opening?.title || '',
      department: dept?.name || '—',
      start_date: startDate ? formatDate(startDate) : '—',
      end_date: endDate ? formatDate(endDate) : '—',
      monthly_salary: salaryNumeric ? formatNaira(salaryNumeric) : '—',
      reporting_manager: reportingManagerName || '—',
      location: opening?.location || 'Head office',
      company_name: companyName,
      issuer_name: profile?.full_name || profile?.email || 'HR',
      issuer_title: issuerTitle,
    };
  }, [
    applicant, opening, departments, startDate, endDate,
    monthlySalary, reportingManagerName, companyName, profile, issuerTitle,
  ]);

  const renderedHtml = useMemo(() => {
    if (!template) return '';
    return renderTemplate(template.html_body, vars);
  }, [template, vars]);

  const needsEndDate = template?.code === 'fixed_term' || template?.code === 'internship';

  const canSign = !!template && !!signaturePng && !!applicant?.email && !saving;

  const handleSign = async () => {
    if (!template || !applicant || !applicant.email || !signaturePng) return;
    setSaving(true);
    try {
      const geo = await tryGetGeo();
      // Wrap the rendered HTML in a printable shell so download preserves style.
      const finalHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${vars.job_title} — ${vars.first_name} ${vars.last_name}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.55}
  h2{font-size:22px;margin-top:0}
  h3{margin-top:22px;font-size:15px}
  table{margin-top:8px}
  .sign-block{margin-top:36px;padding-top:16px;border-top:1px dashed #cbd5e1}
  .sig{max-height:80px;display:block;margin-top:4px}
</style></head><body>
${renderedHtml}
<div class="sign-block">
  <p style="margin:0;color:#5b6b75;font-size:12px">Signed by ${vars.issuer_name} on ${new Date().toLocaleString('en-GB')}</p>
  <img class="sig" src="${signaturePng}" alt="Signature" />
</div>
</body></html>`;

      const { id, hash } = await signAndStore({
        documentKind: 'offer_letter',
        documentTitle: `Offer letter — ${vars.job_title} — ${vars.first_name} ${vars.last_name}`,
        documentHtml: finalHtml,
        employeeId: null,               // no profile yet — created after hire
        referenceType: 'job_applicant',
        referenceId: applicant.id,
        signerId: profile?.id ?? null,
        signerName: vars.issuer_name,
        signerEmail: profile?.email || 'issuer@kdops',
        signaturePng,
        geo,
      });
      await logAudit(
        'offer_letter_signed' as any,
        `Offer letter signed for ${applicant.full_name} (${vars.job_title}) · hash ${hash.slice(0, 10)}…`,
        profile,
      );
      toast({
        title: 'Offer letter signed',
        description: 'The signed letter is stored in Documents → Signed HR docs.',
      });
      onSigned?.(id);
      onOpenChange(false);

      // Also open the signed HTML in a new tab for immediate download.
      const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast({
        title: 'Could not save signed letter',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Generate &amp; sign offer letter
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Signature stored with SHA-256 hash and audit trail. Enforceable under
            Cybercrimes Act 2015 s.17.
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Template</Label>
            <Select value={templateCode} onValueChange={setTemplateCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Issuer title</Label>
            <Input
              value={issuerTitle}
              onChange={(e) => setIssuerTitle(e.target.value)}
              placeholder="HR Manager"
            />
          </div>
          {needsEndDate && (
            <div className="space-y-1">
              <Label className="text-xs">Contract end date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="border rounded-md overflow-auto max-h-[420px] p-6 bg-white text-slate-900">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedHtml) }}
          />
        </div>

        {/* Signature pad */}
        <SignaturePad
          label={`Sign as ${vars.issuer_name}`}
          onChange={setSignaturePng}
        />

        <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1">
          <Badge variant="secondary" className="text-[10px]">
            Signer: {vars.issuer_name}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            Applicant: {applicant?.full_name || '—'}
          </Badge>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSign} disabled={!canSign}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Download className="mr-1.5 h-4 w-4" />
            {saving ? 'Signing…' : 'Sign & download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OfferLetterDialog;
