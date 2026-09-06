/**
 * DDL Executor Edge Function
 *
 * Executes DDL commands (CREATE TABLE, ALTER TABLE, etc.) for the metadata-driven
 * database platform. Receives JSON requests and runs SQL against Postgres.
 *
 * DEPENDENCY: Requires the `SUPABASE_DB_URL` environment variable to be available
 * in the Edge Function runtime (set automatically by Supabase for linked projects).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Pool } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
};

const PROTECTED_SCHEMAS = new Set([
  'nc_meta',
  'auth',
  'public',
  'storage',
  'extensions',
  'supabase_migrations',
  'information_schema',
  'pg_catalog',
]);

const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;
const MAX_IDENTIFIER_LENGTH = 63;

function sanitizeIdentifier(name: string): string {
  if (!name || name.length > MAX_IDENTIFIER_LENGTH || !IDENTIFIER_RE.test(name)) {
    throw new Error(
      `Invalid identifier "${name}". Must match /^[a-z][a-z0-9_]*$/ and be <= 63 chars.`,
    );
  }
  return `"${name}"`;
}

// ---------------------------------------------------------------------------
// Column type / DEFAULT / USING expression validation
//
// These three values (columnType, defaultValue, usingExpression) all end up
// concatenated directly into DDL statements. Postgres does not support bind
// parameters ($1, $2, ...) inside DDL for type names or DEFAULT expressions,
// so we validate them against strict whitelists instead.
// ---------------------------------------------------------------------------

const ALLOWED_BASE_COLUMN_TYPES = [
  'text',
  'integer',
  'bigint',
  'boolean',
  'numeric',
  'real',
  'double precision',
  'date',
  'timestamp',
  'timestamptz',
  'uuid',
  'jsonb',
  'json',
  'varchar',
  'char',
  'bytea',
  'smallint',
  'serial',
  'bigserial',
  'interval',
  'time',
  'timetz',
  'inet',
  'cidr',
  'macaddr',
  'point',
  'line',
  'box',
  'path',
  'polygon',
  'circle',
  'tsquery',
  'tsvector',
  'xml',
  'money',
];

// Matches one of the allowed base types, optionally followed by a
// parenthesized length/precision (e.g. "varchar(255)", "numeric(10,2)").
const COLUMN_TYPE_RE = new RegExp(
  `^(${ALLOWED_BASE_COLUMN_TYPES.map((t) => t.replace(' ', '\\s+')).join('|')})(\\s*\\(\\s*\\d+(\\s*,\\s*\\d+)?\\s*\\))?$`,
  'i',
);

function sanitizeColumnType(rawType: string): string {
  const type = (rawType ?? '').trim();
  if (!type || !COLUMN_TYPE_RE.test(type)) {
    throw new Error(
      `Invalid column type "${rawType}". Allowed types: ${ALLOWED_BASE_COLUMN_TYPES.join(', ')} (optionally with a length/precision, e.g. varchar(255)).`,
    );
  }
  return type;
}

// Safe literal patterns for DEFAULT expressions, tried in order.
const SAFE_DEFAULT_LITERALS: Array<{ re: RegExp; transform: (v: string) => string }> = [
  { re: /^-?\d+(\.\d+)?$/, transform: (v) => v },
  { re: /^(true|false)$/i, transform: (v) => v.toLowerCase() },
  { re: /^null$/i, transform: () => 'NULL' },
  { re: /^current_timestamp$/i, transform: () => 'CURRENT_TIMESTAMP' },
  { re: /^now\(\)$/i, transform: () => 'NOW()' },
  { re: /^gen_random_uuid\(\)$/i, transform: () => 'gen_random_uuid()' },
  { re: /^uuid_generate_v4\(\)$/i, transform: () => 'uuid_generate_v4()' },
];

function sanitizeDefaultValue(rawValue: string): string {
  const value = (rawValue ?? '').trim();

  for (const { re, transform } of SAFE_DEFAULT_LITERALS) {
    if (re.test(value)) {
      return transform(value);
    }
  }

  // String literal, e.g. 'some text'. Re-quote using dollar-quoting so no
  // amount of embedded quote characters can break out of the literal.
  const stringMatch = value.match(/^'([\s\S]*)'$/);
  if (stringMatch) {
    const inner = stringMatch[1];
    if (inner.includes('$$') || inner.includes('\\')) {
      throw new Error(
        `Invalid default value "${rawValue}". String literals cannot contain "$$" or backslashes.`,
      );
    }
    return `$$${inner}$$`;
  }

  throw new Error(
    `Invalid default value "${rawValue}". Allowed: string literals ('text'), numeric literals, ` +
    `true/false, NULL, CURRENT_TIMESTAMP, NOW(), gen_random_uuid(), or uuid_generate_v4().`,
  );
}

// USING expression for ALTER COLUMN ... TYPE ... USING <expr>. Only allow
// "identifier::type" (optionally preceded by "column ::"), where identifier
// matches the standard identifier rule and type is on the column-type
// whitelist. This blocks arbitrary SQL from being interpolated here.
const USING_EXPRESSION_RE = new RegExp(
  `^([a-z_][a-z0-9_]*)\\s*::\\s*(${ALLOWED_BASE_COLUMN_TYPES.map((t) => t.replace(' ', '\\s+')).join('|')})(\\s*\\(\\s*\\d+(\\s*,\\s*\\d+)?\\s*\\))?$`,
  'i',
);

function sanitizeUsingExpression(rawExpression: string): string {
  const expr = (rawExpression ?? '').trim();
  if (!expr || !USING_EXPRESSION_RE.test(expr)) {
    throw new Error(
      `Invalid USING expression "${rawExpression}". Only "column_name::type" expressions are allowed, ` +
      `where type is one of: ${ALLOWED_BASE_COLUMN_TYPES.join(', ')}.`,
    );
  }
  return expr;
}

function validateSchemaAccess(schemaName: string): void {
  if (PROTECTED_SCHEMAS.has(schemaName)) {
    throw new ForbiddenError(`Schema "${schemaName}" is protected and cannot be modified.`);
  }
}

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Authentication helper
// ---------------------------------------------------------------------------

async function authenticateCaller(
  authHeader: string | null,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ userId: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ForbiddenError('Missing or invalid Authorization header.');
  }

  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });

  // Verify the JWT and extract user
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new ForbiddenError('Invalid or expired token.');
  }

  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function logAudit(
  pool: Pool,
  userId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject(
      `INSERT INTO nc_meta.audit_log (user_id, action, new_value, created_at)
       VALUES ($1, $2, $3, now())`,
      [userId, action, JSON.stringify(details)],
    );
  } catch {
    // Audit logging is best-effort; do not fail the request.
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// DDL action handlers
// ---------------------------------------------------------------------------

async function handleCreateSchema(
  pool: Pool,
  body: { schemaName: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  validateSchemaAccess(body.schemaName);

  const conn = await pool.connect();
  try {
    await conn.queryObject(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  } finally {
    conn.release();
  }
}

async function handleCreateTable(
  pool: Pool,
  body: { schemaName: string; tableName: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  validateSchemaAccess(body.schemaName);

  const qualified = `${schema}.${table}`;

  const conn = await pool.connect();
  try {
    await conn.queryObject(`
      CREATE TABLE ${qualified} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by UUID REFERENCES auth.users(id),
        nc_order FLOAT
      )
    `);

    // Updated_at trigger
    await conn.queryObject(`
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON ${qualified}
        FOR EACH ROW
        EXECUTE FUNCTION nc_meta.nc_update_timestamp()
    `);

    // Enable RLS
    await conn.queryObject(`ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY`);

    // RLS policies
    await conn.queryObject(`
      CREATE POLICY "Authenticated users can select"
        ON ${qualified} FOR SELECT
        TO authenticated
        USING (true)
    `);

    await conn.queryObject(`
      CREATE POLICY "Authenticated users can insert"
        ON ${qualified} FOR INSERT
        TO authenticated
        WITH CHECK (true)
    `);

    await conn.queryObject(`
      CREATE POLICY "Authenticated users can update"
        ON ${qualified} FOR UPDATE
        TO authenticated
        USING (true)
    `);

    await conn.queryObject(`
      CREATE POLICY "Authenticated users can delete"
        ON ${qualified} FOR DELETE
        TO authenticated
        USING (true)
    `);
  } finally {
    conn.release();
  }
}

async function handleAddColumn(
  pool: Pool,
  body: {
    schemaName: string;
    tableName: string;
    columnName: string;
    columnType: string;
    isRequired?: boolean;
    isUnique?: boolean;
    defaultValue?: string;
  },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  const column = sanitizeIdentifier(body.columnName);
  validateSchemaAccess(body.schemaName);

  const columnType = sanitizeColumnType(body.columnType);
  let ddl = `ALTER TABLE ${schema}.${table} ADD COLUMN ${column} ${columnType}`;

  if (body.defaultValue !== undefined) {
    const defaultValue = sanitizeDefaultValue(body.defaultValue);
    ddl += ` DEFAULT ${defaultValue}`;
  }
  if (body.isRequired) {
    ddl += ' NOT NULL';
  }
  if (body.isUnique) {
    ddl += ' UNIQUE';
  }

  const conn = await pool.connect();
  try {
    await conn.queryObject(ddl);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('already exists')) {
      throw new Error(`Column "${body.columnName}" already exists in this table.`);
    }
    if (msg.includes('does not exist')) {
      throw new Error(`Table "${body.tableName}" does not exist in schema "${body.schemaName}".`);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function handleBulkAddColumns(
  pool: Pool,
  body: {
    schemaName: string;
    tableName: string;
    columns: Array<{
      columnName: string;
      columnType: string;
      isRequired?: boolean;
      isUnique?: boolean;
      defaultValue?: string;
    }>;
  },
): Promise<{ added: string[] }> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  validateSchemaAccess(body.schemaName);

  const added: string[] = [];
  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');
    for (const col of body.columns) {
      const colName = (col as any).columnName ?? (col as any).name;
      const colType = (col as any).columnType ?? (col as any).type;
      if (!colName || !colType) continue;
      const column = sanitizeIdentifier(colName);
      const columnType = sanitizeColumnType(colType);
      let ddl = `ALTER TABLE ${schema}.${table} ADD COLUMN IF NOT EXISTS ${column} ${columnType}`;
      if (col.defaultValue !== undefined) {
        ddl += ` DEFAULT ${sanitizeDefaultValue(col.defaultValue)}`;
      }
      if (col.isRequired) ddl += ' NOT NULL';
      if (col.isUnique) ddl += ' UNIQUE';
      await conn.queryObject(ddl);
      added.push(colName);
    }
    await conn.queryObject('COMMIT');
  } catch (err) {
    try { await conn.queryObject('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
  return { added };
}

async function handleDropColumn(
  pool: Pool,
  body: { schemaName: string; tableName: string; columnName: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  const column = sanitizeIdentifier(body.columnName);
  validateSchemaAccess(body.schemaName);

  const conn = await pool.connect();
  try {
    await conn.queryObject(`ALTER TABLE ${schema}.${table} DROP COLUMN ${column}`);
  } finally {
    conn.release();
  }
}

async function handleDropColumnAndMeta(
  pool: Pool,
  body: { schemaName: string; tableName: string; columnName: string; fieldId: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  const column = sanitizeIdentifier(body.columnName);
  validateSchemaAccess(body.schemaName);

  if (!body.fieldId) throw new Error('fieldId is required');

  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');
    await conn.queryObject(`ALTER TABLE ${schema}.${table} DROP COLUMN ${column}`);
    await conn.queryObject(
      `DELETE FROM nc_meta.fields WHERE id = $1`,
      [body.fieldId],
    );
    await conn.queryObject('COMMIT');
  } catch (err) {
    await conn.queryObject('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

async function handleDeleteVirtualFieldMeta(
  pool: Pool,
  body: { fieldId: string },
): Promise<void> {
  if (!body.fieldId) throw new Error('fieldId is required');

  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');
    // Clean up child rows (best-effort, FK CASCADE handles orphans)
    for (const tbl of ['formulas', 'lookups', 'rollups']) {
      await conn.queryObject(
        `DELETE FROM nc_meta.${tbl} WHERE field_id = $1`,
        [body.fieldId],
      );
    }
    await conn.queryObject(
      `DELETE FROM nc_meta.fields WHERE id = $1`,
      [body.fieldId],
    );
    await conn.queryObject('COMMIT');
  } catch (err) {
    await conn.queryObject('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

async function handleRenameColumn(
  pool: Pool,
  body: { schemaName: string; tableName: string; oldName: string; newName: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  const oldCol = sanitizeIdentifier(body.oldName);
  const newCol = sanitizeIdentifier(body.newName);
  validateSchemaAccess(body.schemaName);

  const conn = await pool.connect();
  try {
    await conn.queryObject(
      `ALTER TABLE ${schema}.${table} RENAME COLUMN ${oldCol} TO ${newCol}`,
    );
  } finally {
    conn.release();
  }
}

async function handleRenameTable(
  pool: Pool,
  body: { schemaName: string; oldName: string; newName: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const oldTable = sanitizeIdentifier(body.oldName);
  const newTable = sanitizeIdentifier(body.newName);
  validateSchemaAccess(body.schemaName);

  const conn = await pool.connect();
  try {
    await conn.queryObject(
      `ALTER TABLE ${schema}.${oldTable} RENAME TO ${newTable}`,
    );
  } finally {
    conn.release();
  }
}

async function handleDropTable(
  pool: Pool,
  body: { schemaName: string; tableName: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  validateSchemaAccess(body.schemaName);

  const conn = await pool.connect();
  try {
    await conn.queryObject(`DROP TABLE ${schema}.${table}`);
  } finally {
    conn.release();
  }
}

async function handleAlterColumnConstraints(
  pool: Pool,
  body: {
    schemaName: string;
    tableName: string;
    columnName: string;
    setNotNull?: boolean;
    setUnique?: boolean;
  },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  const column = sanitizeIdentifier(body.columnName);
  validateSchemaAccess(body.schemaName);

  const qualified = `${schema}.${table}`;
  const conn = await pool.connect();
  try {
    if (body.setNotNull === true) {
      await conn.queryObject(`ALTER TABLE ${qualified} ALTER COLUMN ${column} SET NOT NULL`);
    } else if (body.setNotNull === false) {
      await conn.queryObject(`ALTER TABLE ${qualified} ALTER COLUMN ${column} DROP NOT NULL`);
    }

    if (body.setUnique === true) {
      const indexName = sanitizeIdentifier(`${body.tableName}_${body.columnName}_unique`);
      await conn.queryObject(`CREATE UNIQUE INDEX ${indexName} ON ${qualified} (${column})`);
    } else if (body.setUnique === false) {
      const indexName = sanitizeIdentifier(`${body.tableName}_${body.columnName}_unique`);
      await conn.queryObject(`DROP INDEX IF EXISTS ${schema}.${indexName}`);
    }
  } finally {
    conn.release();
  }
}

async function handleDropSchema(
  pool: Pool,
  body: { schemaName: string },
): Promise<void> {
  const schema = sanitizeIdentifier(body.schemaName);
  validateSchemaAccess(body.schemaName);

  const conn = await pool.connect();
  try {
    await conn.queryObject(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);

    // Remove from PostgREST exposed schemas to prevent 503 crashes
    const { rows } = await conn.queryObject<{ config: string }>(
      `SELECT c AS config FROM (
         SELECT unnest(setconfig) AS c
         FROM pg_catalog.pg_db_role_setting
         JOIN pg_catalog.pg_roles ON pg_roles.oid = pg_db_role_setting.setrole
         WHERE rolname = 'authenticator'
       ) sub WHERE c LIKE 'pgrst.db_schemas=%'`,
    );
    const current = rows[0]?.config?.replace('pgrst.db_schemas=', '') ?? 'public';
    const schemas = current.split(',').map((s: string) => s.trim()).filter(Boolean);
    const filtered = schemas.filter((s: string) => s !== body.schemaName);
    if (filtered.length !== schemas.length) {
      await conn.queryObject(
        `ALTER ROLE authenticator SET pgrst.db_schemas = '${filtered.join(', ')}'`,
      );
      await conn.queryObject(`NOTIFY pgrst, 'reload config'`);
    }
  } finally {
    conn.release();
  }
}

async function handleExposeSchema(
  pool: Pool,
  body: { schemaName: string },
): Promise<void> {
  const rawName = body.schemaName;
  validateSchemaAccess(rawName);
  if (!IDENTIFIER_RE.test(rawName)) {
    throw new Error(`Invalid schema name: ${rawName}`);
  }

  const conn = await pool.connect();
  try {
    await conn.queryObject(`GRANT USAGE ON SCHEMA "${rawName}" TO authenticated, anon`);
    await conn.queryObject(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA "${rawName}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated`,
    );
    await conn.queryObject(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA "${rawName}" GRANT SELECT ON TABLES TO anon`,
    );

    const { rows } = await conn.queryObject<{ config: string }>(
      `SELECT c AS config FROM (
         SELECT unnest(setconfig) AS c
         FROM pg_catalog.pg_db_role_setting
         JOIN pg_catalog.pg_roles ON pg_roles.oid = pg_db_role_setting.setrole
         WHERE rolname = 'authenticator'
       ) sub WHERE c LIKE 'pgrst.db_schemas=%'`,
    );
    const current = rows[0]?.config?.replace('pgrst.db_schemas=', '') ?? 'public';
    const schemas = current.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (!schemas.includes('nc_meta')) schemas.push('nc_meta');
    if (!schemas.includes(rawName)) schemas.push(rawName);

    await conn.queryObject(
      `ALTER ROLE authenticator SET pgrst.db_schemas = '${schemas.join(', ')}'`,
    );
    await conn.queryObject(`NOTIFY pgrst, 'reload config'`);
    await conn.queryObject(`NOTIFY pgrst, 'reload schema'`);
  } finally {
    conn.release();
  }
}

async function handleRepairSchemaConfig(pool: Pool): Promise<{ schemas: string[] }> {
  const conn = await pool.connect();
  try {
    await conn.queryObject(`GRANT USAGE ON SCHEMA nc_meta TO authenticated, anon`);
    await conn.queryObject(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nc_meta TO authenticated`,
    );
    await conn.queryObject(
      `GRANT SELECT ON ALL TABLES IN SCHEMA nc_meta TO anon`,
    );
    await conn.queryObject(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA nc_meta GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated`,
    );
    await conn.queryObject(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA nc_meta GRANT SELECT ON TABLES TO anon`,
    );

    const { rows: bases } = await conn.queryObject<{ schema_name: string }>(
      `SELECT schema_name FROM nc_meta.bases`,
    );

    for (const base of bases) {
      const name = base.schema_name;
      if (!IDENTIFIER_RE.test(name)) continue;
      try {
        await conn.queryObject(`GRANT USAGE ON SCHEMA "${name}" TO authenticated, anon`);
        await conn.queryObject(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${name}" TO authenticated`,
        );
        await conn.queryObject(
          `GRANT SELECT ON ALL TABLES IN SCHEMA "${name}" TO anon`,
        );
      } catch {
        // Schema may have been dropped but metadata remains; skip it
      }
    }

    // Only register schemas that actually exist in Postgres
    const { rows: existingSchemas } = await conn.queryObject<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY($1)`,
      [bases.map((b) => b.schema_name)],
    );
    const existingSet = new Set(existingSchemas.map((s) => s.schema_name));
    const allSchemas = ['public', 'nc_meta', ...bases.map((b) => b.schema_name).filter((s) => existingSet.has(s))];
    const unique = [...new Set(allSchemas)];

    await conn.queryObject(
      `ALTER ROLE authenticator SET pgrst.db_schemas = '${unique.join(', ')}'`,
    );
    await conn.queryObject(`NOTIFY pgrst, 'reload config'`);
    await conn.queryObject(`NOTIFY pgrst, 'reload schema'`);

    return { schemas: unique };
  } finally {
    conn.release();
  }
}

async function handleAlterColumnType(
  pool: Pool,
  body: {
    schemaName: string;
    tableName: string;
    columnName: string;
    newType: string;
    usingExpression?: string;
  },
): Promise<{ rowsAffected?: number; nulledRows?: number }> {
  const schema = sanitizeIdentifier(body.schemaName);
  const table = sanitizeIdentifier(body.tableName);
  const column = sanitizeIdentifier(body.columnName);
  validateSchemaAccess(body.schemaName);

  const newType = sanitizeColumnType(body.newType);
  const usingExpr = body.usingExpression
    ? sanitizeUsingExpression(body.usingExpression)
    : `${column}::${newType}`;

  const qualified = `${schema}.${table}`;
  const conn = await pool.connect();
  try {
    await conn.queryObject('BEGIN');

    const beforeRes = await conn.queryObject<{ cnt: number }>(
      `SELECT count(*)::int AS cnt FROM ${qualified} WHERE ${column} IS NOT NULL`,
    );
    const nonNullBefore = beforeRes.rows[0]?.cnt ?? 0;

    try {
      await conn.queryObject(
        `ALTER TABLE ${qualified} ALTER COLUMN ${column} TYPE ${newType} USING ${usingExpr}`,
      );
    } catch (castErr) {
      await conn.queryObject('ROLLBACK');
      const msg = (castErr as Error).message || '';
      if (msg.includes('cannot cast') || msg.includes('invalid input syntax')) {
        throw new Error(
          `Cannot convert column "${body.columnName}" to ${newType}: some existing values are incompatible. ` +
          `Detail: ${msg}`,
        );
      }
      throw castErr;
    }

    const afterRes = await conn.queryObject<{ cnt: number }>(
      `SELECT count(*)::int AS cnt FROM ${qualified} WHERE ${column} IS NOT NULL`,
    );
    const nonNullAfter = afterRes.rows[0]?.cnt ?? 0;

    await conn.queryObject('COMMIT');

    return {
      rowsAffected: nonNullBefore,
      nulledRows: Math.max(0, nonNullBefore - nonNullAfter),
    };
  } catch (err) {
    try { await conn.queryObject('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
const pool = new Pool(dbUrl, 5, true);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    // Authenticate
    const { userId } = await authenticateCaller(
      req.headers.get('Authorization'),
      supabaseUrl,
      serviceRoleKey,
    );

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'createSchema':
        await handleCreateSchema(pool, body);
        break;
      case 'createTable':
        await handleCreateTable(pool, body);
        break;
      case 'addColumn':
        await handleAddColumn(pool, body);
        break;
      case 'bulkAddColumns': {
        const bulkResult = await handleBulkAddColumns(pool, body);
        await logAudit(pool, userId, action, { schemaName: body.schemaName, tableName: body.tableName, count: bulkResult.added.length });
        const reloadConn2 = await pool.connect();
        try { await reloadConn2.queryObject(`NOTIFY pgrst, 'reload schema'`); } catch { /* best-effort */ } finally { reloadConn2.release(); }
        return json({ success: true, ...bulkResult });
      }
      case 'dropColumn':
        await handleDropColumn(pool, body);
        break;
      case 'dropColumnAndMeta':
        await handleDropColumnAndMeta(pool, body);
        break;
      case 'renameColumn':
        await handleRenameColumn(pool, body);
        break;
      case 'renameTable':
        await handleRenameTable(pool, body);
        break;
      case 'dropTable':
        await handleDropTable(pool, body);
        break;
      case 'dropSchema':
        await handleDropSchema(pool, body);
        break;
      case 'exposeSchema':
        await handleExposeSchema(pool, body);
        break;
      case 'alterColumnType': {
        const result = await handleAlterColumnType(pool, body);
        await logAudit(pool, userId, action, body);
        return json({ success: true, ...result });
      }
      case 'alterColumnConstraints':
        await handleAlterColumnConstraints(pool, body);
        break;
      case 'deleteVirtualFieldMeta':
        await handleDeleteVirtualFieldMeta(pool, body);
        break;
      case 'repairSchemaConfig': {
        const result = await handleRepairSchemaConfig(pool);
        await logAudit(pool, userId, action, { schemas: result.schemas });
        return json({ success: true, ...result });
      }
      case 'reloadSchema': {
        const rc = await pool.connect();
        try {
          await rc.queryObject(`NOTIFY pgrst, 'reload schema'`);
        } finally { rc.release(); }
        return json({ success: true });
      }
      case 'linkedQuery': {
        const { fieldId: lqFieldId, mode: lqMode, searchTerm: lqSearch, direction: lqDir } = body;
        if (!lqFieldId) return json({ success: false, error: 'Missing fieldId' }, 400);
        const lqConn = await pool.connect();
        try {
          // Resolve field → link meta → junction/target table info
          const { rows: fieldRows } = await lqConn.queryObject<{ table_id: string; options: any }>(
            `SELECT table_id, options FROM nc_meta.fields WHERE id = $1`, [lqFieldId],
          );
          if (!fieldRows.length) return json({ success: false, error: 'Field not found' }, 404);
          const fieldRow = fieldRows[0];
          const relatedTableId = fieldRow.options?.relatedTableId;
          if (!relatedTableId) return json({ success: false, error: 'Not a link field' }, 400);

          // Get base schema
          const { rows: tableRows } = await lqConn.queryObject<{ base_id: string; pg_table_name: string }>(
            `SELECT base_id, pg_table_name FROM nc_meta.tables WHERE id = $1`, [fieldRow.table_id],
          );
          if (!tableRows.length) return json({ success: false, error: 'Source table not found' }, 404);
          const { rows: baseRows } = await lqConn.queryObject<{ schema_name: string }>(
            `SELECT schema_name FROM nc_meta.bases WHERE id = $1`, [tableRows[0].base_id],
          );
          if (!baseRows.length) return json({ success: false, error: 'Base not found' }, 404);
          const schemaName = baseRows[0].schema_name;
          const srcTable = tableRows[0].pg_table_name;

          // Get target table + primary field column
          const { rows: tgtRows } = await lqConn.queryObject<{ pg_table_name: string; primary_field_id: string }>(
            `SELECT pg_table_name, primary_field_id FROM nc_meta.tables WHERE id = $1`, [relatedTableId],
          );
          if (!tgtRows.length) return json({ success: false, error: 'Target table not found' }, 404);
          const tgtTable = tgtRows[0].pg_table_name;
          const primaryFieldId = tgtRows[0].primary_field_id;

          let primaryCol = 'id';
          if (primaryFieldId) {
            const { rows: pfRows } = await lqConn.queryObject<{ pg_column_name: string }>(
              `SELECT pg_column_name FROM nc_meta.fields WHERE id = $1`, [primaryFieldId],
            );
            if (pfRows.length) primaryCol = pfRows[0].pg_column_name;
          }

          // Get junction table
          const { rows: linkRows } = await lqConn.queryObject<{ junction_table_id: string }>(
            `SELECT junction_table_id FROM nc_meta.links WHERE field_id = $1`, [lqFieldId],
          );
          if (!linkRows.length || !linkRows[0].junction_table_id) {
            return json({ success: false, error: 'No junction table found' }, 404);
          }
          const { rows: jnRows } = await lqConn.queryObject<{ pg_table_name: string }>(
            `SELECT pg_table_name FROM nc_meta.tables WHERE id = $1`, [linkRows[0].junction_table_id],
          );
          if (!jnRows.length) return json({ success: false, error: 'Junction table not found' }, 404);
          const jnTable = jnRows[0].pg_table_name;

          const s = `"${schemaName}"`;

          if (lqMode === 'filter') {
            // Return source record IDs where any linked target record's primary field matches
            const sql = `
              SELECT DISTINCT src."id"::text AS id FROM ${s}."${srcTable}" src
              JOIN ${s}."${jnTable}" jn ON jn."source_id" = src."id" OR jn."target_id" = src."id"
              JOIN ${s}."${tgtTable}" tgt ON (tgt."id" = jn."target_id" OR tgt."id" = jn."source_id") AND tgt."id" != src."id"
              WHERE tgt."${primaryCol}"::text ILIKE $1
            `;
            const { rows: matchRows } = await lqConn.queryObject<{ id: string }>(sql, [`%${lqSearch}%`]);
            return json({ success: true, ids: matchRows.map((r) => r.id) });
          } else if (lqMode === 'sort') {
            // Return all source record IDs ordered by aggregated linked names
            const dir = lqDir === 'desc' ? 'DESC' : 'ASC';
            const sql = `
              SELECT src."id"::text AS id,
                     COALESCE(string_agg(tgt."${primaryCol}"::text, ', ' ORDER BY tgt."${primaryCol}"::text), '') AS linked_names
              FROM ${s}."${srcTable}" src
              LEFT JOIN ${s}."${jnTable}" jn ON jn."source_id" = src."id" OR jn."target_id" = src."id"
              LEFT JOIN ${s}."${tgtTable}" tgt ON (tgt."id" = jn."target_id" OR tgt."id" = jn."source_id") AND tgt."id" != src."id"
              GROUP BY src."id"
              ORDER BY linked_names ${dir}, src."nc_order" ASC
            `;
            const { rows: sortRows } = await lqConn.queryObject<{ id: string }>(sql, []);
            return json({ success: true, ids: sortRows.map((r) => r.id) });
          } else {
            return json({ success: false, error: 'mode must be "filter" or "sort"' }, 400);
          }
        } finally { lqConn.release(); }
      }
      case 'directQuery': {
        const { schemaName: dqSchema, tableName: dqTable, columns: dqCols, where: dqWhere, limit: dqLimit, offset: dqOffset } = body;
        if (!dqSchema || !dqTable) {
          return json({ success: false, error: 'Missing schemaName or tableName' }, 400);
        }
        const dqConn = await pool.connect();
        try {
          const cols = dqCols?.length ? dqCols.map((c: string) => `"${c}"`).join(', ') : '*';
          let sql = `SELECT ${cols} FROM "${dqSchema}"."${dqTable}"`;
          const params: unknown[] = [];
          if (dqWhere) {
            const clauses: string[] = [];
            for (const [col, op, val] of dqWhere) {
              if (op === 'IS NOT' && val === null) {
                clauses.push(`"${col}" IS NOT NULL`);
              } else if (op === 'IS' && val === null) {
                clauses.push(`"${col}" IS NULL`);
              } else {
                params.push(val);
                clauses.push(`"${col}" ${op} $${params.length}`);
              }
            }
            sql += ` WHERE ${clauses.join(' AND ')}`;
          }
          if (dqLimit) sql += ` LIMIT ${parseInt(String(dqLimit), 10)}`;
          if (dqOffset) sql += ` OFFSET ${parseInt(String(dqOffset), 10)}`;
          const { rows } = await dqConn.queryObject(sql, params);
          return json({ success: true, rows });
        } finally { dqConn.release(); }
      }
      case 'bulkInsert': {
        const { schemaName: biSchema, tableName: biTable, columns: biCols, rows: biRows } = body;
        if (!biSchema || !biTable || !biCols?.length || !biRows?.length) {
          return json({ success: false, error: 'Missing schemaName, tableName, columns, or rows' }, 400);
        }
        const conn = await pool.connect();
        try {
          const colList = biCols.map((c: string) => `"${c}"`).join(', ');
          const batchSize = 200;
          let inserted = 0;
          for (let i = 0; i < biRows.length; i += batchSize) {
            const chunk = biRows.slice(i, i + batchSize);
            const valueClauses: string[] = [];
            const params: unknown[] = [];
            for (const row of chunk) {
              const placeholders: string[] = [];
              for (const col of biCols) {
                params.push(row[col] ?? null);
                placeholders.push(`$${params.length}`);
              }
              valueClauses.push(`(${placeholders.join(', ')})`);
            }
            await conn.queryObject(
              `INSERT INTO "${biSchema}"."${biTable}" (${colList}) VALUES ${valueClauses.join(', ')}`,
              params,
            );
            inserted += chunk.length;
          }
          return json({ success: true, inserted });
        } finally { conn.release(); }
      }
      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }

    // Audit log (best-effort)
    await logAudit(pool, userId, action, body);

    // Reload PostgREST schema cache after any DDL change
    const reloadConn = await pool.connect();
    try {
      await reloadConn.queryObject(`NOTIFY pgrst, 'reload schema'`);
    } catch { /* best-effort */ } finally {
      reloadConn.release();
    }

    return json({ success: true });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return json({ success: false, error: err.message }, 403);
    }
    console.error('DDL Executor error:', (err as Error).message, (err as Error).stack);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
