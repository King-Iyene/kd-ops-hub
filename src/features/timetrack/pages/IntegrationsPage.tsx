import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plug, ExternalLink, Webhook, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { EVENT_GROUPS, EVENT_HINTS } from '@/features/developer/webhookEvents';

const PLATFORM_SENTINEL = '00000000-0000-0000-0000-000000000000';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  failure_count?: number;
  last_triggered_at?: string | null;
}

const TIME_TRACKING_GROUP = EVENT_GROUPS.find((g) => g.module === 'Time Tracking');
const TIME_TRACKING_EVENTS = TIME_TRACKING_GROUP?.events ?? [];

export default function IntegrationsPage() {
  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['platform-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('webhooks')
        .select('id, name, url, events, is_active, failure_count, last_triggered_at')
        .eq('base_id', PLATFORM_SENTINEL)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WebhookRow[];
    },
  });

  // Webhooks that subscribe to at least one Time Tracking event.
  const relevantWebhooks = (webhooks ?? []).filter((w) =>
    w.events?.some((e) => TIME_TRACKING_EVENTS.includes(e))
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Integrations"
        description="Send time entries, timers and attendance events to external systems via outbound webhooks"
        icon={Plug}
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Webhook className="h-4 w-4" />
                Outbound webhooks
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-prose">
                Time Tracking fires generic platform webhooks — the same system every other module uses
                (Employees, Tasks, Payroll, etc). There's no separate time-tracking-only webhook
                infrastructure: configure, test and monitor deliveries from Developer&nbsp;Hub, and they'll
                show up here too.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/developer?tab=webhooks">
                Manage in Developer Hub <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Events this module can fire</p>
            <div className="flex flex-wrap gap-1.5">
              {TIME_TRACKING_EVENTS.map((event) => (
                <Badge key={event} variant="outline" className="font-mono text-3xs" title={EVENT_HINTS[event]}>
                  {event}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Webhooks currently subscribed to a Time Tracking event
            </p>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : relevantWebhooks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No webhooks are subscribed to a Time Tracking event yet. Create one in Developer Hub and
                pick from the events listed above.
              </p>
            ) : (
              <div className="space-y-2">
                {relevantWebhooks.map((w) => (
                  <div key={w.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium">
                        {w.is_active ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{w.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate font-mono">{w.url}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[50%]">
                      {w.events.filter((e) => TIME_TRACKING_EVENTS.includes(e)).map((e) => (
                        <Badge key={e} variant="secondary" className="font-mono text-3xs">{e}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
