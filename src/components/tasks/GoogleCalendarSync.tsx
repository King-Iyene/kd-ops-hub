/**
 * Google Calendar sync settings panel.
 *
 * Manages the OAuth connection to Google Calendar, sync preferences, and
 * manual task-to-event sync. Designed to sit inside the Tasks page as a
 * settings section or dialog body.
 *
 * The OAuth backend (`/api/auth/google-calendar`) is deployed separately;
 * this component handles the frontend flow and direct Calendar API calls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  RefreshCw,
  ExternalLink,
  Settings,
  Check,
  X,
  Loader2,
  Unlink,
} from 'lucide-react';
import type { Task } from '@/lib/task-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarIntegration {
  id: string;
  user_id: string;
  provider: 'google';
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  calendar_id: string;
  sync_enabled: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SyncResult {
  taskId: string;
  title: string;
  success: boolean;
  error?: string;
}

export interface GoogleCalendarSyncProps {
  tasks: Task[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOOGLE_CALENDAR_API =
  'https://www.googleapis.com/calendar/v3/calendars';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoogleCalendarSync({ tasks }: GoogleCalendarSyncProps) {
  const profile = useAuthStore((s) => s.profile);
  const { toast } = useToast();

  // Integration row from DB
  const [integration, setIntegration] = useState<CalendarIntegration | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [twoWaySync, setTwoWaySync] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const popupRef = useRef<Window | null>(null);

  // -----------------------------------------------------------------------
  // Fetch existing integration
  // -----------------------------------------------------------------------

  const fetchIntegration = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('calendar_integrations')
        .select('id, access_token, calendar_id, sync_enabled, last_synced_at, token_expires_at')
        .eq('user_id', profile.id)
        .eq('provider', 'google')
        .maybeSingle();
      if (error) throw error;
      setIntegration(data as CalendarIntegration | null);
    } catch (err: any) {
      toast({
        title: 'Failed to load calendar integration',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [profile?.id, toast]);

  useEffect(() => {
    fetchIntegration();
  }, [fetchIntegration]);

  // -----------------------------------------------------------------------
  // OAuth popup flow
  // -----------------------------------------------------------------------

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'google-calendar-auth') return;

      if (event.data.success) {
        toast({ title: 'Google Calendar connected' });
        fetchIntegration();
      } else {
        toast({
          title: 'Connection failed',
          description:
            event.data.error || 'Could not connect to Google Calendar.',
          variant: 'destructive',
        });
      }

      popupRef.current?.close();
      popupRef.current = null;
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchIntegration, toast]);

  const handleConnect = () => {
    const url = `${window.location.origin}/api/auth/google-calendar`;
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    popupRef.current = window.open(
      url,
      'google-calendar-auth',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );

    if (!popupRef.current) {
      toast({
        title: 'Popup blocked',
        description:
          'Please allow popups for this site to connect Google Calendar.',
        variant: 'destructive',
      });
    }
  };

  // -----------------------------------------------------------------------
  // Toggle sync_enabled
  // -----------------------------------------------------------------------

  const handleToggleSyncEnabled = async (enabled: boolean) => {
    if (!integration) return;
    try {
      const { error } = await supabase
        .from('calendar_integrations')
        .update({ sync_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
      setIntegration({ ...integration, sync_enabled: enabled });
      toast({
        title: enabled ? 'Sync enabled' : 'Sync disabled',
        description: enabled
          ? 'Tasks with due dates will sync to Google Calendar.'
          : 'Calendar sync paused.',
      });
    } catch (err: any) {
      toast({
        title: 'Could not update sync setting',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  // -----------------------------------------------------------------------
  // Manual sync
  // -----------------------------------------------------------------------

  const handleSyncNow = async () => {
    if (!integration) return;

    const eligible = tasks.filter((t) => t.due_date);
    if (eligible.length === 0) {
      toast({
        title: 'Nothing to sync',
        description: 'No tasks have a due date set.',
      });
      return;
    }

    setSyncing(true);
    setSyncResults(null);
    const results: SyncResult[] = [];
    let tokenExpired = false;

    for (const task of eligible) {
      try {
        const res = await fetch(
          `${GOOGLE_CALENDAR_API}/${encodeURIComponent(integration.calendar_id)}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: task.title,
              description: task.description || undefined,
              start: { date: task.due_date },
              end: { date: task.due_date },
            }),
          },
        );

        if (res.status === 401) {
          tokenExpired = true;
          results.push({
            taskId: task.id,
            title: task.title,
            success: false,
            error: 'Token expired',
          });
          break;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as any)?.error?.message || `HTTP ${res.status}`,
          );
        }

        results.push({ taskId: task.id, title: task.title, success: true });
      } catch (err: any) {
        results.push({
          taskId: task.id,
          title: task.title,
          success: false,
          error: err?.message || 'Unknown error',
        });
      }
    }

    setSyncResults(results);

    if (tokenExpired) {
      toast({
        title: 'Session expired',
        description:
          'Your Google token has expired. Please reconnect your account.',
        variant: 'destructive',
      });
      setSyncing(false);
      return;
    }

    // Update last_synced_at
    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('calendar_integrations')
        .update({ last_synced_at: now, updated_at: now })
        .eq('id', integration.id);
      if (!error) {
        setIntegration({ ...integration, last_synced_at: now });
      }
    } catch {
      // best-effort timestamp update
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    if (failed === 0) {
      toast({
        title: 'Sync complete',
        description: `${succeeded} task${succeeded === 1 ? '' : 's'} synced to Google Calendar.`,
      });
    } else {
      toast({
        title: 'Sync partially complete',
        description: `${succeeded} synced, ${failed} failed. See details below.`,
        variant: 'destructive',
      });
    }

    setSyncing(false);
  };

  // -----------------------------------------------------------------------
  // Disconnect
  // -----------------------------------------------------------------------

  const handleDisconnect = async () => {
    if (!integration) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('calendar_integrations')
        .delete()
        .eq('id', integration.id);
      if (error) throw error;
      setIntegration(null);
      setSyncResults(null);
      setConfirmDisconnect(false);
      toast({ title: 'Google Calendar disconnected' });
    } catch (err: any) {
      toast({
        title: 'Could not disconnect',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Token status
  // -----------------------------------------------------------------------

  const isTokenExpired =
    integration?.token_expires_at &&
    new Date(integration.token_expires_at).getTime() < Date.now();

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading calendar settings...
          </span>
        </CardContent>
      </Card>
    );
  }

  // ---- Not connected ----------------------------------------------------

  if (!integration) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            Sync tasks with due dates to your Google Calendar so nothing slips
            through the cracks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Not connected
              </p>
              <p className="text-muted-foreground mt-0.5">
                Connect your Google account to start syncing tasks with Google
                Calendar.
              </p>
            </div>
          </div>

          <Button onClick={handleConnect}>
            <Calendar className="h-4 w-4" />
            Connect Google Calendar
          </Button>

          {/* Setup instructions for when backend is not yet deployed */}
          <details className="group text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Settings className="h-3.5 w-3.5" />
              Backend not set up yet?
            </summary>
            <div className="mt-2 space-y-1.5 pl-5">
              <p>
                The OAuth endpoint at{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  /api/auth/google-calendar
                </code>{' '}
                needs to be deployed before this integration works.
              </p>
              <p>It should:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Redirect to Google OAuth consent screen</li>
                <li>
                  Exchange the authorization code for tokens
                </li>
                <li>
                  Store the tokens in the{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    calendar_integrations
                  </code>{' '}
                  table
                </li>
                <li>
                  Post a message back to the opener window via{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    postMessage
                  </code>
                </li>
              </ol>
            </div>
          </details>
        </CardContent>
      </Card>
    );
  }

  // ---- Connected --------------------------------------------------------

  const tasksWithDueDate = tasks.filter((t) => t.due_date).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Google Calendar
          </CardTitle>
          <Badge
            variant={isTokenExpired ? 'destructive' : 'default'}
            className={cn(
              !isTokenExpired &&
                'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
            )}
          >
            {isTokenExpired ? (
              <>
                <X className="h-3 w-3" /> Expired
              </>
            ) : (
              <>
                <Check className="h-3 w-3" /> Connected
              </>
            )}
          </Badge>
        </div>
        <CardDescription>
          Manage your Google Calendar sync settings.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Token expired warning */}
        {isTokenExpired && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-destructive shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-destructive">
                Token expired
              </p>
              <p className="text-muted-foreground mt-0.5">
                Your Google Calendar access has expired. Please reconnect to
                continue syncing.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={handleConnect}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reconnect
              </Button>
            </div>
          </div>
        )}

        {/* Connection info */}
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Calendar</span>
            <span className="font-medium truncate max-w-[220px]">
              {integration.calendar_id}
            </span>
          </div>
          {integration.last_synced_at && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last synced</span>
              <span className="font-medium">
                {relativeTime(integration.last_synced_at)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Tasks with due dates
            </span>
            <span className="font-medium">{tasksWithDueDate}</span>
          </div>
        </div>

        {/* Sync toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <label
                htmlFor="sync-enabled"
                className="text-sm font-medium cursor-pointer"
              >
                Sync tasks to Google Calendar
              </label>
              <p className="text-xs text-muted-foreground">
                Automatically sync tasks with due dates as all-day calendar
                events.
              </p>
            </div>
            <Switch
              id="sync-enabled"
              checked={integration.sync_enabled}
              onCheckedChange={handleToggleSyncEnabled}
              disabled={!!isTokenExpired}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <label
                htmlFor="two-way-sync"
                className="text-sm font-medium cursor-pointer"
              >
                Two-way sync
              </label>
              <p className="text-xs text-muted-foreground">
                Import Google Calendar events as tasks (coming soon).
              </p>
            </div>
            <Switch
              id="two-way-sync"
              checked={twoWaySync}
              onCheckedChange={setTwoWaySync}
              disabled={!!isTokenExpired}
            />
          </div>
        </div>

        {/* Sync now */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleSyncNow}
            disabled={syncing || !!isTokenExpired || tasksWithDueDate === 0}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncing ? 'Syncing...' : 'Sync now'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            asChild
          >
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              Open Calendar
            </a>
          </Button>
        </div>

        {/* Sync results */}
        {syncResults && syncResults.length > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-medium">Sync results</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {syncResults.map((r) => (
                <div
                  key={r.taskId}
                  className="flex items-center gap-2 text-xs"
                >
                  {r.success ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  <span className="truncate flex-1">{r.title}</span>
                  {r.error && (
                    <span className="text-destructive shrink-0">
                      {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disconnect */}
        <div className="pt-2 border-t border-border/40">
          {confirmDisconnect ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                This will remove the integration and stop all syncing. Events
                already in Google Calendar will not be deleted.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unlink className="h-4 w-4" />
                  )}
                  Yes, disconnect
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDisconnect(false)}
                  disabled={disconnecting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDisconnect(true)}
            >
              <Unlink className="h-4 w-4" />
              Disconnect Google Calendar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
