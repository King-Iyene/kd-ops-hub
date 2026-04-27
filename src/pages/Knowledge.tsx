import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import {
  BookOpen,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  History,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';

type Category = 'finance' | 'hr' | 'operations' | 'compliance' | 'general' | 'engineering';

interface Article {
  id: string;
  title: string;
  category: Category;
  body: string;
  version: number;
  published: boolean;
  updated_by: string | null;
  updated_at: string;
}

interface Version {
  id: string;
  article_id: string;
  version: number;
  title: string;
  body: string;
  saved_at: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  finance: 'Finance Policies',
  hr: 'HR Policies',
  operations: 'Operations',
  compliance: 'Compliance',
  general: 'General',
  engineering: 'Engineering',
};

const CATEGORY_BADGE: Record<Category, string> = {
  finance: 'bg-success/10 text-success',
  hr: 'bg-info/10 text-info',
  operations: 'bg-purple-100 text-purple-700',
  compliance: 'bg-destructive/10 text-destructive',
  general: 'bg-muted text-muted-foreground',
  engineering: 'bg-accent/15 text-accent-foreground',
};

const Knowledge = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const canWrite =
    profile?.role === 'super_admin' ||
    profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'operations';

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [categoryFilter, setCategoryFilter] = useState<'all' | Category>('all');

  const [editor, setEditor] = useState<Article | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Article | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'general' as Category,
    body: '',
  });

  const [historyFor, setHistoryFor] = useState<Article | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('knowledge_articles')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    setArticles((data as Article[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditor(null);
    setForm({ title: '', category: 'general', body: '' });
    setShowEditor(true);
  };

  const openEdit = (a: Article) => {
    setEditor(a);
    setForm({ title: a.title, category: a.category, body: a.body });
    setShowEditor(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: 'Title and body are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editor) {
        // snapshot prior version
        await supabase.from('knowledge_article_versions').insert({
          article_id: editor.id,
          version: editor.version,
          title: editor.title,
          body: editor.body,
          saved_by: profile?.id || null,
        });
        const { error } = await supabase
          .from('knowledge_articles')
          .update({
            title: form.title.trim(),
            category: form.category,
            body: form.body,
            version: editor.version + 1,
            updated_by: profile?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editor.id);
        if (error) throw error;
        await logAudit(
          'knowledge_article_updated',
          `Article "${form.title}" updated (v${editor.version + 1})`,
          profile,
        );
        toast({ title: 'Article updated' });
      } else {
        const { error } = await supabase.from('knowledge_articles').insert({
          title: form.title.trim(),
          category: form.category,
          body: form.body,
          author_id: profile?.id || null,
          updated_by: profile?.id || null,
        });
        if (error) throw error;
        await logAudit(
          'knowledge_article_created',
          `Article "${form.title}" created`,
          profile,
        );
        toast({ title: 'Article created' });
      }
      setShowEditor(false);
      setEditor(null);
      load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = (a: Article) => setPendingDelete(a);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('knowledge_articles').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('knowledge_article_deleted', `Article "${pendingDelete.title}" deleted`, profile);
    toast({ title: 'Article deleted' });
    load();
  };

  const showHistory = async (a: Article) => {
    setHistoryFor(a);
    const { data } = await supabase
      .from('knowledge_article_versions')
      .select('*')
      .eq('article_id', a.id)
      .order('version', { ascending: false })
      .limit(100);
    setVersions((data as Version[]) || []);
  };

  const visible = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return articles.filter((a) => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
      );
    });
  }, [articles, debouncedSearch, categoryFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        description="Internal SOPs, policies and playbooks. Searchable, versioned, owned by the team."
        actions={
          canWrite && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New article
            </Button>
          )
        }
      />

      <Card>
        <div className="p-3 sm:p-4 border-b flex gap-2 items-center flex-wrap">
          <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10 sm:h-9"
              placeholder="Search by title or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[200px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              illustration="plane"
              title="No articles yet"
              description="Create your first internal policy or playbook. Teams search this every day."
              action={
                canWrite ? (
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> New article
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y">
              {visible.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-4 p-4 kd-transition hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{a.title}</h3>
                      <Badge variant="secondary" className={CATEGORY_BADGE[a.category]}>
                        {CATEGORY_LABELS[a.category]}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        v{a.version}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                      {a.body.slice(0, 240)}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      Updated {formatDateTime(a.updated_at)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => showHistory(a)} title="History" aria-label={`View history for ${a.title}`}>
                      <History className="h-4 w-4" />
                    </Button>
                    {canWrite && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(a)} title="Edit" aria-label={`Edit ${a.title}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="sm" variant="ghost" onClick={() => remove(a)} title="Delete" aria-label={`Delete ${a.title}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editor ? 'Edit article' : 'New article'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Petty Cash Policy"
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as Category })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Body (Markdown / plain text)</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={16}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editor ? 'Save new version' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!historyFor}
        onOpenChange={(v) => {
          if (!v) {
            setHistoryFor(null);
            setVersions([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Version history — {historyFor?.title}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No previous versions.</p>
            ) : (
              versions.map((v) => (
                <Card key={v.id}>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium">
                      v{v.version} · saved {formatDateTime(v.saved_at)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-semibold mb-1">{v.title}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {v.body}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryFor(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" will be permanently deleted. Version history is preserved in the archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Knowledge;
