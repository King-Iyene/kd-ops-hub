import { useCallback, useEffect, useState } from 'react';
import {
  Receipt,
  Fuel,
  RefreshCw,
  Plus,
  ExternalLink,
  Loader2,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { AuroraHero } from '@/components/AuroraHero';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { usePageTitle } from '@/hooks/usePageTitle';
import { logAudit } from '@/lib/audit';
import { friendlyDbError } from '@/lib/db-errors';
import { compressImage } from '@/lib/image-compression';
import { validateFileSize } from '@/lib/file-validation';

interface MyExpense {
  id: string;
  category: string;
  amount_ngn: number | null;
  date: string;
  description: string | null;
  status: string;
  receipt_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  payment_status: string | null;
  fuel_request_id: string | null;
}

interface MyFuelRequest {
  id: string;
  station_name: string | null;
  amount_ngn: number | null;
  litres_est: number | null;
  reason: string | null;
  status: string;
  receipt_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  payment_sent_at: string | null;
  vehicle_id: string | null;
}

const MyRequests = () => {
  usePageTitle('My Requests');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<'expenses' | 'fuel'>('expenses');
  const [expenses, setExpenses] = useState<MyExpense[]>([]);
  const [fuelRequests, setFuelRequests] = useState<MyFuelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Receipt upload state for fuel requests in payment_sent status
  const [uploadingFor, setUploadingFor] = useState<MyFuelRequest | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [expRes, fuelRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('id, category, amount_ngn, date, description, status, receipt_url, rejection_reason, created_at, payment_status, fuel_request_id')
          .eq('submitted_by', profile.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('fuel_requests')
          .select('id, station_name, amount_ngn, litres_est, reason, status, receipt_url, rejection_reason, created_at, payment_sent_at, vehicle_id')
          .eq('employee_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      if (expRes.error) throw expRes.error;
      if (fuelRes.error) throw fuelRes.error;
      // Hide expense rows that are mirrors of fuel requests — employees see those
      // under the Fuel tab directly, so showing them twice creates confusion.
      const nonFuelExpenses = (expRes.data as MyExpense[]).filter(
        (e) => !e.fuel_request_id,
      );
      setExpenses(nonFuelExpenses);
      setFuelRequests((fuelRes.data as MyFuelRequest[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load your requests.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchData);

  const submitReceipt = async () => {
    if (!uploadingFor || !receiptFile) {
      toast({ title: 'Please select a receipt file', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(receiptFile);
      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `fuel-receipts/${uploadingFor.id}-${safeName}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('receipts')
        .upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
      const { error } = await supabase
        .from('fuel_requests')
        .update({ status: 'receipt_uploaded', receipt_url: urlData.publicUrl })
        .eq('id', uploadingFor.id);
      if (error) throw error;
      // Propagate to linked expense so finance sees it too.
      await supabase
        .from('expenses')
        .update({ receipt_url: urlData.publicUrl })
        .eq('fuel_request_id', uploadingFor.id);
      await logAudit(
        'fuel_receipt_uploaded',
        `Receipt uploaded for fuel request (${formatNaira(uploadingFor.amount_ngn || 0)})`,
        profile,
      );
      toast({ title: 'Receipt submitted. Admin will review.' });
      setUploadingFor(null);
      setReceiptFile(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: friendlyDbError(err), variant: 'destructive' });
    }
    setUploading(false);
  };

  const totalPending = expenses.filter((e) => e.status === 'pending' || e.status === 'pending_second_approval').length
    + fuelRequests.filter((r) => r.status === 'pending').length;

  const paymentPending = fuelRequests.filter((r) => r.status === 'payment_sent').length;

  return (
    <div className="space-y-6">
      <AuroraHero className="p-5 sm:p-6" scanLine={paymentPending > 0}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 opacity-80 kd-icon-glow" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
                My Requests
              </span>
            </div>
            <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
              {totalPending === 0 ? 'All up to date.' : `${totalPending} pending`}
            </h1>
            <p className="text-sm opacity-70 mt-1.5">
              {paymentPending > 0
                ? `${paymentPending} fuel payment${paymentPending === 1 ? '' : 's'} awaiting your receipt.`
                : 'Your expense claims and fuel requests in one place.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium">
              <Receipt className="h-3 w-3" /> {expenses.length} expense{expenses.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium">
              <Fuel className="h-3 w-3" /> {fuelRequests.length} fuel request{fuelRequests.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={manualRefresh}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> {lastUpdatedLabel}
            </button>
          </div>
        </div>
      </AuroraHero>

      {/* Payment-sent banners */}
      {fuelRequests.filter((r) => r.status === 'payment_sent').map((r) => (
        <div
          key={r.id}
          className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <Fuel className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              Payment sent for {r.station_name} — {formatNaira(r.amount_ngn || 0)}
            </p>
            <p className="text-xs mt-0.5">
              {r.payment_sent_at ? `Sent ${formatDate(r.payment_sent_at)}. ` : ''}
              Please upload your fuel receipt to complete this request.
            </p>
          </div>
          {uploadingFor?.id === r.id ? (
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer rounded-md border border-amber-400 bg-white/80 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 transition-colors">
                <Upload className="h-3.5 w-3.5" />
                <span>{receiptFile ? receiptFile.name.slice(0, 18) : 'Choose file'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!validateFileSize(f, toast)) { e.target.value = ''; return; }
                    setReceiptFile(f);
                  }}
                />
              </label>
              <Button
                size="sm"
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!receiptFile || uploading}
                onClick={submitReceipt}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Submit'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-amber-800"
                onClick={() => { setUploadingFor(null); setReceiptFile(null); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { setUploadingFor(r); setReceiptFile(null); }}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Receipt
            </Button>
          )}
        </div>
      ))}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="expenses">
            <Receipt className="mr-2 h-4 w-4" /> Expense Claims
            <Badge variant="secondary" className="ml-2">{expenses.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="fuel">
            <Fuel className="mr-2 h-4 w-4" /> Fuel Requests
            <Badge variant="secondary" className="ml-2">{fuelRequests.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Expense Claims tab */}
        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={5} cols={5} />
              ) : error ? (
                <ErrorState message={error} onRetry={fetchData} />
              ) : expenses.length === 0 ? (
                <EmptyState
                  illustration="empty"
                  title="No expense claims yet"
                  description="Submit your first expense claim from the Expenses page."
                  action={
                    <Button variant="outline" size="sm" onClick={() => { window.location.href = '/expenses'; }}>
                      <Plus className="mr-2 h-4 w-4" /> Go to Expenses
                    </Button>
                  }
                />
              ) : (
                <>
                  {/* Desktop */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium capitalize">
                              {e.category?.replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell className="text-right currency">
                              {formatNaira(e.amount_ngn)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(e.date)}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="truncate text-sm">{e.description || '—'}</div>
                              {e.receipt_url && (
                                <a
                                  href={e.receipt_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                                >
                                  <ExternalLink className="h-3 w-3" /> View Receipt
                                </a>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge status={e.status} />
                                {e.rejection_reason && (
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={e.rejection_reason}>
                                    Reason: {e.rejection_reason}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {e.status === 'rejected' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { window.location.href = '/expenses'; }}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" /> Re-edit
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden p-3 space-y-2">
                    {expenses.map((e) => {
                      const accent =
                        e.status === 'pending' || e.status === 'pending_second_approval' ? 'bg-amber-500'
                        : e.status === 'approved' ? 'bg-emerald-500'
                        : e.status === 'rejected' ? 'bg-red-500'
                        : 'bg-muted-foreground';
                      return (
                        <MobileCard key={e.id} accentClassName={accent}>
                          <MobileCardHeader>
                            <div className="min-w-0 flex-1">
                              <MobileCardTitle className="capitalize">
                                {e.category?.replace(/_/g, ' ')}
                              </MobileCardTitle>
                            </div>
                            <MobileCardMeta className="currency text-base">
                              {formatNaira(e.amount_ngn)}
                            </MobileCardMeta>
                          </MobileCardHeader>
                          {e.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{e.description}</p>
                          )}
                          <MobileCardRow label="Date">{formatDate(e.date)}</MobileCardRow>
                          <MobileCardRow label="Status">
                            <StatusBadge status={e.status} />
                          </MobileCardRow>
                          {e.rejection_reason && (
                            <MobileCardRow label="Reason">
                              <span className="text-xs text-destructive">{e.rejection_reason}</span>
                            </MobileCardRow>
                          )}
                          {e.receipt_url && (
                            <MobileCardRow label="Receipt">
                              <a
                                href={e.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary text-xs"
                              >
                                <ExternalLink className="h-3 w-3" /> View
                              </a>
                            </MobileCardRow>
                          )}
                          {e.status === 'rejected' && (
                            <MobileCardFooter>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-9"
                                onClick={() => { window.location.href = '/expenses'; }}
                              >
                                <RotateCcw className="h-4 w-4 mr-1.5" /> Re-edit & Resubmit
                              </Button>
                            </MobileCardFooter>
                          )}
                        </MobileCard>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fuel Requests tab */}
        <TabsContent value="fuel" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={5} cols={5} />
              ) : error ? (
                <ErrorState message={error} onRetry={fetchData} />
              ) : fuelRequests.length === 0 ? (
                <EmptyState
                  illustration="empty"
                  title="No fuel requests yet"
                  description="Submit fuel requests from the Fleet page."
                  action={
                    <Button variant="outline" size="sm" onClick={() => { window.location.href = '/fleet'; }}>
                      <Plus className="mr-2 h-4 w-4" /> Go to Fleet
                    </Button>
                  }
                />
              ) : (
                <>
                  {/* Desktop */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Station</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Litres</TableHead>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fuelRequests.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.station_name || '—'}</TableCell>
                            <TableCell className="text-right currency">
                              {formatNaira(r.amount_ngn)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {r.litres_est ?? '—'}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="truncate text-sm text-muted-foreground">{r.reason || '—'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge status={r.status} />
                                {r.rejection_reason && (
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={r.rejection_reason}>
                                    Reason: {r.rejection_reason}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(r.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.status === 'payment_sent' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => { setUploadingFor(r); setReceiptFile(null); setTab('fuel'); }}
                                >
                                  <Upload className="h-3 w-3 mr-1" /> Upload Receipt
                                </Button>
                              )}
                              {r.receipt_url && r.status === 'receipt_uploaded' && (
                                <a
                                  href={r.receipt_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" /> View Receipt
                                </a>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden p-3 space-y-2">
                    {fuelRequests.map((r) => {
                      const accent =
                        r.status === 'pending' ? 'bg-amber-500'
                        : r.status === 'approved' ? 'bg-emerald-500'
                        : r.status === 'rejected' ? 'bg-red-500'
                        : r.status === 'payment_sent' ? 'bg-yellow-500'
                        : r.status === 'receipt_uploaded' ? 'bg-blue-500'
                        : r.status === 'completed' ? 'bg-emerald-500'
                        : 'bg-muted-foreground';
                      return (
                        <MobileCard key={r.id} accentClassName={accent}>
                          <MobileCardHeader>
                            <div className="min-w-0 flex-1">
                              <MobileCardTitle>{r.station_name || 'Station'}</MobileCardTitle>
                            </div>
                            <MobileCardMeta className="currency text-base">
                              {formatNaira(r.amount_ngn)}
                            </MobileCardMeta>
                          </MobileCardHeader>
                          {r.reason && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{r.reason}</p>
                          )}
                          <MobileCardRow label="Litres">{r.litres_est ?? '—'}</MobileCardRow>
                          <MobileCardRow label="Status">
                            <StatusBadge status={r.status} />
                          </MobileCardRow>
                          <MobileCardRow label="Date">{formatDate(r.created_at)}</MobileCardRow>
                          {r.rejection_reason && (
                            <MobileCardRow label="Reason">
                              <span className="text-xs text-destructive">{r.rejection_reason}</span>
                            </MobileCardRow>
                          )}
                          {(r.status === 'payment_sent' || (r.receipt_url && r.status === 'receipt_uploaded')) && (
                            <MobileCardFooter>
                              {r.status === 'payment_sent' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-9"
                                  onClick={() => { setUploadingFor(r); setReceiptFile(null); }}
                                >
                                  <Upload className="h-4 w-4 mr-1.5" /> Upload Receipt
                                </Button>
                              )}
                              {r.receipt_url && r.status === 'receipt_uploaded' && (
                                <a
                                  href={r.receipt_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50 transition-colors"
                                >
                                  <ExternalLink className="h-4 w-4" /> View Receipt
                                </a>
                              )}
                            </MobileCardFooter>
                          )}
                        </MobileCard>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MyRequests;
