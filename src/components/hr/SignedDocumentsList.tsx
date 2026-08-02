import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { sha256 } from '@/lib/e-sign';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  FileSignature, Download, ShieldCheck, ShieldX, ExternalLink,
  MapPin, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Signed HR documents browser.
 *
 * Renders every signed_documents row related to an employee — offer
 * letters, contracts, policy acknowledgements, disciplinary responses.
 * Each card shows:
 *   • kind badge + title
 *   • signer + timestamp + geo (if captured)
 *   • signature preview (thumbnail)
 *   • "Open" — opens the rendered HTML in a new tab (blob URL)
 *   • "Verify" — recomputes SHA-256(html + email + date) and compares
 *     to the stored hash; visually confirms the document hasn't been
 *     tampered with in the database.
 *
 * Read-only. Docs are immutable in the schema.
 */

const KIND_LABELS: Record<string, string> = {
  offer_letter: 'Offer Letter',
  contract: 'Contract',
  contract_addendum: 'Contract Addendum',
  disciplinary_response: 'Disciplinary Response',
  policy_acknowledgement: 'Policy Acknowledgement',
  ndpr_consent: 'NDPR Consent',
  exit_clearance: 'Exit Clearance',
  other: 'Other',
};

const KIND_TONE: Record<string, string> = {
  offer_letter: 'bg-primary/10 text-primary',
  contract: 'bg-emerald-100 text-emerald-700',
  contract_addendum: 'bg-sky-100 text-sky-700',
  disciplinary_response: 'bg-amber-100 text-amber-700',
  policy_acknowledgement: 'bg-violet-100 text-violet-700',
  ndpr_consent: 'bg-slate-100 text-slate-700',
  exit_clearance: 'bg-rose-100 text-rose-700',
  other: 'bg-muted text-muted-foreground',
};

interface SignedDoc {
  id: string;
  document_kind: keyof typeof KIND_LABELS;
  document_title: string;
  document_html: string;
  document_hash: string;
  signer_name: string;
  signer_email: string;
  signature_png: string;
  signed_at: string;
  signed_geo: { lat: number; lng: number; accuracy?: number } | null;
  reference_type: string | null;
  reference_id: string | null;
}

interface Props {
  employeeId?: string;      // fetch docs where employee_id = this
  applicantId?: string;     // OR docs where reference_type='job_applicant' + reference_id
  emptyLabel?: string;
}

export const SignedDocumentsList = ({
  employeeId, applicantId, emptyLabel,
}: Props) => {
  const { toast } = useToast();
  const [docs, setDocs] = useState<SignedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from('signed_documents' as any)
        .select(
          'id, document_kind, document_title, document_html, document_hash, signer_name, signer_email, signature_png, signed_at, signed_geo, reference_type, reference_id',
        )
        .order('signed_at', { ascending: false })
        .limit(50);
      if (employeeId) q = q.eq('employee_id', employeeId);
      else if (applicantId) {
        q = q.eq('reference_type', 'job_applicant').eq('reference_id', applicantId);
      }
      const { data, error } = await q;
      if (error) {
        console.warn('[SignedDocumentsList]', error.message);
        setDocs([]);
      } else {
        setDocs((data ?? []) as any[]);
      }
      setLoading(false);
    })();
  }, [employeeId, applicantId]);

  const openDoc = (d: SignedDoc) => {
    const blob = new Blob([d.document_html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadDoc = (d: SignedDoc) => {
    const blob = new Blob([d.document_html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = d.document_title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `${safe}-${d.id.slice(0, 8)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const verifyDoc = async (d: SignedDoc) => {
    setVerifying(d.id);
    try {
      // Mirror the exact hash formula used in src/lib/e-sign.ts::signAndStore.
      const dateOnly = new Date(d.signed_at).toISOString().slice(0, 10);
      const recomputed = await sha256(
        `${d.document_html}::${d.signer_email.toLowerCase()}::${dateOnly}`,
      );
      const ok = recomputed === d.document_hash;
      setVerificationResult((r) => ({ ...r, [d.id]: ok }));
      toast({
        title: ok ? 'Signature verified ✓' : 'Signature verification FAILED',
        description: ok
          ? 'Document body + signer + date match the stored hash.'
          : 'Recomputed hash does not match the stored one — document may have been tampered.',
        variant: ok ? undefined : 'destructive',
      });
    } finally {
      setVerifying(null);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground py-4">Loading signed documents…</p>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        {emptyLabel ?? 'No signed documents on file yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map((d) => {
        const verified = verificationResult[d.id];
        return (
          <Card key={d.id} className="overflow-hidden">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={cn('text-[10px]', KIND_TONE[d.document_kind] || KIND_TONE.other)}
                    >
                      <FileSignature className="h-3 w-3 mr-1" />
                      {KIND_LABELS[d.document_kind] || d.document_kind}
                    </Badge>
                    {verified === true && (
                      <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                      </Badge>
                    )}
                    {verified === false && (
                      <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
                        <ShieldX className="h-3 w-3 mr-1" /> Tamper detected
                      </Badge>
                    )}
                  </div>
                  <p className="font-medium text-sm mt-1 truncate">{d.document_title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Signed by <span className="font-medium">{d.signer_name}</span> ·{' '}
                    {formatDateTime(d.signed_at)}
                    {d.signed_geo && (
                      <span className="inline-flex items-center gap-1 ml-2">
                        <MapPin className="h-3 w-3" />
                        {d.signed_geo.lat.toFixed(3)}, {d.signed_geo.lng.toFixed(3)}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5 truncate">
                    hash {d.document_hash.slice(0, 24)}…
                  </p>
                </div>
                {d.signature_png && (
                  <img
                    src={d.signature_png}
                    alt="signature"
                    className="h-12 w-20 object-contain bg-white rounded border"
                  />
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => openDoc(d)}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadDoc(d)}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={verifying === d.id}
                  onClick={() => verifyDoc(d)}
                >
                  {verifying === d.id ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Verify
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default SignedDocumentsList;
