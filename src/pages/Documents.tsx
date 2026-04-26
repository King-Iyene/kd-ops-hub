import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Search,
  Download,
  Trash2,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText as FileWord,
  Loader2,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { daysUntil, formatBytes, formatDate, toIsoDate } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';

interface DocumentRow {
  id: string;
  title: string;
  category: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  expires_at: string | null;
  description: string | null;
  tags: string[] | null;
  uploaded_by: string | null;
  visible_to_roles: string[];
  created_at: string;
}

const CATEGORIES = [
  'contract',
  'receipt',
  'invoice',
  'id_document',
  'policy',
  'report',
  'other',
];

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt';

const pickIcon = (mime: string | null) => {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return FileImage;
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return FileSpreadsheet;
  if (m.includes('word') || m.includes('msword')) return FileWord;
  if (m.includes('pdf')) return FileText;
  return FileIcon;
};

const MAX_MB = 25;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const Documents = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  // Only Super Admin and Admin can upload / edit / delete documents. Finance
  // sees the module but the UI is read-only for them. Route-level RoleGuard
  // keeps every other role off the page entirely.
  const canManage =
    profile?.role === 'super_admin' || profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | string>('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '',
    category: 'other',
    description: '',
    expires_at: '',
    tags: '',
  });

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setRows((data as DocumentRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // 30-day expiry notification: best-effort, idempotent per session.
  useEffect(() => {
    if (loading || !profile) return;
    const expiring = rows.filter((r) => {
      const d = daysUntil(r.expires_at);
      return d !== null && d <= 30 && d >= 0;
    });
    if (expiring.length === 0) return;
    supabase
      .from('notifications')
      .insert({
        user_id: profile.id,
        type: 'document_expiry',
        title: `${expiring.length} document${expiring.length === 1 ? '' : 's'} expiring soon`,
        body: expiring
          .slice(0, 5)
          .map((d) => `${d.title} (${formatDate(d.expires_at)})`)
          .join(', '),
      })
      .then(() => {
        // ignore response — best effort.
      });
  }, [rows, loading, profile]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.tags || []).join(' ').toLowerCase().includes(q)
      );
    });
  }, [rows, search, category]);

  const pagination = usePagination(filtered, 20);

  const resetForm = () => {
    setFile(null);
    setForm({
      title: '',
      category: 'other',
      description: '',
      expires_at: '',
      tags: '',
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > MAX_BYTES) {
      toast({
        title: 'File too large',
        description: `Max ${MAX_MB} MB per file.`,
        variant: 'destructive',
      });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(f);
    if (f && !form.title.trim()) {
      setForm((prev) => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const upload = async () => {
    if (!file) {
      toast({ title: 'Choose a file to upload', variant: 'destructive' });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Storage path: userId / timestamp-safeName
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
      const path = `${profile?.id || 'anon'}/${Date.now()}-${safeName}`;
      const up = await supabase.storage.from('documents').upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (up.error) throw up.error;

      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const { error: insertError } = await supabase.from('documents').insert({
        title: form.title.trim(),
        category: form.category,
        storage_path: path,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        expires_at: form.expires_at || null,
        description: form.description || null,
        tags,
        uploaded_by: profile?.id || null,
        // Full role set — route-level guard keeps Ops / Field Staff / Driver
        // out of the Documents page entirely.
        visible_to_roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'],
      });
      if (insertError) {
        // best-effort cleanup of the just-uploaded file
        await supabase.storage.from('documents').remove([path]);
        throw insertError;
      }

      await logAudit(
        'document_uploaded',
        `Document "${form.title.trim()}" uploaded (${formatBytes(file.size)})`,
        profile,
      );
      toast({ title: 'Document uploaded' });
      setUploadOpen(false);
      resetForm();
      fetchDocs();
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const download = async (doc: DocumentRow) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      toast({
        title: 'Could not get download link',
        description: error?.message,
        variant: 'destructive',
      });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const remove = async (doc: DocumentRow) => {
    try {
      const del = await supabase.from('documents').delete().eq('id', doc.id);
      if (del.error) throw del.error;
      await supabase.storage.from('documents').remove([doc.storage_path]);
      await logAudit('document_deleted', `Document "${doc.title}" deleted`, profile);
      toast({ title: 'Document deleted' });
      fetchDocs();
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const expiryBadge = (r: DocumentRow) => {
    if (!r.expires_at) return <span className="text-muted-foreground">—</span>;
    const d = daysUntil(r.expires_at);
    if (d === null) return <span className="text-muted-foreground">—</span>;
    if (d < 0)
      return (
        <Badge className="bg-destructive/10 text-destructive">
          Expired {formatDate(r.expires_at)}
        </Badge>
      );
    if (d <= 30)
      return (
        <Badge className="bg-warning/10 text-warning">
          Expires in {d}d
        </Badge>
      );
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        {formatDate(r.expires_at)}
      </Badge>
    );
  };

  // toggleRole removed — Documents access is governed by RoleGuard + RLS, not
  // per-document role selection any more.

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Upload contracts, receipts, and policies. Track expiry and control who can see each file."
        actions={
          canManage && (
            <Button
              onClick={() => {
                resetForm();
                setUploadOpen(true);
              }}
            >
              <Upload className="mr-2 h-4 w-4" /> Upload Document
            </Button>
          )
        }
      />

      <Card>
        <div className="p-4 border-b flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchDocs} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="plane"
              title="No documents yet"
              description="Upload contracts, receipts, or policies to store them securely and track expiry."
              action={
                canManage ? (
                  <Button
                    onClick={() => {
                      resetForm();
                      setUploadOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Upload Document
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((r) => {
                    const Icon = pickIcon(r.mime_type);
                    const canDelete = canManage || r.uploaded_by === profile?.id;
                    return (
                      <TableRow key={r.id} className="kd-transition">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{r.title}</p>
                              {r.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-sm">
                                  {r.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">
                          {r.category.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatBytes(r.file_size_bytes)}
                        </TableCell>
                        <TableCell>{expiryBadge(r)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(r.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => download(r)}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => remove(r)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={pagination.pageSize}
                onPrev={pagination.prev}
                onNext={pagination.next}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={uploadOpen}
        onOpenChange={(v) => {
          setUploadOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>File</Label>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                onChange={onFilePick}
                className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 kd-transition"
              />
              <p className="text-xs text-muted-foreground">
                PDF, images, Word, Excel. Max {MAX_MB} MB.
              </p>
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. KD Squares NDA — 2026"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Expiry date</Label>
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Tags (comma separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="e.g. contract, 2026"
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>
                Access is governed centrally: Super Admin and Admin can upload
                and delete. Finance can download. Operations, Field Staff and
                Employees have no access.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={uploading || !file}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Upload className="mr-2 h-4 w-4" /> Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input type="hidden" data-today={toIsoDate(new Date())} />
    </div>
  );
};

export default Documents;
