/**
 * Automation Runner Edge Function
 *
 * Executes automation actions when triggered by database events.
 * Called from the client when a record event occurs (create, update, delete).
 *
 * Features:
 * - Condition evaluation with transition semantics (record_matches_conditions)
 * - Run history logging to nc_meta.automation_runs
 * - update_record action with link-field and self-reference support
 * - field_changed trigger type
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
    tableId: string;
    fieldMap: Map<string, string>;
  },
): Promise<{ success: boolean; error?: string; durationMs: number }> {
  const start = Date.now();
  try {
    switch (action.type) {
      case 'send_webhook': {
        const { url, method = 'POST', headers = {} } = action.config;
        if (!url) return { success: false, error: 'No webhook URL configured', durationMs: Date.now() - start };

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            event: 'automation_trigger',
            record: context.record,
            old_record: context.oldRecord,
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(10_000),
        });

        return { success: response.ok, error: response.ok ? undefined : `HTTP ${response.status}`, durationMs: Date.now() - start };
      }

      case 'update_record': {
        const {
          field_id,
          value,
          value_source,
          source_field_id,
          target_table_id,
          record_id: configRecordId,
          custom_record_id,
          fields: updateFields,
        } = action.config;

        const effectiveRecordId = configRecordId === '_custom' ? custom_record_id : configRecordId;
        const recordId = effectiveRecordId === '{{record.id}}' || !effectiveRecordId
          ? context.record.id
          : effectiveRecordId;

        if (!recordId) return { success: false, error: 'No record ID', durationMs: Date.now() - start };

        const effectiveTableId = target_table_id || context.tableId;
        let targetSchema = context.schemaName;
        let targetTable = context.tableName;

        if (target_table_id && target_table_id !== context.tableId) {
          const { data: tbl } = await context.supabase
            .schema('nc_meta')
            .from('tables')
            .select('pg_table_name, base_id')
            .eq('id', target_table_id)
            .single();
          if (!tbl) return { success: false, error: 'Target table not found', durationMs: Date.now() - start };
          targetTable = tbl.pg_table_name;

          const { data: base } = await context.supabase
            .schema('nc_meta')
            .from('bases')
            .select('schema_name')
            .eq('id', tbl.base_id)
            .single();
          if (base) targetSchema = base.schema_name;
        }

        const targetFieldMap = effectiveTableId !== context.tableId
          ? await resolveFieldMap(context.supabase, effectiveTableId)
          : context.fieldMap;

        let updates: Record<string, any> = {};

        if (updateFields && typeof updateFields === 'object') {
          for (const [fid, val] of Object.entries(updateFields)) {
            const col = targetFieldMap.get(fid) ?? fid;
            updates[col] = val;
          }
        } else if (field_id) {
          const col = targetFieldMap.get(field_id) ?? field_id;
          let resolvedValue = value;
          if (value_source === 'field' && source_field_id) {
            const srcCol = context.fieldMap.get(source_field_id) ?? source_field_id;
            resolvedValue = context.record[srcCol];
          } else if (value_source === 'record_id') {
            resolvedValue = context.record.id;
          }
          updates[col] = resolvedValue;
        }

        if (Object.keys(updates).length === 0) {
          return { success: false, error: 'No fields to update', durationMs: Date.now() - start };
        }

        updates.updated_at = new Date().toISOString();

        const { error } = await context.supabase
          .schema(targetSchema)
          .from(targetTable)
          .update(updates)
          .eq('id', recordId);

        return { success: !error, error: error?.message, durationMs: Date.now() - start };
      }

      case 'create_record': {
        const { target_table_id, fields: createFields, data: recordData } = action.config;

        let targetSchema = context.schemaName;
        let targetTable = context.tableName;

        if (target_table_id && target_table_id !== context.tableId) {
          const { data: tbl } = await context.supabase
            .schema('nc_meta')
            .from('tables')
            .select('pg_table_name, base_id')
            .eq('id', target_table_id)
            .single();
          if (!tbl) return { success: false, error: 'Target table not found', durationMs: Date.now() - start };
          targetTable = tbl.pg_table_name;

          const { data: base } = await context.supabase
            .schema('nc_meta')
            .from('bases')
            .select('schema_name')
            .eq('id', tbl.base_id)
            .single();
          if (base) targetSchema = base.schema_name;
        }

        // Resolve field map for the target table (may differ from source)
        const targetFieldMap = (target_table_id && target_table_id !== context.tableId)
          ? await resolveFieldMap(context.supabase, target_table_id)
          : context.fieldMap;

        let insertData = createFields ?? recordData ?? {};

        const fieldPairs: { field_id: string; value: string }[] = action.config.field_pairs;
        if (Array.isArray(fieldPairs) && fieldPairs.length > 0) {
          const pairData: Record<string, unknown> = {};
          for (const pair of fieldPairs) {
            if (!pair.field_id) continue;
            const col = targetFieldMap.get(pair.field_id) ?? pair.field_id;
            pairData[col] = pair.value;
          }
          insertData = pairData;
        }

        const { error } = await context.supabase
          .schema(targetSchema)
          .from(targetTable)
          .insert(insertData);

        return { success: !error, error: error?.message, durationMs: Date.now() - start };
      }

      case 'send_notification': {
        const { message, title: notifTitle, recipients } = action.config;
        const notifText = message ?? 'Automation triggered';

        // Insert into the real notifications table so NotificationBell picks it up
        const recipientIds: string[] = Array.isArray(recipients) ? recipients : [];
        if (recipientIds.length === 0) {
          // No specific recipients — log only
          console.log(`[Automation Notification] ${notifText}`);
          return { success: true, durationMs: Date.now() - start };
        }

        const rows = recipientIds.map((uid: string) => ({
          user_id: uid,
          type: 'automation',
          module: 'automation',
          title: notifTitle ?? 'Automation',
          body: notifText,
          read: false,
        }));

        const { error: nErr } = await context.supabase.from('notifications').insert(rows);
        return { success: !nErr, error: nErr?.message, durationMs: Date.now() - start };
      }

      case 'send_email': {
        const { to, subject, body } = action.config;
        console.log(`[Automation Email] To: ${to}, Subject: ${subject}, Body: ${body}`);
        return { success: true, durationMs: Date.now() - start };
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}`, durationMs: Date.now() - start };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message, durationMs: Date.now() - start };
  }
}

async function logRun(
  supabase: ReturnType<typeof createClient>,
  automationId: string,
  triggerEvent: string,
  recordId: string | null,
  status: string,
  startedAt: Date,
  actionResults: Array<{ actionId: string; type: string; success: boolean; error?: string; durationMs: number }>,
  errorMessage?: string,
  context?: Record<string, any>,
) {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  try {
    await supabase.schema('nc_meta').from('automation_runs').insert({
      automation_id: automationId,
      trigger_event: triggerEvent,
      record_id: recordId,
      status,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      action_results: actionResults,
      error_message: errorMessage,
      context: context ?? {},
    });

    // Atomic increment via rpc to avoid race conditions on run_count
    await supabase.rpc('increment_automation_run_count', {
      p_automation_id: automationId,
      p_last_run_at: finishedAt.toISOString(),
      p_last_error: errorMessage ?? null,
    }).then(({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback: non-atomic update if RPC doesn't exist yet
        return supabase.schema('nc_meta').from('automations').update({
          run_count: 1, // At least mark it ran
          last_run_at: finishedAt.toISOString(),
          last_error: errorMessage ?? null,
        }).eq('id', automationId);
      }
    });
  } catch (err) {
    console.error('Failed to log automation run:', err);
  }
}

async function checkTransition(
  supabase: ReturnType<typeof createClient>,
  automationId: string,
  recordId: string,
  nowMatches: boolean,
): Promise<boolean> {
  const { data: existing } = await supabase
    .schema('nc_meta')
    .from('automation_condition_state')
    .select('matched')
    .eq('automation_id', automationId)
    .eq('record_id', recordId)
    .maybeSingle();

  const previouslyMatched = existing?.matched ?? false;

  // Upsert the new state
  await supabase.schema('nc_meta').from('automation_condition_state').upsert(
    { automation_id: automationId, record_id: recordId, matched: nowMatches, checked_at: new Date().toISOString() },
    { onConflict: 'automation_id,record_id' },
  );

  // Transition: was false, now true
  return !previouslyMatched && nowMatches;
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

  // Allow service role key as bearer for cron/internal calls
  const isServiceCall = bearer === serviceRoleKey;

  if (!isServiceCall) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser(bearer);
    if (authError || !userData?.user) {
      return json({ success: false, error: 'Invalid or expired session' }, 401, req);
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });

  try {
    const body = await req.json();
    const { event, baseId, tableId, record, oldRecord, _testAutomationId } = body;

    if (!event || !baseId || !tableId) {
      return json({ success: false, error: 'Missing required fields: event, baseId, tableId' }, 400, req);
    }

    const triggerMap: Record<string, string> = {
      'record.created': 'record_created',
      'record.updated': 'record_updated',
      'record.deleted': 'record_deleted',
    };
    const triggerType = triggerMap[event];
    if (!triggerType) {
      return json({ success: false, error: `Unknown event type: ${event}` }, 400, req);
    }

    // Fetch ALL enabled automations for this table
    const triggerTypes = [triggerType];
    if (triggerType === 'record_created' || triggerType === 'record_updated') {
      triggerTypes.push('record_matches_conditions');
    }
    if (triggerType === 'record_updated') {
      triggerTypes.push('field_changed');
    }

    let automationQuery = supabase
      .schema('nc_meta')
      .from('automations')
      .select('*')
      .eq('table_id', tableId);

    if (_testAutomationId) {
      // Test run: only run the specific automation, regardless of enabled state
      automationQuery = automationQuery.eq('id', _testAutomationId);
    } else {
      automationQuery = automationQuery.in('trigger_type', triggerTypes).eq('enabled', true);
    }

    const { data: automations, error: autoErr } = await automationQuery;

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
      return json({ success: false, error: 'Could not resolve base/table' }, 404, req);
    }

    const fieldMap = await resolveFieldMap(supabase, tableId);

    const results: Array<{ automationId: string; name: string; status: string; actions: Array<{ actionId: string; type: string; success: boolean; error?: string; durationMs: number }> }> = [];

    for (const automation of automations as Automation[]) {
      const runStart = new Date();
      const conditions = automation.trigger_config.conditions as AutomationCondition[] | undefined;
      const logic = (automation.trigger_config.logic as string) ?? 'AND';

      // field_changed: skip if watched field didn't change
      if (automation.trigger_type === 'field_changed' && automation.trigger_config.field_id) {
        const watchedCol = fieldMap.get(automation.trigger_config.field_id) ?? automation.trigger_config.field_id;
        if (!oldRecord || record?.[watchedCol] === oldRecord?.[watchedCol]) {
          continue;
        }
      }

      // record_matches_conditions: evaluate with TRANSITION semantic
      if (automation.trigger_type === 'record_matches_conditions') {
        const nowMatches = evaluateConditions(record ?? {}, conditions ?? [], fieldMap, logic);
        const recordId = record?.id;

        if (recordId) {
          const isTransition = await checkTransition(supabase, automation.id, recordId, nowMatches);
          if (!isTransition) {
            continue; // Not a transition — skip
          }
        } else if (!nowMatches) {
          continue;
        }
      }

      // For other trigger types with conditions, just evaluate directly
      if (automation.trigger_type !== 'record_matches_conditions' && conditions && conditions.length > 0) {
        if (!evaluateConditions(record ?? {}, conditions, fieldMap, logic)) {
          continue;
        }
      }

      const actionResults: Array<{ actionId: string; type: string; success: boolean; error?: string; durationMs: number }> = [];

      for (const action of automation.actions) {
        const result = await executeAction(action, {
          record: record ?? {},
          oldRecord,
          supabase,
          schemaName: base.schema_name,
          tableName: table.pg_table_name,
          tableId,
          fieldMap,
        });
        actionResults.push({ actionId: action.id, type: action.type, ...result });
      }

      const allSuccess = actionResults.every(r => r.success);
      const anySuccess = actionResults.some(r => r.success);
      const runStatus = actionResults.length === 0 ? 'success'
        : allSuccess ? 'success'
        : anySuccess ? 'partial'
        : 'error';

      const errorMsg = actionResults.filter(r => !r.success).map(r => r.error).join('; ') || undefined;

      // Log run asynchronously — don't block the response
      logRun(
        supabase,
        automation.id,
        event,
        record?.id ?? null,
        runStatus,
        runStart,
        actionResults,
        errorMsg,
        { record_id: record?.id },
      );

      results.push({
        automationId: automation.id,
        name: automation.name,
        status: runStatus,
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
    return json({ success: false, error: (err as Error).message }, 500, req);
  }
});
