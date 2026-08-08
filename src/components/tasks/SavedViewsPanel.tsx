import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Plus, Trash2, Share2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { SavedView } from '@/lib/task-types';

interface SavedViewsPanelProps {
  spaceId: string | null;
  currentFilters: Record<string, any>;
  currentViewType: string;
  currentGroupBy?: string;
  currentSortBy?: string;
  currentSortDir?: string;
  onApplyView: (view: SavedView) => void;
}

const VIEW_TYPE_LABELS: Record<string, string> = {
  board: 'Board',
  list: 'List',
  table: 'Table',
  calendar: 'Calendar',
  gantt: 'Gantt',
};

export function SavedViewsPanel({
  spaceId, currentFilters, currentViewType,
  currentGroupBy, currentSortBy, currentSortDir,
  onApplyView,
}: SavedViewsPanelProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [views, setViews] = useState<SavedView[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from('saved_views').select('*').order('created_at', { ascending: false });
    if (spaceId) {
      q = q.or(`space_id.eq.${spaceId},space_id.is.null`);
    }
    const { data } = await q.limit(30);
    setViews((data as SavedView[]) || []);
  }, [spaceId]);

  useEffect(() => { load(); }, [load]);

  const saveView = async () => {
    if (!saveName.trim()) return;
    const { error } = await supabase.from('saved_views').insert({
      name: saveName.trim(),
      space_id: spaceId || null,
      created_by: profile?.id || null,
      view_type: currentViewType,
      filters: currentFilters,
      group_by: currentGroupBy || null,
      sort_by: currentSortBy || null,
      sort_dir: currentSortDir || null,
      is_shared: saveShared,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'View saved' });
    setSaveName('');
    setShowSave(false);
    load();
  };

  const deleteView = async (id: string) => {
    await supabase.from('saved_views').delete().eq('id', id);
    toast({ title: 'View deleted' });
    load();
  };

  if (views.length === 0 && !showSave) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-[10px] gap-1 text-muted-foreground"
        onClick={() => setShowSave(true)}
      >
        <Bookmark className="h-3 w-3" /> Save view
      </Button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {views.map((v) => (
          <div key={v.id} className="group inline-flex items-center gap-1">
            <button
              onClick={() => onApplyView(v)}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
            >
              <Bookmark className="h-2.5 w-2.5" />
              {v.name}
              <Badge variant="secondary" className="text-[8px] h-3 px-1">{VIEW_TYPE_LABELS[v.view_type] || v.view_type}</Badge>
              {v.is_shared ? <Share2 className="h-2 w-2 text-muted-foreground" /> : <Lock className="h-2 w-2 text-muted-foreground" />}
            </button>
            <button
              onClick={() => deleteView(v.id)}
              className="opacity-0 group-hover:opacity-100 text-destructive transition-opacity"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}

        {!showSave ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setShowSave(true)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        ) : (
          <div className="inline-flex items-center gap-1">
            <Input
              className="h-6 w-[120px] text-[10px]"
              placeholder="View name..."
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveView(); if (e.key === 'Escape') setShowSave(false); }}
              autoFocus
            />
            <Button size="sm" className="h-6 text-[9px] px-2" onClick={saveView}>Save</Button>
            <button onClick={() => setShowSave(false)} className="text-muted-foreground hover:text-foreground">
              <span className="text-[10px]">Cancel</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
