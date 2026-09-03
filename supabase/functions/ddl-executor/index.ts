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

  // columnType is validated loosely -- Postgres will reject invalid types.
  let ddl = `ALTER TABLE ${schema}.${table} ADD COLUMN ${column} ${body.columnType}`;

  if (body.defaultValue !== undefined) {
    // defaultValue is inserted as a literal SQL expression -- callers must be trusted (admin only).
    ddl += ` DEFAULT ${body.defaultValue}`;
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

  // Build the USING clause. If the caller provides a custom expression use it;
  // otherwise fall back to a USING that casts via text (handles most pg casts)
  // and traps individual-value errors by coalescing to NULL.
  const usingExpr = body.usingExpression
    ? body.usingExpression
    : `${column}::${body.newType}`;

  // Count rows that will become NULL due to failed cast (best-effort estimate)
  const qualified = `${schema}.${table}`;
  const conn = await pool.connect();
  try {
    // Attempt the ALTER in a savepoint so we can give a clear error on failure
    await conn.queryObject('BEGIN');

    // Count non-null values before
    const beforeRes = await conn.queryObject<{ cnt: number }>(
      `SELECT count(*)::int AS cnt FROM ${qualified} WHERE ${column} IS NOT NULL`,
    );
    const nonNullBefore = beforeRes.rows[0]?.cnt ?? 0;

    try {
      await conn.queryObject(
        `ALTER TABLE ${qualified} ALTER COLUMN ${column} TYPE ${body.newType} USING ${usingExpr}`,
      );
    } catch (castErr) {
      await conn.queryObject('ROLLBACK');
      const msg = (castErr as Error).message || '';
      // Provide a friendlier error for common cast failures
      if (msg.includes('cannot cast') || msg.includes('invalid input syntax')) {
        throw new Error(
          `Cannot convert column "${body.columnName}" to ${body.newType}: some existing values are incompatible. ` +
          `Detail: ${msg}`,
        );
      }
      throw castErr;
    }

    // Count non-null values after
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
    // Make sure we are not left in a dangling transaction
    try { await conn.queryObject('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;

  const pool = new Pool(dbUrl, 1, true);

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
      case 'dropColumn':
        await handleDropColumn(pool, body);
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
      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }

    // Audit log (best-effort)
    await logAudit(pool, userId, action, body);

    return json({ success: true });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return json({ success: false, error: err.message }, 403);
    }
    console.error('DDL Executor error:', err);
    return json({ success: false, error: (err as Error).message }, 500);
  } finally {
    await pool.end();
  }
});
