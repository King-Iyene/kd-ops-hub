// Profile → Privacy panel
//
// User self-service for NDPR rights. Lets the signed-in user:
//   - Read or re-read the privacy / terms.
//   - Submit a Data Subject Request (access / erasure / rectification /
//     portability / restriction). Each is a row in data_subject_requests
//     that a super_admin processes via Settings → Privacy & Compliance.
//   - See the status of their existing requests.
//
// All actions are recorded so we can prove compliance under NDPR Article 25.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Download,
  Trash2,
  FileText,
  Loader2,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type Kind = 'access' | 'erasure' | 'rectification' | 'portability' | 'restriction';

const KIND_LABEL: Record<Kind, string> = {
  access: 'Data export (Access)',
  erasure: 'Account deletion (Erasure)',
  rectification: 'Correct my data',
  portability: 'Portable copy',
  restriction: 'Pause processing',
};

interface DsrRow {
  id: string;
  request_type: Kind;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
  reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export default function PrivacyPanel() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [requests, setRequests] = useState<DsrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('access');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('data_subject_requests')
      .select('id, request_type, status, reason, created_at, completed_at')
      .order('created_at', { ascending: false });
    setRequests((data ?? []) as DsrRow[]);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, [user]);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('data_subject_requests').insert({
        user_id: user.id,
        request_type: kind,
        reason: reason.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      toast({ title: 'Request submitted', description: 'A super admin will review it shortly.' });
      setSubmitOpen(false);
      setReason('');
      await reload();
    } catch (e: any) {
      toast({ title: 'Could not submit', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (s: DsrRow['status']) => {
    const map: Record<DsrRow['status'], string> = {
      pending: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
      in_progress: 'border-sky-500/40 text-sky-700 dark:text-sky-400',
      completed: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
      rejected: 'border-rose-500/40 text-rose-700 dark:text-rose-400',
      cancelled: 'border-slate-500/40 text-slate-700 dark:text-slate-400',
    };
    return <Badge variant="outline" className={`text-[10px] ${map[s]}`}>{s}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Privacy & data rights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Under the Nigeria Data Protection Regulation, you have the right to access, correct, export,
          restrict, or delete your personal data. Read the
          {' '}<Link to="/legal/privacy" className="text-primary underline">Privacy Policy</Link>{' '}
          and{' '}
          <Link to="/legal/terms" className="text-primary underline">Terms of Service</Link>{' '}
          for details.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => { setKind('access'); setSubmitOpen(true); }}
          >
            <Download className="h-4 w-4 mr-2" /> Request data export
          </Button>
          <Button
            variant="outline"
            onClick={() => { setKind('erasure'); setSubmitOpen(true); }}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Request account deletion
          </Button>
          <Button
            variant="outline"
            onClick={() => { setKind('rectification'); setSubmitOpen(true); }}
          >
            <FileText className="h-4 w-4 mr-2" /> Request correction
          </Button>
          <Button
            variant="outline"
            onClick={() => { setKind('restriction'); setSubmitOpen(true); }}
          >
            <Info className="h-4 w-4 mr-2" /> Pause processing
          </Button>
        </div>

        <div className="pt-2">
          <h4 className="text-sm font-medium mb-2">Your requests</h4>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : requests.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No requests yet.</p>
          ) : (
            <div className="divide-y">
              {requests.map((r) => (
                <div key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{KIND_LABEL[r.request_type]}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Submitted {new Date(r.created_at).toLocaleString()}
                      {r.completed_at && ` · completed ${new Date(r.completed_at).toLocaleDateString()}`}
                    </div>
                    {r.reason && <p className="text-[11px] text-muted-foreground italic mt-0.5 truncate">"{r.reason}"</p>}
                  </div>
                  {statusBadge(r.status)}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5" />
          Statutory records (payroll, tax filings) are retained for the period Nigerian law requires
          even after account deletion. Identifying fields are anonymised; aggregates remain.
        </p>
      </CardContent>

      {/* Submit dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{KIND_LABEL[kind]}</DialogTitle>
            <DialogDescription>
              {kind === 'erasure'
                ? 'You\'re asking us to delete your account. We respond within 30 days. Statutory records may be retained as required by law.'
                : kind === 'access'
                ? 'You\'ll receive a downloadable JSON bundle of every record we hold about you within 30 days.'
                : 'Tell us what you\'d like changed or paused.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Reason / details {kind === 'rectification' || kind === 'restriction' ? '(required)' : '(optional)'}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="text-sm min-h-[100px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={busy || ((kind === 'rectification' || kind === 'restriction') && !reason.trim())}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
