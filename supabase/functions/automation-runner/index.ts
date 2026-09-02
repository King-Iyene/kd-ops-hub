/**
 * Automation Runner Edge Function
 *
 * Executes automation actions when triggered by database events.
 * Called via webhook from Supabase Realtime or directly from the client
 * when a record event occurs (create, update, delete).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

interface AutomationAction {
  id: string;
  type: 'send_email' | 'send_webhook' | 'update_record' | 'create_record' | 'send_notification';
  config: Record<string, any>;
}

interface Automation {
  id: string;
  base_id: string;
  table_id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  actions: AutomationAction[];
}

async function executeAction(
  action: AutomationAction,
  context: {
    record: Record<string, any>;
    oldRecord?: Record<string, any>;
    supabase: ReturnType<typeof createClient>;
    schemaName: string;
    tableName: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.type) {
      case 'send_webhook': {
        const { url, method = 'POST', headers = {} } = action.config;
        if (!url) return { success: false, error: 'No webhook URL configured' };

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            event: 'automation_trigger',
            record: context.record,
            old_record: context.oldRecord,
            timestamp: new Date().toISOString(),
          }),
        });

        return { success: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` };
      }

      case 'update_record': {
        const { field, value } = action.config;
        if (!field || !context.record.id) return { success: false, error: 'Missing field or record ID' };

        const { error } = await context.supabase
          .schema(context.schemaName)
          .from(context.tableName)
          .update({ [field]: value })
          .eq('id', context.record.id);

        return { success: !error, error: error?.message };
      }

      case 'create_record': {
        const { data: recordData } = action.config;
        if (!recordData) return { success: false, error: 'No record data configured' };

        const { error } = await context.supabase
          .schema(context.schemaName)
          .from(context.tableName)
          .insert(recordData);

        return { success: !error, error: error?.message };
      }

      case 'send_notification': {
        const { message } = action.config;
        console.log(`[Automation Notification] ${message ?? 'No message'}`);
        return { success: true };
      }

      case 'send_email': {
        const { to, subject, body } = action.config;
        console.log(`[Automation Email] To: ${to}, Subject: ${subject}, Body: ${body}`);
        return { success: true };
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });

  try {
    const body = await req.json();
    const { event, baseId, tableId, record, oldRecord } = body;

    if (!event || !baseId || !tableId) {
      return json({ success: false, error: 'Missing required fields: event, baseId, tableId' }, 400);
    }

    // Map event to trigger_type
    const triggerMap: Record<string, string> = {
      'record.created': 'record_created',
      'record.updated': 'record_updated',
      'record.deleted': 'record_deleted',
    };
    const triggerType = triggerMap[event];
    if (!triggerType) {
      return json({ success: false, error: `Unknown event type: ${event}` }, 400);
    }

    // Fetch enabled automations for this table/trigger
    const { data: automations, error: autoErr } = await supabase
      .schema('nc_meta')
      .from('automations')
      .select('*')
      .eq('table_id', tableId)
      .eq('trigger_type', triggerType)
      .eq('enabled', true);

    if (autoErr) throw autoErr;
    if (!automations || automations.length === 0) {
      return json({ success: true, message: 'No matching automations', executed: 0 });
    }

    // Resolve schema/table names
    const { data: base } = await supabase
      .schema('nc_meta')
      .from('bases')
      .select('schema_name')
      .eq('id', baseId)
      .single();

    const { data: table } = await supabase
      .schema('nc_meta')
      .from('tables')
      .select('pg_table_name')
      .eq('id', tableId)
      .single();

    if (!base || !table) {
      return json({ success: false, error: 'Could not resolve base/table' }, 404);
    }

    const results: Array<{ automationId: string; name: string; actions: Array<{ actionId: string; success: boolean; error?: string }> }> = [];

    for (const automation of automations as Automation[]) {
      // Check field_changed trigger config
      if (automation.trigger_type === 'field_changed' && automation.trigger_config.field) {
        const watchedField = automation.trigger_config.field;
        if (!oldRecord || record?.[watchedField] === oldRecord?.[watchedField]) {
          continue;
        }
      }

      const actionResults: Array<{ actionId: string; success: boolean; error?: string }> = [];

      for (const action of automation.actions) {
        const result = await executeAction(action, {
          record: record ?? {},
          oldRecord,
          supabase,
          schemaName: base.schema_name,
          tableName: table.pg_table_name,
        });
        actionResults.push({ actionId: action.id, ...result });
      }

      results.push({
        automationId: automation.id,
        name: automation.name,
        actions: actionResults,
      });
    }

    return json({
      success: true,
      executed: results.length,
      results,
    });
  } catch (err) {
    console.error('Automation runner error:', err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
