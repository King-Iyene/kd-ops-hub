/**
 * REST API Edge Function
 *
 * Public Airtable-compatible REST API for KDOps.
 * Authenticates via API keys (Bearer kdops_xxx), not user sessions.
 *
 * Routes:
 *   GET    /v1/bases
 *   GET    /v1/bases/:baseId/tables
 *   GET    /v1/bases/:baseId/tables/:tableId/records
 *   GET    /v1/bases/:baseId/tables/:tableId/records/:recordId
 *   POST   /v1/bases/:baseId/tables/:tableId/records
 *   PATCH  /v1/bases/:baseId/tables/:tableId/records
 *   DELETE /v1/bases/:baseId/tables/:tableId/records
 */

import { Pool } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';
import { encodeHex } from 'https://deno.land/std@0.224.0/encoding/hex.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(message: string, status: number) {
  return json({ error: { type: status === 422 ? 'INVALID_REQUEST_UNKNOWN' : 'AUTHENTICATION_REQUIRED', message } }, status);
}

const ID_RE = /^[a-z][a-z0-9_]*$/;
function safeId(name: string): string {
  if (!ID_RE.test(name) || name.length > 63) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Auth ----------

interface ApiKeyInfo {
  workspace_id: string;
  scopes: string[];
  key_id: string;
}

async function hashKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return encodeHex(new Uint8Array(buf));
}

async function authenticateApiKey(pool: Pool, authHeader: string | null): Promise<ApiKeyInfo> {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing API key');
  const raw = authHeader.slice(7);
  if (!raw.startsWith('kdops_')) throw new Error('Invalid API key format');

  const hash = await hashKey(raw);
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{
      id: string; workspace_id: string; scopes: string[];
    }>(
      `SELECT id, workspace_id, scopes FROM nc_meta.api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())`,
      [hash],
    );
    if (!rows.length) throw new Error('Invalid or revoked API key');

    // Update last_used_at (fire-and-forget)
    conn.queryObject(`UPDATE nc_meta.api_keys SET last_used_at = now() WHERE id = $1`, [rows[0].id]).catch(() => {});

    return { workspace_id: rows[0].workspace_id, scopes: rows[0].scopes, key_id: rows[0].id };
  } finally {
    conn.release();
  }
}

// ---------- Router ----------

interface Route {
  baseId?: string;
  tableId?: string;
  recordId?: string;
  resource: 'bases' | 'tables' | 'records' | 'record';
}

function parseRoute(pathname: string): Route | null {
  // Strip /rest-api prefix if present (Supabase function routing)
  const path = pathname.replace(/^\/rest-api/, '');
  const parts = path.split('/').filter(Boolean);

  // /v1/bases
  if (parts[0] === 'v1' && parts[1] === 'bases' && parts.length === 2) {
    return { resource: 'bases' };
  }
  // /v1/bases/:baseId/tables
  if (parts[0] === 'v1' && parts[1] === 'bases' && parts[3] === 'tables' && parts.length === 4) {
    return { baseId: parts[2], resource: 'tables' };
  }
  // /v1/bases/:baseId/tables/:tableId/records/:recordId
  if (parts[0] === 'v1' && parts[1] === 'bases' && parts[3] === 'tables' && parts[5] === 'records' && parts.length === 7) {
    return { baseId: parts[2], tableId: parts[4], recordId: parts[6], resource: 'record' };
  }
  // /v1/bases/:baseId/tables/:tableId/records
  if (parts[0] === 'v1' && parts[1] === 'bases' && parts[3] === 'tables' && parts[5] === 'records' && parts.length === 6) {
    return { baseId: parts[2], tableId: parts[4], resource: 'records' };
  }
  return null;
}

// ---------- Helpers ----------

interface FieldMeta {
  name: string;
  pg_column_name: string;
  ui_type: string;
  pg_type: string;
  is_system: boolean;
  is_hidden: boolean;
}

async function resolveBase(pool: Pool, workspaceId: string, baseIdOrSlug: string) {
  const conn = await pool.connect();
  try {
    const isUuid = UUID_RE.test(baseIdOrSlug);
    const { rows } = await conn.queryObject<{ id: string; name: string; schema_name: string; slug: string }>(
      `SELECT id, name, schema_name, slug FROM nc_meta.bases
       WHERE workspace_id = $1 AND ${isUuid ? 'id' : 'slug'} = $2`,
      [workspaceId, baseIdOrSlug],
    );
    return rows[0] ?? null;
  } finally {
    conn.release();
  }
}

async function resolveTable(pool: Pool, baseId: string, tableIdOrSlug: string) {
  const conn = await pool.connect();
  try {
    const isUuid = UUID_RE.test(tableIdOrSlug);
    const { rows } = await conn.queryObject<{ id: string; name: string; pg_table_name: string; slug: string }>(
      `SELECT id, name, pg_table_name, slug FROM nc_meta.tables
       WHERE base_id = $1 AND ${isUuid ? 'id' : 'slug'} = $2`,
      [baseId, tableIdOrSlug],
    );
    return rows[0] ?? null;
  } finally {
    conn.release();
  }
}

async function getFields(pool: Pool, tableId: string): Promise<FieldMeta[]> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<FieldMeta>(
      `SELECT name, pg_column_name, ui_type, pg_type, is_system, is_hidden
       FROM nc_meta.fields WHERE table_id = $1 ORDER BY position`,
      [tableId],
    );
    return rows;
  } finally {
    conn.release();
  }
}

function pgRowToFields(row: Record<string, unknown>, fields: FieldMeta[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.is_system || f.is_hidden) continue;
    const val = row[f.pg_column_name];
    if (val !== null && val !== undefined) {
      out[f.name] = val;
    }
  }
  return out;
}

function fieldsToRow(input: Record<string, unknown>, fields: FieldMeta[]): Record<string, unknown> {
  const nameToCol = new Map(fields.filter(f => !f.is_system).map(f => [f.name, f.pg_column_name]));
  const row: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(input)) {
    const col = nameToCol.get(name);
    if (col) row[col] = value;
  }
  return row;
}

// ---------- Handlers ----------

async function handleListBases(pool: Pool, auth: ApiKeyInfo) {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject(
      `SELECT b.id, b.name, b.slug, b.icon, b.color,
              (SELECT count(*) FROM nc_meta.tables t WHERE t.base_id = b.id)::int AS table_count
       FROM nc_meta.bases b WHERE b.workspace_id = $1 ORDER BY b.position`,
      [auth.workspace_id],
    );
    return json({ bases: rows });
  } finally {
    conn.release();
  }
}

async function handleListTables(pool: Pool, auth: ApiKeyInfo, baseIdOrSlug: string) {
  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);

  const conn = await pool.connect();
  try {
    const { rows: tables } = await conn.queryObject(
      `SELECT t.id, t.name, t.slug, t.pg_table_name,
              json_agg(json_build_object(
                'id', f.id, 'name', f.name, 'type', f.ui_type,
                'pg_column_name', f.pg_column_name, 'pg_type', f.pg_type,
                'is_system', f.is_system, 'is_hidden', f.is_hidden
              ) ORDER BY f.position) AS fields
       FROM nc_meta.tables t
       LEFT JOIN nc_meta.fields f ON f.table_id = t.id
       WHERE t.base_id = $1
       GROUP BY t.id ORDER BY t.position`,
      [base.id],
    );
    return json({ tables });
  } finally {
    conn.release();
  }
}

async function handleListRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string,
  url: URL,
) {
  if (!auth.scopes.includes('records:read')) return err('Scope records:read required', 403);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);
  const fields = await getFields(pool, table.id);

  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '100', 10) || 100, 1000);
  const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : 0;

  // Sort
  const sortParam = url.searchParams.getAll('sort');
  let orderClause = 'ORDER BY "nc_order" ASC NULLS LAST, "created_at" ASC';
  if (sortParam.length) {
    const parts = sortParam.map(s => {
      const [fieldName, dir] = s.split(':');
      const f = fields.find(f => f.name === fieldName);
      if (!f) return null;
      return `${safeId(f.pg_column_name)} ${dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
    }).filter(Boolean);
    if (parts.length) orderClause = `ORDER BY ${parts.join(', ')}`;
  }

  // Filter
  let whereClause = '';
  const whereParams: unknown[] = [];
  const filterFields = url.searchParams.getAll('filter');
  if (filterFields.length) {
    const clauses: string[] = [];
    for (const fStr of filterFields) {
      const match = fStr.match(/^(.+?)\s+(eq|neq|gt|gte|lt|lte|contains)\s+(.+)$/);
      if (!match) continue;
      const [, fieldName, op, val] = match;
      const f = fields.find(f => f.name === fieldName);
      if (!f) continue;
      const col = safeId(f.pg_column_name);
      const pidx = whereParams.length + 1;
      switch (op) {
        case 'eq': clauses.push(`${col} = $${pidx}`); whereParams.push(val); break;
        case 'neq': clauses.push(`${col} != $${pidx}`); whereParams.push(val); break;
        case 'gt': clauses.push(`${col} > $${pidx}`); whereParams.push(val); break;
        case 'gte': clauses.push(`${col} >= $${pidx}`); whereParams.push(val); break;
        case 'lt': clauses.push(`${col} < $${pidx}`); whereParams.push(val); break;
        case 'lte': clauses.push(`${col} <= $${pidx}`); whereParams.push(val); break;
        case 'contains': clauses.push(`${col}::text ILIKE $${pidx}`); whereParams.push(`%${val}%`); break;
      }
    }
    if (clauses.length) whereClause = `WHERE ${clauses.join(' AND ')}`;
  }

  const schema = safeId(base.schema_name);
  const tbl = safeId(table.pg_table_name);
  const fqn = `${schema}.${tbl}`;

  const conn = await pool.connect();
  try {
    const limitIdx = whereParams.length + 1;
    const offsetIdx = whereParams.length + 2;

    const { rows } = await conn.queryObject(
      `SELECT * FROM ${fqn} ${whereClause} ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...whereParams, pageSize + 1, offset],
    );

    const hasMore = rows.length > pageSize;
    const returnRows = hasMore ? rows.slice(0, pageSize) : rows;

    const records = returnRows.map((row: any) => ({
      id: row.id,
      createdTime: row.created_at,
      fields: pgRowToFields(row, fields),
    }));

    const result: Record<string, unknown> = { records };
    if (hasMore) {
      result.offset = String(offset + pageSize);
    }
    return json(result);
  } finally {
    conn.release();
  }
}

async function handleGetRecord(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, recordId: string,
) {
  if (!auth.scopes.includes('records:read')) return err('Scope records:read required', 403);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);
  const fields = await getFields(pool, table.id);

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject(`SELECT * FROM ${fqn} WHERE "id" = $1`, [recordId]);
    if (!rows.length) return err('Record not found', 404);
    const row: any = rows[0];
    return json({
      id: row.id,
      createdTime: row.created_at,
      fields: pgRowToFields(row, fields),
    });
  } finally {
    conn.release();
  }
}

async function handleCreateRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, body: any,
) {
  if (!auth.scopes.includes('records:write')) return err('Scope records:write required', 403);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);
  const fieldMeta = await getFields(pool, table.id);

  const inputRecords = body?.records;
  if (!Array.isArray(inputRecords) || !inputRecords.length) {
    return err('records array required', 422);
  }
  if (inputRecords.length > 10) {
    return err('Max 10 records per request', 422);
  }

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');
    const created: any[] = [];
    for (const rec of inputRecords) {
      const row = fieldsToRow(rec.fields || {}, fieldMeta);
      const keys = Object.keys(row);
      if (!keys.length) {
        const r = await conn.queryObject(`INSERT INTO ${fqn} DEFAULT VALUES RETURNING *`);
        created.push(r.rows[0]);
        continue;
      }
      const cols = keys.map(k => safeId(k)).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const vals = keys.map(k => row[k]);
      const r = await conn.queryObject(
        `INSERT INTO ${fqn} (${cols}) VALUES (${placeholders}) RETURNING *`, vals,
      );
      created.push(r.rows[0]);
    }
    await conn.queryObject('COMMIT');

    const result = created.map((row: any) => ({
      id: row.id,
      createdTime: row.created_at,
      fields: pgRowToFields(row, fieldMeta),
    }));

    dispatchWebhooks(pool, base.id, table.id, table.name, 'record.created', { records: result });

    return json({ records: result }, 201);
  } catch (e) {
    await conn.queryObject('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function handleUpdateRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, body: any,
) {
  if (!auth.scopes.includes('records:write')) return err('Scope records:write required', 403);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);
  const fieldMeta = await getFields(pool, table.id);

  const inputRecords = body?.records;
  if (!Array.isArray(inputRecords) || !inputRecords.length) {
    return err('records array required', 422);
  }
  if (inputRecords.length > 10) return err('Max 10 records per request', 422);

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');
    const updated: any[] = [];
    for (const rec of inputRecords) {
      if (!rec.id) continue;
      const row = fieldsToRow(rec.fields || {}, fieldMeta);
      const keys = Object.keys(row);
      if (!keys.length) continue;
      const setClauses = keys.map((k, i) => `${safeId(k)} = $${i + 1}`).join(', ');
      const vals = keys.map(k => row[k]);
      vals.push(rec.id);
      const r = await conn.queryObject(
        `UPDATE ${fqn} SET ${setClauses} WHERE "id" = $${vals.length} RETURNING *`, vals,
      );
      if (r.rows.length) updated.push(r.rows[0]);
    }
    await conn.queryObject('COMMIT');

    const result = updated.map((row: any) => ({
      id: row.id,
      createdTime: row.created_at,
      fields: pgRowToFields(row, fieldMeta),
    }));

    dispatchWebhooks(pool, base.id, table.id, table.name, 'record.updated', { records: result });

    return json({ records: result });
  } catch (e) {
    await conn.queryObject('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function handleDeleteRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, url: URL, body: any,
) {
  if (!auth.scopes.includes('records:write')) return err('Scope records:write required', 403);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);

  // Accept record IDs from query params (?records[]=xxx) or body
  let recordIds: string[] = url.searchParams.getAll('records[]');
  if (!recordIds.length && body?.records) recordIds = body.records;
  if (!Array.isArray(recordIds) || !recordIds.length) {
    return err('records array of IDs required', 422);
  }
  if (recordIds.length > 10) return err('Max 10 records per request', 422);

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    const placeholders = recordIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await conn.queryObject<{ id: string }>(
      `DELETE FROM ${fqn} WHERE "id" IN (${placeholders}) RETURNING "id"`, recordIds,
    );
    const result = rows.map(r => ({ id: r.id, deleted: true }));

    dispatchWebhooks(pool, base.id, table.id, table.name, 'record.deleted', { records: result });

    return json({ records: result });
  } finally {
    conn.release();
  }
}

// ---------- Webhooks ----------

async function dispatchWebhooks(
  pool: Pool,
  baseId: string,
  tableId: string,
  tableName: string,
  event: string,
  payload: unknown,
) {
  try {
    const conn = await pool.connect();
    try {
      const { rows } = await conn.queryObject<{ url: string; secret: string | null; headers: Record<string, string> }>(
        `SELECT url, secret, headers FROM nc_meta.webhooks
         WHERE base_id = $1 AND is_active = true
           AND (table_id IS NULL OR table_id = $2)
           AND $3 = ANY(events)`,
        [baseId, tableId, event],
      );
      if (!rows.length) return;

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        base_id: baseId,
        table_id: tableId,
        table_name: tableName,
        payload,
      });

      for (const wh of rows) {
        const hdrs: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'KDOps-Webhook/1.0',
          ...(wh.headers ?? {}),
        };
        if (wh.secret) {
          const sig = encodeHex(new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body + wh.secret)),
          ));
          hdrs['X-KDOps-Signature'] = sig;
        }
        fetch(wh.url, { method: 'POST', headers: hdrs, body }).catch(() => {});
      }

      conn.queryObject(
        `UPDATE nc_meta.webhooks SET last_triggered_at = now()
         WHERE base_id = $1 AND is_active = true
           AND (table_id IS NULL OR table_id = $2)
           AND $3 = ANY(events)`,
        [baseId, tableId, event],
      ).catch(() => {});
    } finally {
      conn.release();
    }
  } catch { /* best-effort */ }
}

// ---------- Main ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return err('Server misconfigured', 500);

  const pool = new Pool(dbUrl, 2, true);

  try {
    const auth = await authenticateApiKey(pool, req.headers.get('Authorization'));
    const url = new URL(req.url);
    const route = parseRoute(url.pathname);
    if (!route) return err('Not found. Use /v1/bases, /v1/bases/:id/tables, or .../records', 404);

    switch (route.resource) {
      case 'bases':
        if (req.method !== 'GET') return err('Method not allowed', 405);
        return handleListBases(pool, auth);

      case 'tables':
        if (req.method !== 'GET') return err('Method not allowed', 405);
        if (!auth.scopes.includes('schema:read')) return err('Scope schema:read required', 403);
        return handleListTables(pool, auth, route.baseId!);

      case 'record':
        if (req.method !== 'GET') return err('Method not allowed on single record URL', 405);
        return handleGetRecord(pool, auth, route.baseId!, route.tableId!, route.recordId!);

      case 'records': {
        const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};
        switch (req.method) {
          case 'GET':
            return handleListRecords(pool, auth, route.baseId!, route.tableId!, url);
          case 'POST':
            return handleCreateRecords(pool, auth, route.baseId!, route.tableId!, body);
          case 'PATCH':
            return handleUpdateRecords(pool, auth, route.baseId!, route.tableId!, body);
          case 'DELETE':
            return handleDeleteRecords(pool, auth, route.baseId!, route.tableId!, url, body);
          default:
            return err('Method not allowed', 405);
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    if (msg.includes('API key') || msg.includes('Missing')) return err(msg, 401);
    return err(msg, 500);
  } finally {
    await pool.end();
  }
});
