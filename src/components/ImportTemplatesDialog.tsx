import { useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import { NIGERIAN_BANKS, fetchBanks } from '@/lib/nigerian-banks';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface ImportTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// linkedin_email comes BEFORE email per operator preference — it's their
// primary email. Column order is defined once here and rows are emitted by
// key (below) so the order can't drift between the header and the data.
const SAMPLE_HEADER = ['full_name', 'linkedin_email', 'email', 'whatsapp_phone', 'bank_name', 'account_number', 'default_amount_ngn', 'linkedin_password', 'linkedin_url', 'onboarded_at'];

// Example rows. linkedin_email is the PRIMARY email and is filled on most
// rows; the general `email` column is optional (shown blank on several
// rows to signal that). full_name + bank_name + account_number are the
// only required fields — everything else is optional. Banks span
// commercial / fintech / MFB / PSB so the operator sees the exact
// spelling each category needs.
const SAMPLE_ROWS: Record<string, string>[] = [
  { full_name: 'Chinwe Okafor',    linkedin_email: 'chinwe@gmail.com',     email: 'chinwe@example.com',  whatsapp_phone: '+2348012345678', bank_name: 'GTBank',                                 account_number: '0123456789', default_amount_ngn: '150000', linkedin_password: '', linkedin_url: 'https://linkedin.com/in/chinwe-okafor',    onboarded_at: '2026-01-15' },
  { full_name: 'Adewale Ogunleye', linkedin_email: 'adewale@gmail.com',    email: '',                    whatsapp_phone: '+2348023456789', bank_name: 'Access Bank',                            account_number: '0234567890', default_amount_ngn: '200000', linkedin_password: '',  linkedin_url: 'https://linkedin.com/in/adewale-ogunleye', onboarded_at: '' },
  { full_name: 'Ifeoma Nwachukwu', linkedin_email: 'ifeoma@gmail.com',     email: '',                    whatsapp_phone: '',               bank_name: 'Zenith Bank',                            account_number: '0345678901', default_amount_ngn: '175000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Tunde Bello',      linkedin_email: 'tunde@outlook.com',    email: 'tunde@example.com',   whatsapp_phone: '+2348034567890', bank_name: 'First Bank of Nigeria',                  account_number: '0456789012', default_amount_ngn: '180000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Amaka Eze',        linkedin_email: 'amaka@gmail.com',      email: '',                    whatsapp_phone: '+2348045678901', bank_name: 'United Bank for Africa (UBA)',           account_number: '0567890123', default_amount_ngn: '160000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Femi Adekunle',    linkedin_email: 'femi@yahoo.com',       email: '',                    whatsapp_phone: '+2348056789012', bank_name: 'Stanbic IBTC Bank',                      account_number: '0678901234', default_amount_ngn: '220000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Ngozi Obi',        linkedin_email: 'ngozi@gmail.com',      email: '',                    whatsapp_phone: '',               bank_name: 'First City Monument Bank (FCMB)',        account_number: '0789012345', default_amount_ngn: '140000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Sade Williams',    linkedin_email: 'sade@gmail.com',       email: '',                    whatsapp_phone: '+2348078901234', bank_name: 'Kuda Microfinance Bank',                 account_number: '0890123456', default_amount_ngn: '170000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Yusuf Ibrahim',    linkedin_email: 'yusuf@gmail.com',      email: '',                    whatsapp_phone: '+2348089012345', bank_name: 'Moniepoint Microfinance Bank',           account_number: '0901234567', default_amount_ngn: '155000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Blessing Okon',    linkedin_email: 'blessing@gmail.com',   email: '',                    whatsapp_phone: '',               bank_name: 'OPay Digital Services Limited (OPay)',   account_number: '7012345678', default_amount_ngn: '165000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Emeka Anwah',      linkedin_email: 'emeka@gmail.com',      email: '',                    whatsapp_phone: '',               bank_name: 'PalmPay',                                account_number: '8012345678', default_amount_ngn: '145000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
  { full_name: 'Tobi Adeyemi',     linkedin_email: 'tobi@gmail.com',       email: 'tobi@example.com',    whatsapp_phone: '+2348112345678', bank_name: 'Sterling Bank',                          account_number: '0023456789', default_amount_ngn: '195000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
];

function downloadSample() {
  const rows = SAMPLE_ROWS.map((r) => SAMPLE_HEADER.map((col) => r[col] ?? ''));
  downloadCsv('kdops-contractors-sample', toCsv(SAMPLE_HEADER, rows));
}

export function ImportTemplatesDialog({ open, onOpenChange }: ImportTemplatesDialogProps) {
  const { toast } = useToast();
  const [exportingBanks, setExportingBanks] = useState(false);

  // Separate reference download — one row per supported bank with the
  // EXACT canonical name the platform recognises. Pulls the DYNAMIC
  // Paystack-fetched list (300+ banks including every MFB / PSB / fintech
  // Paystack supports), NOT just the 55-bank static fallback. Same source
  // the bank picker dropdown reads from, so operators get the same list
  // they'd see if they typed it manually. Falls back to NIGERIAN_BANKS
  // only if Paystack /bank/list is unreachable (offline, edge function down).
  const downloadBankReference = async () => {
    setExportingBanks(true);
    let banks = NIGERIAN_BANKS;
    try {
      // fetchBanks returns the full dynamic list (cached 24h) and
      // updates _allBanks so getBankCode() benefits next time too.
      banks = await fetchBanks();
    } catch {
      // Stay on static fallback — operator still gets 55 names which
      // is better than nothing.
    }
    const header = ['bank_name', 'paystack_code', 'category'];
    const rows = banks.map((b) => [
      b.name,
      b.code,
      // Tag fintech / MFB / PSB so the operator can filter Excel.
      /microfinance|mfb/i.test(b.name)
        ? 'MFB'
        : /psb|payment service bank|momo|smartcash/i.test(b.name)
          ? 'PSB'
          : /opay|palmpay|kuda|carbon|alat|paga|moniepoint|fairmoney|sparkle|vfd|rubies|eyowo|renmoney|tangerine|branch|baobab|bellbank|berachah|boost|bosak/i.test(b.name)
            ? 'Fintech / Neo-bank'
            : 'Commercial',
    ]);
    downloadCsv('kdops-supported-banks', toCsv(header, rows));
    setExportingBanks(false);
    toast({
      title: 'Bank list downloaded',
      description: `${banks.length} banks exported${banks.length === NIGERIAN_BANKS.length ? ' (static fallback — Paystack /bank/list unreachable)' : ' from Paystack'}.`,
    });
  };

  // One-click "give me everything" — downloads the sample template AND
  // the supported-banks reference together, so the operator doesn't have
  // to pick between them. Sample fires first (sync), then the bank list
  // (async — it fetches the live Paystack list).
  const downloadAllTemplates = async () => {
    downloadSample();
    await downloadBankReference();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Download import templates</DialogTitle>
          <DialogDescription>
            One click gets you two files — the contractor template (with example
            rows) and the supported-banks reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1 text-sm">
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
            <p className="font-medium">What you'll get</p>
            <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-4">
              <li><span className="font-medium text-foreground">kdops-contractors-sample.csv</span> — the import template with example rows</li>
              <li><span className="font-medium text-foreground">kdops-supported-banks.csv</span> — every bank's exact name to paste into <code className="rounded bg-muted px-1 py-0.5 text-xs">bank_name</code></li>
            </ul>
          </div>

          <div className="rounded-md border border-border/60 p-3 space-y-1.5">
            <p className="font-medium text-[13px]">Columns</p>
            <p className="text-[12.5px]">
              <span className="font-semibold text-foreground">Required:</span>{' '}
              <code className="text-xs">full_name</code>, <code className="text-xs">bank_name</code>, <code className="text-xs">account_number</code>
            </p>
            <p className="text-[12.5px]">
              <span className="font-semibold text-foreground">Optional:</span>{' '}
              <code className="text-xs">linkedin_email</code> (primary email), <code className="text-xs">email</code>, <code className="text-xs">whatsapp_phone</code>, <code className="text-xs">linkedin_password</code>, <code className="text-xs">linkedin_url</code>, <code className="text-xs">default_amount_ngn</code>, <code className="text-xs">onboarded_at</code>
            </p>
            <p className="text-[11.5px] text-muted-foreground pt-0.5">
              If <code className="text-xs">linkedin_email</code> is blank, the <code className="text-xs">email</code> value fills it on import. Accounts are Paystack-verified — unverifiable accounts are blocked.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button onClick={downloadAllTemplates} disabled={exportingBanks} className="w-full sm:w-auto">
            {exportingBanks
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            Download both templates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
