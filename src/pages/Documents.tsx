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
  FolderOpen,
  FolderPlus,
  Grid3X3,
  List,
  Eye,
  Tag,
  Clock,
  BarChart2,
  Users,
  Building2,
  Car,
  Briefcase,
  ChevronRight,
  ArrowLeft,
  Link2,
  Filter,
  X,
  Copy,
  MoreVertical,
  Pencil,
  Star,
  StarOff,
  FolderIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { daysUntil, formatBytes, formatDate, toIsoDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { FilePreviewTrigger } from '@/components/FilePreview';

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
  entity_type: string | null;
  entity_id: string | null;
  folder: string | null;
  is_template: boolean;
  status: string | null;
  version: number | null;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  icon: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_by: string | null;
  created_at: string;
}

interface EntityOption {
  id: string;
  name: string;
}

const CATEGORIES = [
  'contract',
  'agreement',
  'receipt',
  'invoice',
  'id_document',
  'policy',
  'report',
  'proposal',
  'letter',
  'certificate',
  'license',
  'insurance',
  'tax',
  'hr',
  'onboarding',
  'template',
  'other',
];

const ENTITY_TYPES = [
  { value: 'client', label: 'Client', icon: Building2 },
  { value: 'employee', label: 'Employee', icon: Users },
  { value: 'vehicle', label: 'Vehicle', icon: Car },
  { value: 'project', label: 'Project', icon: Briefcase },
] as const;

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.pptx,.ppt,.zip,.rar';

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

const FOLDER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16',
];

const Documents = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const canManage =
    profile?.role === 'super_admin' || profile?.role === 'admin';
  const canUpload =
    canManage || profile?.role === 'finance' || profile?.role === 'operations';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<FolderRow[]>([]);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [form, setForm] = useState({
    title: '',
    category: 'other',
    description: '',
    expires_at: '',
    tags: '',
    entity_type: '',
    entity_id: '',
    folder_id: '',
    is_template: false,
  });

  // Folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderForm, setFolderForm] = useState({ name: '', description: '', color: '#6366f1', entity_type: '', entity_id: '' });
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Detail/preview dialog
  const [detailDoc, setDetailDoc] = useState<DocumentRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Entity options for linking
  const [clients, setClients] = useState<EntityOption[]>([]);
  const [employees, setEmployees] = useState<EntityOption[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<EntityOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<EntityOption[]>([]);

  // Drag and drop
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [docRes, folderRes] = await Promise.all([
      supabase
        .from('documents')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('document_folders')
        .select('*')
        .order('name', { ascending: true }),
    ]);
    if (docRes.error) {
      setError(docRes.error.message);
      setLoading(false);
      return;
    }
    setRows((docRes.data as DocumentRow[]) || []);
    setFolders((folderRes.data as FolderRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Fetch entity options for linking
  useEffect(() => {
    (async () => {
      const [cRes, eRes, vRes, pRes] = await Promise.all([
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name').eq('status', 'active').order('full_name'),
        supabase.from('vehicles').select('id, name, plate_number').order('name'),
        supabase.from('projects').select('id, name').order('name'),
      ]);
      setClients((cRes.data || []).map((c: any) => ({ id: c.id, name: c.name })));
      setEmployees((eRes.data || []).map((e: any) => ({ id: e.id, name: e.full_name })));
      setVehicleOptions((vRes.data || []).map((v: any) => ({ id: v.id, name: `${v.name} (${v.plate_number})` })));
      setProjectOptions((pRes.data || []).map((p: any) => ({ id: p.id, name: p.name })));
    })();
  }, []);

  // Expiry notification
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
      .then(() => {});
  }, [rows, loading, profile]);

  // Stats
  const stats = useMemo(() => {
    const total = rows.length;
    const expiringSoon = rows.filter((r) => { const d = daysUntil(r.expires_at); return d !== null && d <= 30 && d >= 0; }).length;
    const expired = rows.filter((r) => { const d = daysUntil(r.expires_at); return d !== null && d < 0; }).length;
    const totalSize = rows.reduce((s, r) => s + (r.file_size_bytes || 0), 0);
    const byCategory = new Map<string, number>();
    for (const r of rows) {
      byCategory.set(r.category, (byCategory.get(r.category) || 0) + 1);
    }
    const templates = rows.filter((r) => r.is_template).length;
    const linked = rows.filter((r) => r.entity_type).length;
    return { total, expiringSoon, expired, totalSize, byCategory, templates, linked };
  }, [rows]);

  // Filtering
  const currentFolderDocs = useMemo(() => {
    return rows.filter((r) => {
      if (currentFolder) return r.folder === currentFolder;
      return true;
    });
  }, [rows, currentFolder]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return currentFolderDocs.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (entityFilter !== 'all') {
        if (entityFilter === 'unlinked') { if (r.entity_type) return false; }
        else if (r.entity_type !== entityFilter) return false;
      }
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.tags || []).join(' ').toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    });
  }, [currentFolderDocs, search, category, entityFilter]);

  const pagination = usePagination(filtered, viewMode === 'grid' ? 12 : 20);

  const currentSubFolders = useMemo(() => {
    return folders.filter((f) => f.parent_id === currentFolder);
  }, [folders, currentFolder]);

  // Navigate into folder
  const enterFolder = (folder: FolderRow) => {
    setFolderPath((prev) => [...prev, folder]);
    setCurrentFolder(folder.id);
    pagination.reset();
  };

  const goToRoot = () => {
    setFolderPath([]);
    setCurrentFolder(null);
    pagination.reset();
  };

  const goToPathIndex = (idx: number) => {
    if (idx < 0) { goToRoot(); return; }
    const newPath = folderPath.slice(0, idx + 1);
    setFolderPath(newPath);
    setCurrentFolder(newPath[newPath.length - 1].id);
    pagination.reset();
  };

  // Form helpers
  const resetForm = () => {
    setFiles([]);
    setForm({
      title: '',
      category: 'other',
      description: '',
      expires_at: '',
      tags: '',
      entity_type: '',
      entity_id: '',
      folder_id: currentFolder || '',
      is_template: false,
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const valid = picked.filter((f) => {
      if (f.size > MAX_BYTES) {
        toast({ title: `${f.name} is too large (max ${MAX_MB} MB)`, variant: 'destructive' });
        return false;
      }
      return true;
    });
    setFiles(valid);
    if (valid.length === 1 && !form.title.trim()) {
      setForm((prev) => ({ ...prev, title: valid[0].name.replace(/\.[^.]+$/, '') }));
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    const valid = dropped.filter((f) => {
      if (f.size > MAX_BYTES) {
        toast({ title: `${f.name} is too large (max ${MAX_MB} MB)`, variant: 'destructive' });
        return false;
      }
      return true;
    });
    if (valid.length > 0) {
      setFiles(valid);
      if (valid.length === 1 && !form.title.trim()) {
        setForm((prev) => ({ ...prev, title: valid[0].name.replace(/\.[^.]+$/, '') }));
      }
      setUploadOpen(true);
    }
  };

  const upload = async () => {
    if (files.length === 0) {
      toast({ title: 'Choose files to upload', variant: 'destructive' });
      return;
    }
    if (files.length === 1 && !form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file);
        const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const path = `${profile?.id || 'anon'}/${Date.now()}-${safeName}`;
        const up = await supabase.storage.from('documents').upload(path, compressed, {
          upsert: false,
          contentType: compressed.type || undefined,
        });
        if (up.error) throw up.error;

        const title = files.length === 1 ? form.title.trim() : file.name.replace(/\.[^.]+$/, '');
        const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        const insertData: any = {
          title,
          category: form.category,
          storage_path: path,
          file_url: urlData.publicUrl,
          mime_type: file.type || null,
          file_size_bytes: file.size,
          expires_at: form.expires_at || null,
          description: form.description || null,
          tags,
          uploaded_by: profile?.id || null,
          visible_to_roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'],
          is_template: form.is_template,
          status: 'active',
        };

        if (form.entity_type && form.entity_id) {
          insertData.entity_type = form.entity_type;
          insertData.entity_id = form.entity_id;
        }
        if (form.folder_id) {
          insertData.folder = form.folder_id;
        }

        const { error: insertError } = await supabase.from('documents').insert(insertData);
        if (insertError) {
          await supabase.storage.from('documents').remove([path]);
          throw insertError;
        }

        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      await logAudit(
        'document_uploaded',
        `${files.length} document${files.length > 1 ? 's' : ''} uploaded`,
        profile,
      );
      toast({ title: `${files.length} document${files.length > 1 ? 's' : ''} uploaded` });
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
      setUploadProgress(0);
    }
  };

  const download = async (doc: DocumentRow) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      toast({ title: 'Could not get download link', description: error?.message, variant: 'destructive' });
      return;
    }
    // Track access
    supabase.from('documents').update({
      last_accessed_at: new Date().toISOString(),
      access_count: (doc as any).access_count ? (doc as any).access_count + 1 : 1,
    }).eq('id', doc.id).then(() => {});
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const remove = async (doc: DocumentRow) => {
    try {
      const del = await supabase
        .from('documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', doc.id);
      if (del.error) throw del.error;
      await supabase.storage.from('documents').remove([doc.storage_path]);
      await logAudit('document_deleted', `Document "${doc.title}" deleted`, profile);
      toast({ title: 'Document deleted' });
      setDetailOpen(false);
      setDetailDoc(null);
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    }
  };

  const createFolder = async () => {
    if (!folderForm.name.trim()) {
      toast({ title: 'Folder name is required', variant: 'destructive' });
      return;
    }
    setCreatingFolder(true);
    try {
      const insertData: any = {
        name: folderForm.name.trim(),
        description: folderForm.description || null,
        color: folderForm.color,
        parent_id: currentFolder || null,
        created_by: profile?.id || null,
      };
      if (folderForm.entity_type && folderForm.entity_id) {
        insertData.entity_type = folderForm.entity_type;
        insertData.entity_id = folderForm.entity_id;
      }
      const { error } = await supabase.from('document_folders').insert(insertData);
      if (error) throw error;
      toast({ title: 'Folder created' });
      setFolderDialogOpen(false);
      setFolderForm({ name: '', description: '', color: '#6366f1', entity_type: '', entity_id: '' });
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Failed to create folder', description: err?.message, variant: 'destructive' });
    } finally {
      setCreatingFolder(false);
    }
  };

  const getEntityOptions = (type: string): EntityOption[] => {
    switch (type) {
      case 'client': return clients;
      case 'employee': return employees;
      case 'vehicle': return vehicleOptions;
      case 'project': return projectOptions;
      default: return [];
    }
  };

  const getEntityName = (type: string | null, id: string | null): string | null => {
    if (!type || !id) return null;
    const opts = getEntityOptions(type);
    return opts.find((o) => o.id === id)?.name || null;
  };

  const expiryBadge = (r: DocumentRow) => {
    if (!r.expires_at) return <span className="text-muted-foreground text-xs">—</span>;
    const d = daysUntil(r.expires_at);
    if (d === null) return <span className="text-muted-foreground text-xs">—</span>;
    if (d < 0) return <Badge className="bg-destructive/10 text-destructive text-[10px]">Expired</Badge>;
    if (d <= 30) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">{d}d left</Badge>;
    return <span className="text-muted-foreground text-xs">{formatDate(r.expires_at)}</span>;
  };

  const entityBadge = (r: DocumentRow) => {
    if (!r.entity_type) return null;
    const name = getEntityName(r.entity_type, r.entity_id);
    const TypeIcon = ENTITY_TYPES.find((e) => e.value === r.entity_type)?.icon || Link2;
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <TypeIcon className="h-2.5 w-2.5" />
        {name || r.entity_type}
      </Badge>
    );
  };

  const openDetail = (doc: DocumentRow) => {
    setDetailDoc(doc);
    setDetailOpen(true);
  };

  return (
    <div
      className="space-y-4"
      ref={dropRef}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <div className="bg-background rounded-xl p-8 shadow-lg text-center">
            <Upload className="h-12 w-12 mx-auto text-primary mb-3" />
            <p className="text-lg font-semibold">Drop files to upload</p>
            <p className="text-sm text-muted-foreground">Release to add documents</p>
          </div>
        </div>
      )}

      <PageHeader
        title="Documents"
        description="Organize, store, and manage all company documents. Tag by client, employee, or project."
        actions={
          <div className="flex gap-2">
            {canUpload && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFolderForm({ name: '', description: '', color: '#6366f1', entity_type: '', entity_id: '' });
                    setFolderDialogOpen(true);
                  }}
                >
                  <FolderPlus className="mr-2 h-4 w-4" /> New Folder
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setUploadOpen(true);
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Total Documents</span>
            </div>
            <p className="text-xl font-bold">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">{formatBytes(stats.totalSize)} used</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-muted-foreground">Expiring Soon</span>
            </div>
            <p className="text-xl font-bold text-amber-600">{stats.expiringSoon}</p>
            <p className="text-[10px] text-muted-foreground">within 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">Expired</span>
            </div>
            <p className="text-xl font-bold text-red-600">{stats.expired}</p>
            <p className="text-[10px] text-muted-foreground">need renewal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">Linked</span>
            </div>
            <p className="text-xl font-bold text-blue-600">{stats.linked}</p>
            <p className="text-[10px] text-muted-foreground">to entities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs text-muted-foreground">Folders</span>
            </div>
            <p className="text-xl font-bold">{folders.length}</p>
            <p className="text-[10px] text-muted-foreground">{stats.templates} templates</p>
          </CardContent>
        </Card>
      </div>

      {/* Breadcrumb + toolbar */}
      <Card>
        <div className="p-3 border-b space-y-2">
          {/* Breadcrumb */}
          {folderPath.length > 0 && (
            <div className="flex items-center gap-1 text-sm flex-wrap">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={goToRoot}>
                <FolderOpen className="h-3 w-3 mr-1" /> All Documents
              </Button>
              {folderPath.map((fp, i) => (
                <span key={fp.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 px-2 text-xs ${i === folderPath.length - 1 ? 'font-semibold' : ''}`}
                    onClick={() => goToPathIndex(i)}
                  >
                    {fp.name}
                  </Button>
                </span>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); pagination.reset(); }}
              />
            </div>
            <Select value={category} onValueChange={(v) => { setCategory(v); pagination.reset(); }}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Category" />
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
            <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); pagination.reset(); }}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Linked to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                <SelectItem value="unlinked">Unlinked</SelectItem>
                {ENTITY_TYPES.map((et) => (
                  <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 px-2 rounded-r-none"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 px-2 rounded-l-none"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchDocs} />
          ) : (
            <>
              {/* Folder grid */}
              {currentSubFolders.length > 0 && (
                <div className="p-3 border-b">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Folders</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                    {currentSubFolders.map((folder) => {
                      const docCount = rows.filter((r) => r.folder === folder.id).length;
                      return (
                        <button
                          key={folder.id}
                          onClick={() => enterFolder(folder)}
                          className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left group"
                        >
                          <FolderIcon className="h-5 w-5 shrink-0" style={{ color: folder.color }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{folder.name}</p>
                            <p className="text-[10px] text-muted-foreground">{docCount} file{docCount !== 1 ? 's' : ''}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Documents */}
              {filtered.length === 0 ? (
                <EmptyState
                  illustration="plane"
                  title={currentFolder ? 'This folder is empty' : 'No documents yet'}
                  description={currentFolder
                    ? 'Upload files or move documents to this folder.'
                    : 'Upload contracts, receipts, or policies. Organize with folders and link to clients or employees.'}
                  action={
                    canUpload ? (
                      <Button onClick={() => { resetForm(); setUploadOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> Upload Document
                      </Button>
                    ) : undefined
                  }
                />
              ) : viewMode === 'list' ? (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Document</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Linked To</TableHead>
                          <TableHead>Tags</TableHead>
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
                            <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate max-w-[200px]">{r.title}</p>
                                    {r.description && (
                                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.description}</p>
                                    )}
                                  </div>
                                  {r.is_template && <Badge variant="outline" className="text-[10px] shrink-0">Template</Badge>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px] capitalize">
                                  {r.category.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>{entityBadge(r) || <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-[150px]">
                                  {(r.tags || []).slice(0, 2).map((t, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
                                  ))}
                                  {(r.tags || []).length > 2 && (
                                    <span className="text-[10px] text-muted-foreground">+{(r.tags || []).length - 2}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs tabular-nums">
                                {formatBytes(r.file_size_bytes)}
                              </TableCell>
                              <TableCell>{expiryBadge(r)}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">
                                {formatDate(r.created_at)}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => download(r)} title="Download">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  {canDelete && (
                                    <Button size="sm" variant="ghost" onClick={() => remove(r)} title="Delete">
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
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2 p-3">
                    {pagination.slice.map((r) => {
                      const Icon = pickIcon(r.mime_type);
                      return (
                        <MobileCard key={r.id} onClick={() => openDetail(r)}>
                          <MobileCardHeader>
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <MobileCardTitle>{r.title}</MobileCardTitle>
                                <MobileCardMeta>
                                  {r.category.replace(/_/g, ' ')} · {formatBytes(r.file_size_bytes)}
                                </MobileCardMeta>
                              </div>
                            </div>
                          </MobileCardHeader>
                          <MobileCardRow label="Uploaded" value={formatDate(r.created_at)} />
                          {r.entity_type && (
                            <MobileCardRow label="Linked to" value={getEntityName(r.entity_type, r.entity_id) || r.entity_type} />
                          )}
                          {r.expires_at && (
                            <MobileCardRow label="Expiry" value={expiryBadge(r)} />
                          )}
                          <MobileCardFooter>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); download(r); }}>
                                <Download className="h-3 w-3 mr-1" /> Download
                              </Button>
                            </div>
                          </MobileCardFooter>
                        </MobileCard>
                      );
                    })}
                  </div>

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
              ) : (
                /* Grid view */
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
                    {pagination.slice.map((r) => {
                      const Icon = pickIcon(r.mime_type);
                      return (
                        <button
                          key={r.id}
                          onClick={() => openDetail(r)}
                          className="flex flex-col items-center p-4 rounded-xl border hover:bg-muted/50 transition-colors text-center group"
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-2 group-hover:bg-primary/10 transition-colors">
                            <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <p className="text-sm font-medium truncate w-full">{r.title}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{r.category.replace(/_/g, ' ')}</p>
                          <p className="text-[10px] text-muted-foreground">{formatBytes(r.file_size_bytes)}</p>
                          {entityBadge(r) && <div className="mt-1">{entityBadge(r)}</div>}
                          {r.expires_at && <div className="mt-1">{expiryBadge(r)}</div>}
                        </button>
                      );
                    })}
                  </div>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(v) => { setUploadOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Upload className="h-4 w-4 text-primary" />
              </div>
              Upload Document{files.length > 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Add files to your document library. Tag with category, entity, and folder.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
            <div className="space-y-1">
              <Label>File{files.length > 1 ? 's' : ''}</Label>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                multiple
                onChange={onFilePick}
                className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <p className="text-xs text-muted-foreground">
                PDF, images, Word, Excel, PowerPoint, ZIP. Max {MAX_MB} MB each. Multiple files supported.
              </p>
              {files.length > 0 && (
                <div className="space-y-1 mt-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                      <FileIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="shrink-0">{formatBytes(f.size)}</span>
                      <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {files.length <= 1 && (
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. KD Squares Service Agreement 2026"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</SelectItem>
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

            {/* Entity linking */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Link to (optional)</Label>
                <Select value={form.entity_type || '__none__'} onValueChange={(v) => setForm({ ...form, entity_type: v === '__none__' ? '' : v, entity_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {ENTITY_TYPES.map((et) => (
                      <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.entity_type && (
                <div className="space-y-1">
                  <Label>{ENTITY_TYPES.find((e) => e.value === form.entity_type)?.label || 'Entity'}</Label>
                  <Select value={form.entity_id || undefined} onValueChange={(v) => setForm({ ...form, entity_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {getEntityOptions(form.entity_type).map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Folder */}
            {folders.length > 0 && (
              <div className="space-y-1">
                <Label>Folder (optional)</Label>
                <Select value={form.folder_id || '__root__'} onValueChange={(v) => setForm({ ...form, folder_id: v === '__root__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Root (no folder)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">Root (no folder)</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Tags (comma separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="e.g. 2026, renewable, annual"
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of the document..."
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_template}
                onChange={(e) => setForm({ ...form, is_template: e.target.checked })}
                className="rounded border-input"
              />
              <span className="text-sm">Save as template</span>
            </label>

            {uploading && (
              <div className="space-y-1">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">{uploadProgress}% uploaded</p>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 px-6 pb-5 pt-3 border-t">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={upload} disabled={uploading || files.length === 0}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Upload className="mr-2 h-4 w-4" />
              Upload {files.length > 1 ? `${files.length} files` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" /> Create Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Folder name</Label>
              <Input
                value={folderForm.name}
                onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                placeholder="e.g. Client Contracts"
              />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFolderForm({ ...folderForm, color: c })}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${folderForm.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Input
                value={folderForm.description}
                onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
                placeholder="What goes in this folder?"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Scope to (optional)</Label>
                <Select value={folderForm.entity_type || '__none__'} onValueChange={(v) => setFolderForm({ ...folderForm, entity_type: v === '__none__' ? '' : v, entity_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {ENTITY_TYPES.map((et) => (
                      <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {folderForm.entity_type && (
                <div className="space-y-1">
                  <Label>{ENTITY_TYPES.find((e) => e.value === folderForm.entity_type)?.label}</Label>
                  <Select value={folderForm.entity_id || undefined} onValueChange={(v) => setFolderForm({ ...folderForm, entity_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {getEntityOptions(folderForm.entity_type).map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
            <Button onClick={createFolder} disabled={creatingFolder}>
              {creatingFolder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          {detailDoc && (() => {
            const Icon = pickIcon(detailDoc.mime_type);
            const canDelete = canManage || detailDoc.uploaded_by === profile?.id;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate">{detailDoc.title}</p>
                      <p className="text-xs text-muted-foreground font-normal capitalize">{detailDoc.category.replace(/_/g, ' ')}</p>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  {detailDoc.description && (
                    <p className="text-sm text-muted-foreground">{detailDoc.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Size</p>
                      <p className="font-medium">{formatBytes(detailDoc.file_size_bytes)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Uploaded</p>
                      <p className="font-medium">{formatDate(detailDoc.created_at)}</p>
                    </div>
                    {detailDoc.expires_at && (
                      <div>
                        <p className="text-xs text-muted-foreground">Expiry</p>
                        <div>{expiryBadge(detailDoc)}</div>
                      </div>
                    )}
                    {detailDoc.version && detailDoc.version > 1 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Version</p>
                        <p className="font-medium">v{detailDoc.version}</p>
                      </div>
                    )}
                  </div>

                  {detailDoc.entity_type && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Linked to</p>
                      {entityBadge(detailDoc)}
                    </div>
                  )}

                  {(detailDoc.tags || []).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {(detailDoc.tags || []).map((t, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailDoc.is_template && (
                    <Badge variant="outline" className="gap-1">
                      <Copy className="h-3 w-3" /> Template
                    </Badge>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => download(detailDoc)}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </Button>
                  {canDelete && (
                    <Button variant="destructive" onClick={() => remove(detailDoc)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <input type="hidden" data-today={toIsoDate(new Date())} />
    </div>
  );
};

export default Documents;
