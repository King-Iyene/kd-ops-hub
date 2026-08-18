import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell, BellRing, Clock, Plus, Trash2, X, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { notifyUser } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────

interface TaskRemindersPanelProps {
  taskId: string;
}

interface TaskReminder {
  id: string;
  task_id: string;
  user_id: string;
  remind_at: string;
  note: string | null;
  is_dismissed: boolean;
  created_at: string;
}

// ── Relative-time helpers ─────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const target = new Date(dateStr).getTime();
  const diffMs = target - now;
  const absDiff = Math.abs(diffMs);
  const isPast = diffMs < 0;

  const minutes = Math.round(absDiff / 60_000);
  const hours = Math.round(absDiff / 3_600_000);
  const days = Math.round(absDiff / 86_400_000);

  let label: string;
  if (minutes < 1) {
    label = 'just now';
  } else if (minutes < 60) {
    label = `${minutes}m`;
  } else if (hours < 24) {
    label = `${hours}h`;
  } else if (days < 7) {
    label = `${days}d`;
  } else {
    // Fall back to a short readable date+time
    const d = new Date(dateStr);
    label = d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    }) + ' ' + d.toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit',
    });
    return isPast ? label + ' (past)' : label;
  }

  if (isPast) return label + ' ago';
  return 'in ' + label;
}

function nextMondayAt9(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const daysUntilMon = day === 0 ? 1 : (8 - day);
  d.setDate(d.getDate() + daysUntilMon);
  d.setHours(9, 0, 0, 0);
  return d;
}

function tomorrowAt9(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function inOneHour(): Date {
  return new Date(Date.now() + 3_600_000);
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalTimeStr(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

// ── Component ─────────────────────────────────────────────────────────

export function TaskRemindersPanel({ taskId }: TaskRemindersPanelProps) {
  const profile = useAuthStore((s) => s.profile);
  const { toast } = useToast();

  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const [customNote, setCustomNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef = useRef<Set<string>>(new Set());

  // ── Load reminders ────────────────────────────────────────────────

  const loadReminders = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from('task_reminders')
      .select('id, remind_at, note, is_dismissed')
      .eq('task_id', taskId)
      .eq('user_id', profile.id)
      .order('remind_at', { ascending: true });

    if (error) {
      toast({ title: 'Failed to load reminders', description: error.message, variant: 'destructive' });
    }
    setReminders((data as TaskReminder[]) || []);
    setLoading(false);
  }, [taskId, profile?.id, toast]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  // ── Polling: check for due reminders ──────────────────────────────

  const checkDueReminders = useCallback(async () => {
    if (!profile?.id) return;
    const now = new Date().toISOString();
    const due = reminders.filter(
      (r) => !r.is_dismissed && r.remind_at <= now && !firedRef.current.has(r.id),
    );

    for (const r of due) {
      firedRef.current.add(r.id);

      // Show in-app toast
      toast({
        title: 'Reminder',
        description: r.note || 'Task reminder is due',
      });

      // Send push notification via the platform
      void notifyUser({
        userId: profile.id,
        type: 'task_reminder',
        module: 'tasks',
        title: 'Reminder',
        body: r.note || 'Task reminder is due',
      });

      // Auto-dismiss
      await supabase
        .from('task_reminders')
        .update({ is_dismissed: true })
        .eq('id', r.id);
    }

    if (due.length > 0) {
      loadReminders();
    }
  }, [profile?.id, reminders, toast, loadReminders]);

  useEffect(() => {
    checkDueReminders();
    pollingRef.current = setInterval(checkDueReminders, 60_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [checkDueReminders]);

  // ── Create reminder ───────────────────────────────────────────────

  const createReminder = async (remindAt: Date, note?: string) => {
    if (!profile?.id) return;
    setSaving(true);
    const { error } = await supabase.from('task_reminders').insert({
      task_id: taskId,
      user_id: profile.id,
      remind_at: remindAt.toISOString(),
      note: note || null,
      is_dismissed: false,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to set reminder', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reminder set', description: formatRelativeTime(remindAt.toISOString()) });
    setShowCustom(false);
    setCustomDate('');
    setCustomTime('09:00');
    setCustomNote('');
    loadReminders();
  };

  // ── Dismiss reminder ──────────────────────────────────────────────

  const dismissReminder = async (id: string) => {
    await supabase
      .from('task_reminders')
      .update({ is_dismissed: true })
      .eq('id', id);
    loadReminders();
  };

  // ── Delete reminder ───────────────────────────────────────────────

  const deleteReminder = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase
      .from('task_reminders')
      .delete()
      .eq('id', id);
    setDeletingId(null);
    if (error) {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
      return;
    }
    loadReminders();
  };

  // ── Custom form submit ────────────────────────────────────────────

  const handleCustomSubmit = () => {
    if (!customDate || !customTime) return;
    const dt = new Date(`${customDate}T${customTime}:00`);
    if (isNaN(dt.getTime())) {
      toast({ title: 'Invalid date/time', variant: 'destructive' });
      return;
    }
    createReminder(dt, customNote);
  };

  // ── Render ────────────────────────────────────────────────────────

  const activeReminders = reminders.filter((r) => !r.is_dismissed);
  const dismissedReminders = reminders.filter((r) => r.is_dismissed);
  const now = new Date().toISOString();

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Bell className="h-3.5 w-3.5" />
        Reminders
        {activeReminders.length > 0 && (
          <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
            {activeReminders.length}
          </Badge>
        )}
      </div>

      {/* Active reminders list */}
      {activeReminders.length > 0 && (
        <div className="space-y-1">
          {activeReminders.map((r) => {
            const isOverdue = r.remind_at <= now;
            return (
              <div
                key={r.id}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs',
                  isOverdue
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-border bg-muted/30',
                )}
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {isOverdue ? (
                      <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className={cn('font-medium', isOverdue && 'text-destructive')}>
                      {formatRelativeTime(r.remind_at)}
                    </span>
                    {isOverdue && (
                      <Badge variant="destructive" className="text-[9px] px-1 py-0 leading-tight">
                        Overdue
                      </Badge>
                    )}
                  </div>
                  {r.note && (
                    <p className="text-muted-foreground truncate">{r.note}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    title="Dismiss"
                    onClick={() => dismissReminder(r.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    title="Delete"
                    disabled={deletingId === r.id}
                    onClick={() => deleteReminder(r.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dismissed reminders (collapsed, subtle) */}
      {dismissedReminders.length > 0 && (
        <div className="space-y-1">
          {dismissedReminders.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground/50 line-through"
            >
              <Clock className="h-3 w-3 shrink-0" />
              <span className="flex-1 truncate">
                {formatRelativeTime(r.remind_at)}
                {r.note ? ` - ${r.note}` : ''}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive/50 hover:text-destructive"
                title="Delete"
                disabled={deletingId === r.id}
                onClick={() => deleteReminder(r.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Quick-add presets */}
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] px-2"
          disabled={saving}
          onClick={() => createReminder(inOneHour())}
        >
          <Clock className="h-3 w-3 mr-1" />
          In 1 hour
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] px-2"
          disabled={saving}
          onClick={() => createReminder(tomorrowAt9())}
        >
          <BellRing className="h-3 w-3 mr-1" />
          Tomorrow 9am
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] px-2"
          disabled={saving}
          onClick={() => createReminder(nextMondayAt9())}
        >
          <CalendarClock className="h-3 w-3 mr-1" />
          Next Monday 9am
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] px-2"
          disabled={saving}
          onClick={() => {
            const now = new Date();
            setCustomDate(toLocalDateStr(now));
            setCustomTime('09:00');
            setShowCustom(!showCustom);
          }}
        >
          <Plus className="h-3 w-3 mr-1" />
          Custom...
        </Button>
      </div>

      {/* Custom reminder form */}
      {showCustom && (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
          <div className="flex gap-2">
            <Input
              type="date"
              className="h-7 text-xs flex-1"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
            <Input
              type="time"
              className="h-7 text-xs w-24"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
          </div>
          <Input
            type="text"
            placeholder="Note (optional)"
            className="h-7 text-xs"
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-6 text-[11px] px-3"
              disabled={saving || !customDate || !customTime}
              onClick={handleCustomSubmit}
            >
              Set reminder
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => setShowCustom(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && reminders.length === 0 && !showCustom && (
        <p className="text-[11px] text-muted-foreground/60 py-1">
          No reminders set for this task.
        </p>
      )}
    </div>
  );
}
