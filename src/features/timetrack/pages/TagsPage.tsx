import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Tags, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { TimeTag } from '../lib/types';

interface TagUsage extends TimeTag {
  entry_count: number;
}

/** Dedicated CRUD page for tags used across time entries — matches TimeCamp's
 * Manage > Tags. Tags themselves were already creatable inline from the Time
 * Entries page; this adds the missing central list/rename/delete, plus a
 * usage count so an admin can see what a tag is actually attached to before
 * deleting it. */
export default function TagsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tags, isLoading } = useQuery({
    queryKey: ['timetrack', 'tags-with-usage'],
    queryFn: async () => {
      const [{ data: tagRows, error: tagErr }, { data: usageRows, error: usageErr }] = await Promise.all([
        supabase.from('time_tags').select('*').order('name'),
        supabase.from('time_entry_tags').select('tag_id'),
      ]);
      if (tagErr) throw tagErr;
      if (usageErr) throw usageErr;
      const counts = new Map<string, number>();
      for (const row of usageRows ?? []) counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1);
      return (tagRows ?? []).map((t) => ({ ...t, entry_count: counts.get(t.id) ?? 0 })) as TagUsage[];
    },
  });

  const [newTagName, setNewTagName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TagUsage | null>(null);
  const [busy, setBusy] = useState(false);

  const addTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('time_tags').insert({ name });
      if (error) throw error;
      setNewTagName('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'tags-with-usage'] });
    } catch (err) {
      toast({ title: 'Could not create tag', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (tag: TagUsage) => {
    setEditingId(tag.id);
    setEditingName(tag.name);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('time_tags').update({ name }).eq('id', editingId);
      if (error) throw error;
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['timetrack', 'tags-with-usage'] });
    } catch (err) {
      toast({ title: 'Could not rename tag', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('time_tags').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['timetrack', 'tags-with-usage'] });
      toast({ title: 'Tag deleted' });
    } catch (err) {
      toast({ title: 'Could not delete tag', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Tags" description="Manage the tags available on time entries" icon={Tags} />

      <div className="flex gap-2 max-w-md">
        <Input placeholder="New tag name" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} />
        <Button onClick={addTag} disabled={busy || !newTagName.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
          Add
        </Button>
      </div>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Used on</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(tags ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  {editingId === t.id ? (
                    <Input className="h-8 max-w-xs" value={editingName} onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()} autoFocus />
                  ) : (
                    <Badge variant="outline">{t.name}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{t.entry_count} {t.entry_count === 1 ? 'entry' : 'entries'}</TableCell>
                <TableCell className="text-right space-x-1">
                  {editingId === t.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={saveEdit} disabled={busy}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(tags ?? []).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No tags yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.entry_count > 0
                ? `This tag is attached to ${deleteTarget.entry_count} time ${deleteTarget.entry_count === 1 ? 'entry' : 'entries'} — it will be removed from all of them. This can't be undone.`
                : "This tag isn't used on any time entries. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
