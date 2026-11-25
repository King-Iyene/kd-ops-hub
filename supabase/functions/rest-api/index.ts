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
import { classifyRef, normalizeLinkInput, planLinkChange } from '../_shared/rest-links.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body, (_k, v) => typeof v === 'bigint' ? Number(v) : v), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  });
}

function err(message: string, status: number) {
  const type = status === 400 ? 'BAD_REQUEST'
    : status === 401 ? 'AUTHENTICATION_REQUIRED'
    : status === 403 ? 'FORBIDDEN'
    : status === 404 ? 'NOT_FOUND'
    : status === 405 ? 'METHOD_NOT_ALLOWED'
    : status === 422 ? 'INVALID_REQUEST'
    : status === 429 ? 'RATE_LIMIT_EXCEEDED'
    : 'INTERNAL_ERROR';
  return json({ error: { type, message } }, status);
}

const ID_RE = /^[a-z][a-z0-9_]*$/;
function safeId(name: string): string {
  if (!ID_RE.test(name) || name.length > 63) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

// Escapes LIKE/ILIKE metacharacters (%, _, \) so user input used with a
// LIKE pattern cannot inject its own wildcards.
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Short ID (base-62) conversion ----------
const SHORT_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function uuidToShort(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  let num = BigInt('0x' + hex);
  let result = '';
  while (num > 0n) {
    result = SHORT_CHARS[Number(num % 62n)] + result;
    num = num / 62n;
  }
  return result || '0';
}

function shortToUuid(short: string): string {
  let num = 0n;
  for (const ch of short) {
    const idx = SHORT_CHARS.indexOf(ch);
    if (idx < 0) return short;
    num = num * 62n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32),
  ].join('-');
}

function decodeShortId(param: string): string | null {
  if (UUID_RE.test(param)) return null;
  if (param.length > 25) return null;
  const decoded = shortToUuid(param);
  return (decoded !== param && UUID_RE.test(decoded)) ? decoded : null;
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

function convertRowIds(row: Record<string, unknown>): Record<string, unknown> {
  const out = sanitizeRow(row);
  if (typeof out.id === 'string' && UUID_RE.test(out.id)) out.id = uuidToShort(out.id);
  return out;
}

// ---------- Pool ----------
// Module-level singleton so the pool is reused across invocations within the
// same Deno isolate instead of being recreated (and never fully torn down)
// on every request.
let _pool: Pool | null = null;
function getPool(): Pool | null {
  if (_pool) return _pool;
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return null;
  _pool = new Pool(dbUrl, 2, true);
  return _pool;
}

// ---------- Rate limiting ----------
// Simple fixed-window, per-API-key rate limiter. Module-level so counters
// persist across requests handled by the same Deno isolate. Not distributed
// (each isolate has its own counters), but good enough to blunt abusive
// clients hammering a single instance.
const RATE_LIMIT_MAX = 100; // requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_CLEANUP_THRESHOLD = 1000;

interface RateWindow {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateWindow>();

function cleanupRateLimits(now: number) {
  if (rateLimits.size <= RATE_LIMIT_CLEANUP_THRESHOLD) return;
  for (const [key, w] of rateLimits) {
    if (now - w.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimits.delete(key);
    }
  }
}

// Returns null if the request is allowed, or the number of seconds the
// caller should wait before retrying if the rate limit was exceeded.
function checkRateLimit(keyHash: string): number | null {
  const now = Date.now();
  cleanupRateLimits(now);

  const existing = rateLimits.get(keyHash);
  if (!existing || now - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(keyHash, { count: 1, windowStart: now });
    return null;
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - existing.windowStart);
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  existing.count++;
  return null;
}

// ---------- Auth ----------

// SECURITY: needed must be an EXACT scope this API actually enforces
// (records:read/write, schema:read/write) or a matching *:read/*:write
// wildcard. Never fall back to "any scope ending in :read/:write" — that
// used to let a key scoped to e.g. "Payroll: Read only" (payroll:read, a
// module-level scope for a per-module REST API that was never built)
// satisfy records:read/schema:read and get full read access to every base
// and table in the platform, and a "*:write"-shaped module scope satisfy
// schema:write (full DDL) the same way. ApiKeysManager's module-scoped
// checkboxes (Employees, Payroll, Fleet, ...) are inert against this API by
// design — they gate a documented-but-unbuilt per-module REST API, and must
// never be treated as equivalent to this generic Data API's own scopes.
function hasScope(scopes: string[], needed: string): boolean {
  if (scopes.includes(needed)) return true;
  const neededAction = needed.split(':')[1]; // 'read' | 'write'
  if (neededAction && scopes.includes(`*:${neededAction}`)) return true;
  if (neededAction === 'read' && scopes.includes('*:write')) return true;
  return false;
}

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
  const raw = authHeader.slice(7).trim();
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
  fieldId?: string;
  resource: 'bases' | 'tables' | 'records' | 'record' | 'fields' | 'field';
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
  // /v1/bases/:baseId/tables/:tableId/fields/:fieldId
  if (parts[0] === 'v1' && parts[1] === 'bases' && parts[3] === 'tables' && parts[5] === 'fields' && parts.length === 7) {
    return { baseId: parts[2], tableId: parts[4], fieldId: parts[6], resource: 'field' };
  }
  // /v1/bases/:baseId/tables/:tableId/fields
  if (parts[0] === 'v1' && parts[1] === 'bases' && parts[3] === 'tables' && parts[5] === 'fields' && parts.length === 6) {
    return { baseId: parts[2], tableId: parts[4], resource: 'fields' };
  }
  return null;
}

// ---------- Helpers ----------

interface FieldMeta {
  id: string;
  options: Record<string, unknown> | null;
  name: string;
  pg_column_name: string;
  ui_type: string;
  pg_type: string;
  position: number;
  is_system: boolean;
  is_hidden: boolean;
}

const PLATFORM_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

async function resolveBase(pool: Pool, workspaceId: string, param: string) {
  // Reject raw UUIDs — only short IDs and slugs accepted
  if (UUID_RE.test(param)) return null;
  const decodedUuid = decodeShortId(param);
  const lookupField = decodedUuid ? 'id' : 'slug';
  const lookupValue = decodedUuid ?? param;

  const conn = await pool.connect();
  try {
    const wsClause = workspaceId === PLATFORM_WORKSPACE_ID ? '' : 'workspace_id = $1 AND ';
    const params = workspaceId === PLATFORM_WORKSPACE_ID ? [lookupValue] : [workspaceId, lookupValue];
    const paramIdx = workspaceId === PLATFORM_WORKSPACE_ID ? '$1' : '$2';
    const { rows } = await conn.queryObject<{ id: string; name: string; schema_name: string; slug: string }>(
      `SELECT id, name, schema_name, slug FROM nc_meta.bases
       WHERE ${wsClause}${lookupField} = ${paramIdx}`,
      params,
    );
    return rows[0] ?? null;
  } finally {
    conn.release();
  }
}

async function resolveTable(pool: Pool, baseId: string, param: string) {
  if (UUID_RE.test(param)) return null;
  const decodedUuid = decodeShortId(param);
  const lookupField = decodedUuid ? 'id' : 'slug';
  const lookupValue = decodedUuid ?? param;

  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string; name: string; pg_table_name: string; slug: string }>(
      `SELECT id, name, pg_table_name, slug FROM nc_meta.tables
       WHERE base_id = $1 AND ${lookupField} = $2`,
      [baseId, lookupValue],
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
      `SELECT id, options, name, pg_column_name, ui_type, pg_type, position, is_system, is_hidden
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
    if (f.is_system || f.is_hidden || VIRTUAL_TYPES.has(f.ui_type)) continue;
    let val = row[f.pg_column_name];
    if (val !== null && val !== undefined) {
      if (typeof val === 'bigint') val = Number(val);
      out[f.name] = val;
    }
  }
  return out;
}

function fieldsToRow(input: Record<string, unknown>, fields: FieldMeta[]): Record<string, unknown> {
  const nameToCol = new Map(
    fields.filter(f => !f.is_system && !VIRTUAL_TYPES.has(f.ui_type)).map(f => [f.name, f.pg_column_name]),
  );
  const row: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(input)) {
    const col = nameToCol.get(name);
    if (col) row[col] = value;
  }
  return row;
}

// ---------- Link fields ----------
// A link field holds records of another table. The app keeps each link as ONE row in a junction table
// (source_id, target_id) and reads it from either side, so the API writes and reads links the same way.

class LinkInputError extends Error {}

function splitLinkInputs(input: Record<string, unknown>, fields: FieldMeta[]) {
  const linkNames = new Set(fields.filter(f => f.ui_type === 'Links').map(f => f.name));
  const plain: Record<string, unknown> = {};
  const links: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(input)) {
    if (linkNames.has(name)) links[name] = value;
    else plain[name] = value;
  }
  return { plain, links };
}

async function loadLinkMeta(conn: any, fieldId: string): Promise<{ junction_table: string | null; related_table: string | null } | null> {
  const { rows } = await conn.queryObject(
    `SELECT jt.pg_table_name AS junction_table, rt.pg_table_name AS related_table
     FROM nc_meta.links l
     LEFT JOIN nc_meta.tables jt ON jt.id = l.junction_table_id
     LEFT JOIN nc_meta.tables rt ON rt.id = l.related_table_id
     WHERE l.field_id = $1 LIMIT 1`,
    [fieldId],
  );
  return (rows[0] as any) ?? null;
}

/** Turns what the caller named (short ids, UUIDs or old Airtable ids) into the UUIDs of real records. */
async function resolveLinkTargets(conn: any, schemaName: string, relatedTable: string, refs: string[], fieldName: string): Promise<string[]> {
  const fqn = `${safeId(schemaName)}.${safeId(relatedTable)}`;
  const candidates = new Map<string, string>();
  const airtable: string[] = [];
  const bad: string[] = [];
  for (const ref of refs) {
    const kind = classifyRef(ref);
    if (kind === 'uuid') candidates.set(ref, ref.toLowerCase());
    else if (kind === 'airtable') airtable.push(ref);
    else if (kind === 'short') {
      const decoded = decodeShortId(ref);
      if (decoded) candidates.set(ref, decoded.toLowerCase());
      else bad.push(ref);
    } else bad.push(ref);
  }

  const out: string[] = [];
  if (candidates.size) {
    const { rows } = await conn.queryObject(
      `SELECT id::text AS id FROM ${fqn} WHERE id = ANY(string_to_array($1, ',')::uuid[])`,
      [[...candidates.values()].join(',')],
    );
    const found = new Set((rows as any[]).map(r => r.id));
    for (const [ref, uuid] of candidates) {
      if (found.has(uuid)) out.push(uuid);
      else bad.push(ref);
    }
  }
  if (airtable.length) {
    const col = await conn.queryObject(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'airtable_id'`,
      [schemaName, relatedTable],
    );
    if (!col.rows.length) {
      bad.push(...airtable);
    } else {
      const { rows } = await conn.queryObject(
        `SELECT id::text AS id, airtable_id FROM ${fqn} WHERE airtable_id = ANY(string_to_array($1, ',')::text[])`,
        [airtable.join(',')],
      );
      const byAirtable = new Map((rows as any[]).map(r => [r.airtable_id as string, r.id as string]));
      for (const ref of airtable) {
        const id = byAirtable.get(ref);
        if (id) out.push(id);
        else bad.push(ref);
      }
    }
  }
  if (bad.length) throw new LinkInputError(`${fieldName}: unknown linked record(s): ${bad.slice(0, 5).join(', ')}`);
  return [...new Set(out)];
}

/** Sets each named link field of one record to exactly the records given (Airtable behaviour). Runs inside the caller's transaction. */
async function applyLinkInputs(conn: any, base: { schema_name: string }, fields: FieldMeta[], recordId: string, links: Record<string, unknown>) {
  for (const [name, value] of Object.entries(links)) {
    const field = fields.find(f => f.name === name && f.ui_type === 'Links');
    if (!field) continue;
    const { refs, error } = normalizeLinkInput(value);
    if (error) throw new LinkInputError(`${name}: ${error}`);
    const meta = await loadLinkMeta(conn, field.id);
    if (!meta || !meta.junction_table || !meta.related_table) {
      throw new LinkInputError(`${name}: this link cannot be written through the API`);
    }
    const jn = `${safeId(base.schema_name)}.${safeId(meta.junction_table)}`;
    const desired = await resolveLinkTargets(conn, base.schema_name, meta.related_table, refs, name);
    const { rows } = await conn.queryObject(
      `SELECT DISTINCT CASE WHEN source_id = $1 THEN target_id ELSE source_id END::text AS other
       FROM ${jn} WHERE source_id = $1 OR target_id = $1`,
      [recordId],
    );
    const { toAdd, toRemove } = planLinkChange((rows as any[]).map(r => r.other), desired);
    if (toRemove.length) {
      await conn.queryObject(
        `DELETE FROM ${jn} WHERE (source_id = $1 AND target_id = ANY(string_to_array($2, ',')::uuid[]))
                              OR (target_id = $1 AND source_id = ANY(string_to_array($2, ',')::uuid[]))`,
        [recordId, toRemove.join(',')],
      );
    }
    for (const id of toAdd) {
      await conn.queryObject(`INSERT INTO ${jn} (source_id, target_id) VALUES ($1, $2)`, [recordId, id]);
    }
  }
}

/** Adds each link field (as a list of short ids, like Airtable) to the records about to be returned. */
async function attachLinkValues(conn: any, base: { schema_name: string }, fields: FieldMeta[], rowIds: string[], records: any[]) {
  const linkFields = fields.filter(f => f.ui_type === 'Links');
  if (!linkFields.length || !rowIds.length) return;
  const wanted = new Set(rowIds);
  const idList = rowIds.join(',');
  for (const field of linkFields) {
    const meta = await loadLinkMeta(conn, field.id);
    if (!meta || !meta.junction_table) continue;
    const jn = `${safeId(base.schema_name)}.${safeId(meta.junction_table)}`;
    const { rows } = await conn.queryObject(
      `SELECT source_id::text AS s, target_id::text AS t FROM ${jn}
       WHERE source_id = ANY(string_to_array($1, ',')::uuid[]) OR target_id = ANY(string_to_array($1, ',')::uuid[])`,
      [idList],
    );
    const byRecord = new Map<string, Set<string>>();
    const add = (record: string, other: string) => {
      const set = byRecord.get(record) ?? new Set<string>();
      set.add(other);
      byRecord.set(record, set);
    };
    for (const { s: a, t: b } of rows as any[]) {
      if (a === b) continue;
      if (wanted.has(a)) add(a, b);
      if (wanted.has(b)) add(b, a);
    }
    records.forEach((rec, i) => {
      const set = byRecord.get(rowIds[i]);
      if (set && set.size) rec.fields[field.name] = [...set].map(uuidToShort);
    });
  }
}

/**
 * Runs the base's automations for rows written through the API, as the app does for rows written on screen.
 * Best effort: a failure here never fails the write.
 */
function fireAutomations(baseId: string, tableId: string, event: string, records: any[], oldRecords?: any[]) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !records.length) return;
  const run = Promise.allSettled(
    records.slice(0, 10).map((rec, i) =>
      fetch(`${url}/functions/v1/automation-runner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event, baseId, tableId, depth: 0,
          record: sanitizeRow(rec),
          oldRecord: oldRecords?.[i] ? sanitizeRow(oldRecords[i]) : undefined,
        }),
        signal: AbortSignal.timeout(20_000),
      })
    ),
  );
  (globalThis as any).EdgeRuntime?.waitUntil?.(run);
}

function toSnakeCase(name: string): string {
  let result = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (/^[0-9]/.test(result)) result = 'f_' + result;
  return result.substring(0, 63);
}

const UI_TYPE_TO_PG_TYPE: Record<string, string> = {
  SingleLineText: 'TEXT', LongText: 'TEXT', Email: 'TEXT', PhoneNumber: 'TEXT', URL: 'TEXT',
  Number: 'NUMERIC', Decimal: 'NUMERIC(15,4)', Currency: 'NUMERIC(15,2)', Percent: 'NUMERIC(8,4)',
  Duration: 'INTEGER', Rating: 'SMALLINT', Date: 'DATE', DateTime: 'TIMESTAMPTZ', Year: 'SMALLINT',
  Time: 'TIME', SingleSelect: 'TEXT', MultiSelect: 'TEXT[]', Checkbox: 'BOOLEAN DEFAULT false',
  Attachment: "JSONB DEFAULT '[]'::jsonb", AutoNumber: 'SERIAL', JSON: 'JSONB', Barcode: 'TEXT',
  User: "JSONB DEFAULT '[]'::jsonb",
};

const VIRTUAL_TYPES = new Set([
  'Links', 'Lookup', 'Rollup', 'Count', 'Formula',
  'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy', 'ID', 'Button',
]);

const FIELD_NAME_RE = /^[a-zA-Z0-9_ ]+$/;
function validateFieldName(name: string): string | null {
  if (!name || name.trim().length === 0) return 'Field name is required';
  if (name.length > 63) return 'Field name must be 63 characters or fewer';
  if (!FIELD_NAME_RE.test(name)) return 'Field name must contain only letters, numbers, underscores, and spaces';
  return null;
}

function inferPgType(value: unknown): { pgType: string; uiType: string } {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { pgType: 'INTEGER', uiType: 'Number' } : { pgType: 'DOUBLE PRECISION', uiType: 'Decimal' };
  }
  if (typeof value === 'boolean') return { pgType: 'BOOLEAN DEFAULT false', uiType: 'Checkbox' };
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(value)) return { pgType: 'TIMESTAMPTZ', uiType: 'DateTime' };
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { pgType: 'DATE', uiType: 'Date' };
    if (value.startsWith('http://') || value.startsWith('https://')) return { pgType: 'TEXT', uiType: 'URL' };
    if (value.includes('@') && value.includes('.')) return { pgType: 'TEXT', uiType: 'Email' };
    if (value.length > 255) return { pgType: 'TEXT', uiType: 'LongText' };
    return { pgType: 'TEXT', uiType: 'SingleLineText' };
  }
  if (Array.isArray(value)) return { pgType: 'JSONB DEFAULT \'[]\'::jsonb', uiType: 'JSON' };
  if (value && typeof value === 'object') return { pgType: 'JSONB DEFAULT \'{}\'::jsonb', uiType: 'JSON' };
  return { pgType: 'TEXT', uiType: 'SingleLineText' };
}

async function autoCreateFields(
  pool: Pool, tableId: string, schemaName: string, pgTableName: string,
  allRecords: Record<string, unknown>[], existingFields: FieldMeta[],
): Promise<FieldMeta[]> {
  const known = new Set(existingFields.filter(f => !f.is_system).map(f => f.name));
  const knownCols = new Set(existingFields.map(f => f.pg_column_name));
  const toCreate = new Map<string, { pgType: string; uiType: string }>();

  for (const rec of allRecords) {
    for (const [name, value] of Object.entries(rec)) {
      if (known.has(name) || toCreate.has(name)) continue;
      if (value === null || value === undefined) continue;
      toCreate.set(name, inferPgType(value));
    }
  }

  if (toCreate.size === 0) return existingFields;

  const maxPos = existingFields.reduce((m, f) => Math.max(m, f.position ?? 0), 0);
  const conn = await pool.connect();
  try {
    let pos = maxPos + 1;
    for (const [name, { pgType, uiType }] of toCreate) {
      let pgCol = toSnakeCase(name);
      if (knownCols.has(pgCol)) pgCol = `${pgCol}_${pos}`;
      knownCols.add(pgCol);
      const rawPgType = pgType.split(/\s+DEFAULT\s+/i)[0].trim();
      await conn.queryObject(
        `ALTER TABLE ${safeId(schemaName)}.${safeId(pgTableName)} ADD COLUMN IF NOT EXISTS ${safeId(pgCol)} ${pgType}`,
      );
      await conn.queryObject(
        `INSERT INTO nc_meta.fields (table_id, name, pg_column_name, ui_type, pg_type, options, position, width, is_primary, is_required, is_unique, is_system, is_hidden)
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6, 180, false, false, false, false, false)`,
        [tableId, name, pgCol, uiType, rawPgType, pos++],
      );
    }
  } finally {
    conn.release();
  }

  return getFields(pool, tableId);
}

// ---------- Handlers ----------

async function handleListBases(pool: Pool, auth: ApiKeyInfo) {
  const conn = await pool.connect();
  try {
    // Platform keys (nil-UUID workspace) can list all bases
    const isPlatform = auth.workspace_id === PLATFORM_WORKSPACE_ID;
    const query = isPlatform
      ? `SELECT b.id, b.name, b.slug, b.icon, b.color,
                (SELECT count(*) FROM nc_meta.tables t WHERE t.base_id = b.id)::int AS table_count
         FROM nc_meta.bases b WHERE b.workspace_id != $1 ORDER BY b.position`
      : `SELECT b.id, b.name, b.slug, b.icon, b.color,
                (SELECT count(*) FROM nc_meta.tables t WHERE t.base_id = b.id)::int AS table_count
         FROM nc_meta.bases b WHERE b.workspace_id = $1 ORDER BY b.position`;
    const { rows } = await conn.queryObject(query, [auth.workspace_id]);
    const bases = (rows as any[]).map(b => ({ ...b, id: uuidToShort(b.id) }));
    return json({ bases });
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
    const converted = (tables as any[]).map(t => ({
      ...t,
      id: uuidToShort(t.id),
      fields: (t.fields ?? []).map((f: any) => f?.id ? { ...f, id: uuidToShort(f.id) } : f),
    }));
    return json({ tables: converted });
  } finally {
    conn.release();
  }
}

async function handleListRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string,
  url: URL,
) {
  if (!hasScope(auth.scopes,'records:read')) return err('Scope records:read required', 403);

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
        case 'contains': clauses.push(`${col}::text ILIKE $${pidx}`); whereParams.push(`%${escapeLike(val)}%`); break;
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
      id: uuidToShort(row.id),
      createdTime: row.created_at,
      fields: pgRowToFields(row, fields),
    }));
    await attachLinkValues(conn, base, fields, returnRows.map((r: any) => r.id), records);

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
  if (!hasScope(auth.scopes,'records:read')) return err('Scope records:read required', 403);

  const decodedRecordId = decodeShortId(recordId);
  if (!decodedRecordId) return err('Invalid record ID format — use short IDs, not UUIDs', 400);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);
  const fields = await getFields(pool, table.id);

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject(`SELECT * FROM ${fqn} WHERE "id" = $1`, [decodedRecordId]);
    if (!rows.length) return err('Record not found', 404);
    const row: any = rows[0];
    const record = {
      id: uuidToShort(row.id),
      createdTime: row.created_at,
      fields: pgRowToFields(row, fields),
    };
    await attachLinkValues(conn, base, fields, [row.id], [record]);
    return json(record);
  } finally {
    conn.release();
  }
}

async function handleCreateRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, body: any,
) {
  if (!hasScope(auth.scopes,'records:write')) return err('Scope records:write required', 403);

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

  // Auto-create fields for any unknown field names in the input
  const allFieldInputs = inputRecords.map((r: any) => r.fields || {});
  let fields = await autoCreateFields(pool, table.id, base.schema_name, table.pg_table_name, allFieldInputs, fieldMeta);

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');
    const created: any[] = [];
    for (const rec of inputRecords) {
      const { plain, links } = splitLinkInputs(rec.fields || {}, fields);
      const row = fieldsToRow(plain, fields);
      const keys = Object.keys(row);
      if (!keys.length) {
        const r = await conn.queryObject(`INSERT INTO ${fqn} DEFAULT VALUES RETURNING *`);
        created.push(r.rows[0]);
        if (Object.keys(links).length) await applyLinkInputs(conn, base, fields, (r.rows[0] as any).id, links);
        continue;
      }
      const cols = keys.map(k => safeId(k)).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const vals = keys.map(k => row[k]);
      const r = await conn.queryObject(
        `INSERT INTO ${fqn} (${cols}) VALUES (${placeholders}) RETURNING *`, vals,
      );
      created.push(r.rows[0]);
      if (Object.keys(links).length) await applyLinkInputs(conn, base, fields, (r.rows[0] as any).id, links);
    }
    await conn.queryObject('COMMIT');

    const result = created.map((row: any) => ({
      id: uuidToShort(row.id),
      createdTime: row.created_at,
      fields: pgRowToFields(row, fields),
    }));

    await attachLinkValues(conn, base, fields, created.map((r: any) => r.id), result);
    dispatchWebhooks(pool, base.id, table.id, table.name, 'record.created', { records: result });
    fireAutomations(base.id, table.id, 'record.created', created);
    logAudit(pool, base.id, table.id, 'INSERT', result);

    return json({ records: result }, 201);
  } catch (e) {
    await conn.queryObject('ROLLBACK').catch(() => {});
    if (e instanceof LinkInputError) return err(e.message, 422);
    throw e;
  } finally {
    conn.release();
  }
}

async function handleUpdateRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, body: any,
) {
  if (!hasScope(auth.scopes,'records:write')) return err('Scope records:write required', 403);

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

  // Auto-create fields for any unknown field names
  const allFieldInputs = inputRecords.map((r: any) => r.fields || {});
  let fields = await autoCreateFields(pool, table.id, base.schema_name, table.pg_table_name, allFieldInputs, fieldMeta);

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');
    const updated: any[] = [];
    const oldRows = new Map<string, any>();
    for (const rec of inputRecords) {
      if (!rec.id) return err('Each record must include an "id" field for updates', 422);
      const decodedId = decodeShortId(rec.id);
      if (!decodedId) return err(`Invalid record ID format: ${rec.id} — use short IDs, not UUIDs`, 422);
      const { plain, links } = splitLinkInputs(rec.fields || {}, fields);
      const row = fieldsToRow(plain, fields);
      const keys = Object.keys(row);
      const hasLinks = Object.keys(links).length > 0;
      if (!keys.length && !hasLinks) continue;
      const before = await conn.queryObject(`SELECT * FROM ${fqn} WHERE "id" = $1`, [decodedId]);
      if (!before.rows.length) continue;
      oldRows.set(decodedId, before.rows[0]);
      let after: any = before.rows[0];
      if (keys.length) {
        const setClauses = keys.map((k, i) => `${safeId(k)} = $${i + 1}`).join(', ');
        const vals = keys.map(k => row[k]);
        vals.push(decodedId);
        const r = await conn.queryObject(
          `UPDATE ${fqn} SET ${setClauses} WHERE "id" = $${vals.length} RETURNING *`, vals,
        );
        if (r.rows.length) after = r.rows[0];
      }
      if (hasLinks) await applyLinkInputs(conn, base, fields, decodedId, links);
      updated.push(after);
    }
    await conn.queryObject('COMMIT');

    const result = updated.map((row: any) => ({
      id: uuidToShort(row.id),
      createdTime: row.created_at,
      fields: pgRowToFields(row, fields),
    }));

    await attachLinkValues(conn, base, fields, updated.map((r: any) => r.id), result);
    dispatchWebhooks(pool, base.id, table.id, table.name, 'record.updated', { records: result });
    fireAutomations(base.id, table.id, 'record.updated', updated, updated.map((r: any) => oldRows.get(r.id)));
    logAudit(pool, base.id, table.id, 'UPDATE', result);

    return json({ records: result });
  } catch (e) {
    await conn.queryObject('ROLLBACK').catch(() => {});
    if (e instanceof LinkInputError) return err(e.message, 422);
    throw e;
  } finally {
    conn.release();
  }
}

async function handleDeleteRecords(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, url: URL, body: any,
) {
  // records:write implies delete (an existing write-scoped key isn't newly
  // restricted here), but data:delete / *:delete alone must ALSO work on
  // their own — otherwise picking only "Delete records" in ApiKeysManager
  // grants nothing at all, since no other handler in this file checks them.
  if (!hasScope(auth.scopes,'records:write') && !auth.scopes.includes('data:delete') && !auth.scopes.includes('*:delete')) {
    return err('Scope records:write or data:delete required', 403);
  }

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

  const decodedIds: string[] = [];
  for (const rid of recordIds) {
    const decoded = decodeShortId(rid);
    if (!decoded) return err(`Invalid record ID format: ${rid} — use short IDs, not UUIDs`, 422);
    decodedIds.push(decoded);
  }

  const fqn = `${safeId(base.schema_name)}.${safeId(table.pg_table_name)}`;
  const conn = await pool.connect();
  try {
    const placeholders = decodedIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await conn.queryObject<{ id: string }>(
      `DELETE FROM ${fqn} WHERE "id" IN (${placeholders}) RETURNING "id"`, decodedIds,
    );
    const result = rows.map(r => ({ id: uuidToShort(r.id), deleted: true }));

    dispatchWebhooks(pool, base.id, table.id, table.name, 'record.deleted', { records: result });
    logAudit(pool, base.id, table.id, 'DELETE', result);

    return json({ records: result });
  } finally {
    conn.release();
  }
}

// ---------- Field Handlers ----------

async function handleListFields(pool: Pool, _auth: ApiKeyInfo, baseIdOrSlug: string, tableIdOrSlug: string) {
  const base = await resolveBase(pool, _auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);

  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject(
      `SELECT id, name, pg_column_name, ui_type, pg_type, options, position, width,
              is_primary, is_required, is_unique, is_system, is_hidden, description
       FROM nc_meta.fields WHERE table_id = $1 ORDER BY position`,
      [table.id],
    );
    const fields = (rows as any[]).map(f => ({ ...sanitizeRow(f as Record<string, unknown>), id: uuidToShort(f.id) }));
    return json({ fields });
  } finally {
    conn.release();
  }
}

async function handleCreateField(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, body: any,
) {
  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);

  const { name, type, description, options } = body;
  const nameErr = validateFieldName(name);
  if (nameErr) return err(nameErr, 422);
  if (!type) return err('Field type is required', 422);

  const isVirtual = VIRTUAL_TYPES.has(type);
  const pgType = isVirtual ? '' : (UI_TYPE_TO_PG_TYPE[type] ?? 'TEXT');
  const rawPgType = pgType.split(/\s+DEFAULT\s+/i)[0].trim();
  const pgCol = isVirtual ? '' : toSnakeCase(name);

  const conn = await pool.connect();
  try {
    // Get max position
    const { rows: posRows } = await conn.queryObject<{ max_pos: number | null }>(
      `SELECT MAX(position) AS max_pos FROM nc_meta.fields WHERE table_id = $1`,
      [table.id],
    );
    const nextPos = ((posRows[0]?.max_pos) ?? 0) + 1;

    // Insert field metadata
    const { rows } = await conn.queryObject(
      `INSERT INTO nc_meta.fields
       (table_id, name, pg_column_name, ui_type, pg_type, options, position, width,
        is_primary, is_required, is_unique, is_system, is_hidden, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 180, false, false, false, false, false, $8)
       RETURNING *`,
      [table.id, name, pgCol, type, rawPgType, JSON.stringify(options ?? {}), nextPos, description ?? null],
    );

    // Add physical column if non-virtual
    if (!isVirtual && pgCol) {
      await conn.queryObject(
        `ALTER TABLE ${safeId(base.schema_name)}.${safeId(table.pg_table_name)}
         ADD COLUMN IF NOT EXISTS ${safeId(pgCol)} ${pgType}`,
      );
    }

    const field = rows[0] as any;
    return json({ field: { ...sanitizeRow(field), id: uuidToShort(field.id) } }, 201);
  } finally {
    conn.release();
  }
}

async function handleUpdateField(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, fieldId: string, body: any,
) {
  const decodedFieldId = decodeShortId(fieldId);
  if (!decodedFieldId) return err('Invalid field ID format — use short IDs, not UUIDs', 400);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);

  const conn = await pool.connect();
  try {
    const { rows: existing } = await conn.queryObject<{ id: string }>(
      `SELECT id FROM nc_meta.fields WHERE id = $1 AND table_id = $2`,
      [decodedFieldId, table.id],
    );
    if (!existing.length) return err('Field not found', 404);

    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) {
      const nameErr = validateFieldName(body.name);
      if (nameErr) return err(nameErr, 422);
      setClauses.push(`name = $${idx++}`);
      vals.push(body.name);
    }
    if (body.description !== undefined) {
      setClauses.push(`description = $${idx++}`);
      vals.push(body.description);
    }
    if (body.options !== undefined) {
      setClauses.push(`options = $${idx++}`);
      vals.push(JSON.stringify(body.options));
    }

    if (!setClauses.length) return err('No valid fields to update', 422);

    vals.push(decodedFieldId);
    const { rows } = await conn.queryObject(
      `UPDATE nc_meta.fields SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    const field = rows[0] as any;
    return json({ field: { ...sanitizeRow(field), id: uuidToShort(field.id) } });
  } finally {
    conn.release();
  }
}

async function handleDeleteField(
  pool: Pool, auth: ApiKeyInfo,
  baseIdOrSlug: string, tableIdOrSlug: string, fieldId: string,
) {
  const decodedFieldId = decodeShortId(fieldId);
  if (!decodedFieldId) return err('Invalid field ID format — use short IDs, not UUIDs', 400);

  const base = await resolveBase(pool, auth.workspace_id, baseIdOrSlug);
  if (!base) return err('Base not found', 404);
  const table = await resolveTable(pool, base.id, tableIdOrSlug);
  if (!table) return err('Table not found', 404);

  const conn = await pool.connect();
  try {
    const { rows: existing } = await conn.queryObject<{
      id: string; pg_column_name: string; is_system: boolean; is_primary: boolean;
    }>(
      `SELECT id, pg_column_name, is_system, is_primary FROM nc_meta.fields
       WHERE id = $1 AND table_id = $2`,
      [decodedFieldId, table.id],
    );
    if (!existing.length) return err('Field not found', 404);

    const field = existing[0];
    if (field.is_system) return err('Cannot delete a system field', 422);
    if (field.is_primary) return err('Cannot delete the primary field', 422);

    // Drop physical column if non-virtual
    if (field.pg_column_name) {
      await conn.queryObject(
        `ALTER TABLE ${safeId(base.schema_name)}.${safeId(table.pg_table_name)}
         DROP COLUMN IF EXISTS ${safeId(field.pg_column_name)}`,
      );
    }

    await conn.queryObject(`DELETE FROM nc_meta.fields WHERE id = $1`, [decodedFieldId]);
    return json({ field: { id: fieldId, deleted: true } });
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
      // Match webhooks for this specific base OR platform-wide (nil UUID) webhooks
      const { rows } = await conn.queryObject<{ url: string; secret: string | null; headers: Record<string, string> }>(
        `SELECT url, secret, headers FROM nc_meta.webhooks
         WHERE (base_id = $1 OR base_id = '00000000-0000-0000-0000-000000000000')
           AND is_active = true
           AND (table_id IS NULL OR table_id = $2 OR table_id = '00000000-0000-0000-0000-000000000000')
           AND $3 = ANY(events)`,
        [baseId, tableId, event],
      );
      if (!rows.length) return;

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        base_id: uuidToShort(baseId),
        table_id: uuidToShort(tableId),
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
          const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(wh.secret),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
          );
          const sig = encodeHex(new Uint8Array(
            await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)),
          ));
          hdrs['X-KDOps-Signature'] = `sha256=${sig}`;
        }
        fetch(wh.url, { method: 'POST', headers: hdrs, body, signal: AbortSignal.timeout(10_000) }).catch(() => {});
      }

      conn.queryObject(
        `UPDATE nc_meta.webhooks SET last_triggered_at = now()
         WHERE (base_id = $1 OR base_id = '00000000-0000-0000-0000-000000000000')
           AND is_active = true
           AND (table_id IS NULL OR table_id = $2 OR table_id = '00000000-0000-0000-0000-000000000000')
           AND $3 = ANY(events)`,
        [baseId, tableId, event],
      ).catch(() => {});
    } finally {
      conn.release();
    }
  } catch { /* best-effort */ }
}

// ---------- Audit Logging ----------

async function logAudit(
  pool: Pool,
  baseId: string,
  tableId: string,
  action: string,
  records: any[],
  oldValues?: any[],
) {
  try {
    const conn = await pool.connect();
    try {
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        await conn.queryObject(
          `INSERT INTO nc_meta.audit_log
           (base_id, table_id, record_id, action, old_value, new_value, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
          [
            baseId,
            tableId,
            rec.id ?? null,
            action,
            oldValues?.[i] ? JSON.stringify(oldValues[i]) : null,
            rec.fields ? JSON.stringify(rec.fields) : null,
            `${action} record ${rec.id ?? ''}`.trim(),
          ],
        );
      }
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

  const pool = getPool();
  if (!pool) return err('Server misconfigured', 500);

  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ') && authHeader.slice(7).startsWith('kdops_')) {
      const keyHash = await hashKey(authHeader.slice(7));
      const retryAfter = checkRateLimit(keyHash);
      if (retryAfter !== null) {
        return json(
          { error: { type: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Retry after ${retryAfter} seconds.` } },
          429,
          { 'Retry-After': String(retryAfter) },
        );
      }
    }

    const auth = await authenticateApiKey(pool, authHeader);
    const url = new URL(req.url);
    const route = parseRoute(url.pathname);
    if (!route) return err('Not found. Use /v1/bases, /v1/bases/:id/tables, or .../records', 404);

    switch (route.resource) {
      case 'bases':
        if (req.method !== 'GET') return err('Method not allowed', 405);
        if (!hasScope(auth.scopes, 'schema:read')) return err('Scope schema:read required', 403);
        return handleListBases(pool, auth);

      case 'tables':
        if (req.method !== 'GET') return err('Method not allowed', 405);
        if (!hasScope(auth.scopes,'schema:read')) return err('Scope schema:read required', 403);
        return handleListTables(pool, auth, route.baseId!);

      case 'record':
        if (req.method !== 'GET') return err('Method not allowed on single record URL', 405);
        return handleGetRecord(pool, auth, route.baseId!, route.tableId!, route.recordId!);

      case 'fields': {
        const body = (req.method === 'POST') ? await req.json().catch(() => ({})) : {};
        switch (req.method) {
          case 'GET':
            if (!hasScope(auth.scopes, 'schema:read')) return err('Scope schema:read required', 403);
            return handleListFields(pool, auth, route.baseId!, route.tableId!);
          case 'POST':
            if (!hasScope(auth.scopes, 'schema:write')) return err('Scope schema:write required', 403);
            return handleCreateField(pool, auth, route.baseId!, route.tableId!, body);
          default:
            return err('Method not allowed', 405);
        }
      }

      case 'field': {
        const body = (req.method === 'PATCH') ? await req.json().catch(() => ({})) : {};
        switch (req.method) {
          case 'PATCH':
            if (!hasScope(auth.scopes, 'schema:write')) return err('Scope schema:write required', 403);
            return handleUpdateField(pool, auth, route.baseId!, route.tableId!, route.fieldId!, body);
          case 'DELETE':
            if (!hasScope(auth.scopes, 'schema:write')) return err('Scope schema:write required', 403);
            return handleDeleteField(pool, auth, route.baseId!, route.tableId!, route.fieldId!);
          default:
            return err('Method not allowed', 405);
        }
      }

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
    if (msg.includes('violates not-null')) return err('A required field is missing', 422);
    if (msg.includes('violates unique')) return err('A unique constraint was violated — duplicate value', 422);
    if (msg.includes('violates check')) return err('A value failed validation', 422);
    if (msg.includes('violates foreign key')) return err('Referenced record not found', 422);
    if (msg.includes('column') && msg.includes('does not exist')) return err('Unknown column in request', 422);
    if (msg.includes('relation') && msg.includes('does not exist')) return err('Table not found', 404);
    if (msg.includes('invalid input syntax')) return err('Invalid value for field type', 422);
    console.error('[rest-api]', msg);
    return err('Internal server error', 500);
  }
});
