/**
 * Automation Runner Edge Function
 *
 * Executes automation actions when triggered by database events.
 * Called via webhook from Supabase Realtime or directly from the client
 * when a record event occurs (create, update, delete).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

function json(body: Record<string, unknown>, status = 200, req?: Request): Response {
  const cors = req ? getCorsHeaders(req) : { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

interface AutomationCondition {
  field_id: string;
  operator: string;
  value?: unknown;
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

function evaluateCondition(record: Record<string, any>, cond: AutomationCondition, fieldMap: Map<string, string>): boolean {
  const colName = fieldMap.get(cond.field_id) ?? cond.field_id;
  const val = record[colName];

  switch (cond.operator) {
    case 'equals':
      return String(val) === String(cond.value);
    case 'not_equals':
      return String(val) !== String(cond.value);
    case 'contains':
      return typeof val === 'string' && typeof cond.value === 'string' && val.toLowerCase().includes(cond.value.toLowerCase());
    case 'not_contains':
      return typeof val === 'string' && typeof cond.value === 'string' && !val.toLowerCase().includes(cond.value.toLowerCase());
    case 'is_empty':
      return val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
    case 'is_not_empty':
      return val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0);
    case 'greater_than':
      return Number(val) > Number(cond.value);
    case 'less_than':
      return Number(val) < Number(cond.value);
    case 'greater_or_equal':
      return Number(val) >= Number(cond.value);
    case 'less_or_equal':
      return Number(val) <= Number(cond.value);
    default:
      return false;
  }
}

function evaluateConditions(record: Record<string, any>, conditions: AutomationCondition[], fieldMap: Map<string, string>, logic: string = 'AND'): boolean {
  if (!conditions || conditions.length === 0) return true;
  if (logic === 'OR') return conditions.some(c => evaluateCondition(record, c, fieldMap));
  return conditions.every(c => evaluateCondition(record, c, fieldMap));
}

async function resolveFieldMap(supabase: ReturnType<typeof createClient>, tableId: string): Promise<Map<string, string>> {
  const { data: fields } = await supabase
    .schema('nc_meta')
    .from('fields')
    .select('id, pg_column_name')
    .eq('table_id', tableId);

  const map = new Map<string, string>();
  if (fields) {
    for (const f of fields) {
      map.set(f.id, f.pg_column_name);
    }
  }
  return map;
}

async function executeAction(
  action: AutomationAction,
  context: {
    record: Record<string, any>;
    oldRecord?: Record<string, any>;
    supabase: ReturnType<typeof createClient>;
    schemaName: string;
    tableName: string;
    fieldMap: Map<string, string>;
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
          signal: AbortSignal.timeout(10_000),
        });

        return { success: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` };
      }

      case 'update_record': {
        const { field_id, value, target_table_id } = action.config;
        if (!field_id) return { success: false, error: 'No field configured' };

        const colName = context.fieldMap.get(field_id) ?? field_id;
        const recordId = context.record.id;
        if (!recordId) return { success: false, error: 'No record ID' };

        if (target_table_id && target_table_id !== '') {
          const { data: targetTable } = await context.supabase
            .schema('nc_meta')
            .from('tables')
            .select('pg_table_name')
            .eq('id', target_table_id)
            .single();

          if (!targetTable) return { success: false, error: 'Target table not found' };

          const targetFieldMap = await resolveFieldMap(context.supabase, target_table_id);
          const targetCol = targetFieldMap.get(field_id) ?? field_id;

          const { error } = await context.supabase
            .schema(context.schemaName)
            .from(targetTable.pg_table_name)
            .update({ [targetCol]: value })
            .eq('id', recordId);

          return { success: !error, error: error?.message };
        }

        const { error } = await context.supabase
          .schema(context.schemaName)
          .from(context.tableName)
          .update({ [colName]: value })
          .eq('id', recordId);

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
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ success: false, error: 'Missing authorization' }, 401, req);
  }
  const bearer = authHeader.slice(7);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser(bearer);
  if (authError || !userData?.user) {
    return json({ success: false, error: 'Invalid or expired session' }, 401, req);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });

  try {
    const body = await req.json();
    const { event, baseId, tableId, record, oldRecord } = body;

    if (!event || !baseId || !tableId) {
      return json({ success: false, error: 'Missing required fields: event, baseId, tableId' }, 400);
    }

    const triggerMap: Record<string, string> = {
      'record.created': 'record_created',
      'record.updated': 'record_updated',
      'record.deleted': 'record_deleted',
    };
    const triggerType = triggerMap[event];
    if (!triggerType) {
      return json({ success: false, error: `Unknown event type: ${event}` }, 400);
    }

    // Fetch ALL enabled automations for this table (including record_matches_conditions)
    const triggerTypes = [triggerType];
    if (triggerType === 'record_created' || triggerType === 'record_updated') {
      triggerTypes.push('record_matches_conditions');
    }

    const { data: automations, error: autoErr } = await supabase
      .schema('nc_meta')
      .from('automations')
      .select('*')
      .eq('table_id', tableId)
      .in('trigger_type', triggerTypes)
      .eq('enabled', true);

    if (autoErr) throw autoErr;
    if (!automations || automations.length === 0) {
      return json({ success: true, message: 'No matching automations', executed: 0 });
    }

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

    const fieldMap = await resolveFieldMap(supabase, tableId);

    const results: Array<{ automationId: string; name: string; actions: Array<{ actionId: string; success: boolean; error?: string }> }> = [];

    for (const automation of automations as Automation[]) {
      // field_changed: skip if watched field didn't change
      if (automation.trigger_type === 'field_changed' && automation.trigger_config.field_id) {
        const watchedCol = fieldMap.get(automation.trigger_config.field_id) ?? automation.trigger_config.field_id;
        if (!oldRecord || record?.[watchedCol] === oldRecord?.[watchedCol]) {
          continue;
        }
      }

      // record_matches_conditions: evaluate conditions against the record
      if (automation.trigger_type === 'record_matches_conditions') {
        const conditions = automation.trigger_config.conditions as AutomationCondition[] | undefined;
        const logic = (automation.trigger_config.logic as string) ?? 'AND';
        if (!evaluateConditions(record ?? {}, conditions ?? [], fieldMap, logic)) {
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
          fieldMap,
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
