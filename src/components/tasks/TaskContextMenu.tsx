import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import type { Task, TaskList, SpaceFolder, ProfileRow, TaskType } from '@/lib/task-types';
import type { Space } from '@/components/tasks/TaskSidebar';
import {
  Copy,
  Trash2,
  FolderInput,
  FileText,
  Bug,
  Sparkles,
  Milestone,
  CheckSquare,
  Link2,
} from 'lucide-react';

interface TaskContextMenuProps {
  task: Task;
  spaces: Space[];
  folders: SpaceFolder[];
  lists: TaskList[];
  profiles: Map<string, ProfileRow>;
  onUpdate: () => void;
  onTaskClick?: (task: Task) => void;
  children: React.ReactNode;
}

const TASK_TYPE_OPTIONS: { value: TaskType; label: string; icon: React.ReactNode }[] = [
  { value: 'task', label: 'Task', icon: <CheckSquare className="mr-2 h-3.5 w-3.5" /> },
  { value: 'bug', label: 'Bug', icon: <Bug className="mr-2 h-3.5 w-3.5" /> },
  { value: 'feature', label: 'Feature', icon: <Sparkles className="mr-2 h-3.5 w-3.5" /> },
  { value: 'milestone', label: 'Milestone', icon: <Milestone className="mr-2 h-3.5 w-3.5" /> },
];

export function TaskContextMenu({
  task,
  spaces,
  folders,
  lists,
  onUpdate,
  children,
}: TaskContextMenuProps) {
  const { toast } = useToast();
  const profile = useAuthStore((s) => s.profile);
  const [moveOpen, setMoveOpen] = useState(false);

  const handleMoveTo = async (listId: string, spaceId: string) => {
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('space_id', spaceId)
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from('tasks')
      .update({ list_id: listId, project_id: proj?.id ?? null })
      .eq('id', task.id);

    if (error) {
      toast({ title: 'Move failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('task_updated', `Moved task "${task.title}" to list ${listId}`, profile, {
      task_id: task.id,
      list_id: listId,
    });
    toast({ title: 'Task moved' });
    onUpdate();
  };

  const handleDuplicate = async () => {
    const { data: newTask, error } = await supabase
      .from('tasks')
      .insert({
        title: `Copy of ${task.title}`,
        description: task.description,
        assignee_id: task.assignee_id,
        due_date: task.due_date,
        priority: task.priority,
        status: task.status,
        project_id: task.project_id,
        list_id: task.list_id,
        tags: task.tags,
        task_type: task.task_type,
        start_date: task.start_date,
        time_estimate_minutes: task.time_estimate_minutes,
        created_by: profile?.id || null,
        parent_id: task.parent_id,
        goal_id: task.goal_id,
      })
      .select('id')
      .single();

    if (error || !newTask) {
      toast({ title: 'Duplicate failed', description: error?.message, variant: 'destructive' });
      return;
    }

    const { data: subtasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('parent_id', task.id);

    if (subtasks?.length) {
      const copies = subtasks.map((st) => ({
        title: st.title,
        description: st.description,
        assignee_id: st.assignee_id,
        due_date: st.due_date,
        priority: st.priority,
        status: st.status,
        project_id: st.project_id,
        list_id: st.list_id,
        tags: st.tags,
        task_type: st.task_type,
        parent_id: newTask.id,
        created_by: profile?.id || null,
      }));
      await supabase.from('tasks').insert(copies);
    }

    await logAudit('task_created', `Duplicated task "${task.title}"`, profile, {
      source_task_id: task.id,
      new_task_id: newTask.id,
    });
    toast({ title: 'Task duplicated' });
    onUpdate();
  };

  const handleSaveTemplate = async () => {
    const templateData = {
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      tags: task.tags,
    };
    const { error } = await supabase.from('task_templates').insert({
      name: task.title,
      description: `Template from "${task.title}"`,
      template_data: templateData,
      created_by: profile?.id || null,
      is_global: false,
    });
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved as template' });
  };

  const handleChangeType = async (newType: TaskType) => {
    const { error } = await supabase
      .from('tasks')
      .update({ task_type: newType })
      .eq('id', task.id);

    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('task_updated', `Changed task "${task.title}" type to ${newType}`, profile, {
      task_id: task.id,
      task_type: newType,
    });
    onUpdate();
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/tasks?detail=${task.id}`;
    await navigator.clipboard.writeText(url);
    toast({ title: 'Link copied' });
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;

    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('task_updated', `Deleted task "${task.title}"`, profile, {
      task_id: task.id,
    });
    toast({ title: 'Task deleted' });
    onUpdate();
  };

  const buildMoveTree = () => {
    return spaces.map((space) => {
      const spaceFolders = folders.filter((f) => f.space_id === space.id);
      const rootLists = lists.filter(
        (l) => l.space_id === space.id && !l.folder_id
      );

      return (
        <DropdownMenuSub key={space.id}>
          <DropdownMenuSubTrigger className="text-xs">
            <span
              className="mr-2 h-2 w-2 rounded-full inline-block"
              style={{ backgroundColor: space.color }}
            />
            {space.name}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {rootLists.map((list) => (
              <DropdownMenuItem
                key={list.id}
                className="text-xs"
                onClick={() => handleMoveTo(list.id, space.id)}
              >
                {list.name}
              </DropdownMenuItem>
            ))}
            {spaceFolders.map((folder) => {
              const folderLists = lists.filter((l) => l.folder_id === folder.id);
              return (
                <DropdownMenuSub key={folder.id}>
                  <DropdownMenuSubTrigger className="text-xs">
                    {folder.name}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {folderLists.map((list) => (
                      <DropdownMenuItem
                        key={list.id}
                        className="text-xs"
                        onClick={() => handleMoveTo(list.id, space.id)}
                      >
                        {list.name}
                      </DropdownMenuItem>
                    ))}
                    {folderLists.length === 0 && (
                      <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                        No lists
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
            {rootLists.length === 0 && spaceFolders.length === 0 && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                No lists
              </DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuSub open={moveOpen} onOpenChange={setMoveOpen}>
          <DropdownMenuSubTrigger className="text-xs">
            <FolderInput className="mr-2 h-3.5 w-3.5" />
            Move to...
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {moveOpen && buildMoveTree()}
            {spaces.length === 0 && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                No spaces
              </DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem className="text-xs" onClick={handleDuplicate}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Duplicate
        </DropdownMenuItem>

        <DropdownMenuItem className="text-xs" onClick={handleSaveTemplate}>
          <FileText className="mr-2 h-3.5 w-3.5" />
          Save as template
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <CheckSquare className="mr-2 h-3.5 w-3.5" />
            Change type
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TASK_TYPE_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className="text-xs"
                disabled={task.task_type === opt.value}
                onClick={() => handleChangeType(opt.value)}
              >
                {opt.icon}
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem className="text-xs" onClick={handleCopyLink}>
          <Link2 className="mr-2 h-3.5 w-3.5" />
          Copy link
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-xs text-destructive focus:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
