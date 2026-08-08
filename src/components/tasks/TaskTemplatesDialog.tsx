import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Trash2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { Task, TaskTemplate } from '@/lib/task-types';

interface TaskTemplatesDialogProps {
  open: boolean;
  onClose: () => void;
  currentTask?: Task | null;
  onApplyTemplate: (data: Record<string, any>) => void;
}

export function TaskTemplatesDialog({ open, onClose, currentTask, onApplyTemplate }: TaskTemplatesDialogProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('task_templates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setTemplates((data as TaskTemplate[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const saveAsTemplate = async () => {
    if (!saveName.trim() || !currentTask) return;
    const templateData = {
      title: currentTask.title,
      description: currentTask.description,
      priority: currentTask.priority,
      status: 'open',
      task_type: currentTask.task_type,
      tags: currentTask.tags,
    };
    const { error } = await supabase.from('task_templates').insert({
      name: saveName.trim(),
      description: `Template from "${currentTask.title}"`,
      template_data: templateData,
      created_by: profile?.id || null,
      is_global: false,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Template saved' });
    setSaveName('');
    setShowSave(false);
    load();
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from('task_templates').delete().eq('id', id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Task Templates
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {currentTask && (
            <div className="border rounded-md p-3 bg-muted/30 space-y-2">
              {!showSave ? (
                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5" onClick={() => setShowSave(true)}>
                  <Copy className="h-3 w-3" /> Save current task as template
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Template name..."
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveAsTemplate(); }}
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={saveAsTemplate}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowSave(false)}>Cancel</Button>
                </div>
              )}
            </div>
          )}

          {templates.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No templates yet. Save a task as a template to reuse it.
            </p>
          )}

          {templates.map((t) => (
            <div
              key={t.id}
              className="border rounded-md p-3 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.template_data.priority && (
                      <Badge variant="secondary" className="text-[9px] h-4">{t.template_data.priority}</Badge>
                    )}
                    {t.template_data.task_type && t.template_data.task_type !== 'task' && (
                      <Badge variant="secondary" className="text-[9px] h-4">{t.template_data.task_type}</Badge>
                    )}
                    {(t.template_data.tags || []).length > 0 && (
                      <Badge variant="secondary" className="text-[9px] h-4">
                        {t.template_data.tags.length} tags
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      onApplyTemplate(t.template_data);
                      onClose();
                    }}
                  >
                    <Plus className="h-3 w-3" /> Use
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => deleteTemplate(t.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
