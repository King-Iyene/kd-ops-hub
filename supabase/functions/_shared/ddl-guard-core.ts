// ddl-executor: who may call it, and what it may touch. Pure parts, no Deno APIs (vitest imports this file).
//
// ddl-executor runs over the postgres pool as the database owner, so it bypasses RLS and column grants. Two rules
// keep that safe:
//   1. Only an ACTIVE Super Admin may call it. The role is read from public.profiles with the service client by the
//      caller's verified user id, never from JWT claims or the request body.
//   2. Every schema/table/column name that ends up in SQL must be a plain lower-case identifier, is double-quoted by
//      quoteIdent, and never lies in a system schema. Values always travel as bind parameters.

export class GuardError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'GuardError';
    this.status = status;
  }
}

/** Schemas the data actions (directQuery, bulkInsert, linkedQuery) and the DDL actions must never touch. */
export const DENY_SCHEMAS: ReadonlySet<string> = new Set([
  'auth',
  'vault',
  'storage',
  'pg_catalog',
  'information_schema',
  'supabase_functions',
  'extensions',
  'cron',
  'net',
  'realtime',
  // also off limits: Supabase/Postgres internals that hold secrets or migration history
  'pgsodium',
  'pgsodium_masks',
  'supabase_migrations',
  'graphql',
  'graphql_public',
  'pgbouncer',
  'pg_toast',
]);

export const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;
export const MAX_IDENTIFIER_LENGTH = 63;

/** Returns the identifier unchanged when it is a plain lower-case Postgres name, otherwise throws (400). */
export function validIdent(name: unknown, what = 'identifier'): string {
  if (typeof name !== 'string' || !name || name.length > MAX_IDENTIFIER_LENGTH || !IDENTIFIER_RE.test(name)) {
    throw new GuardError(`Invalid ${what}. Must match ${IDENTIFIER_RE} and be at most ${MAX_IDENTIFIER_LENGTH} characters.`);
  }
  return name;
}

/** "name" -> '"name"'. Validates first, so the quotes can never be broken out of. */
export function quoteIdent(name: unknown, what = 'identifier'): string {
  return `"${validIdent(name, what)}"`;
}

/** A schema is refused when it is a system schema (deny-list or any pg_ prefix). Throws 403. */
export function isDeniedSchema(schema: unknown): boolean {
  return typeof schema === 'string' && (DENY_SCHEMAS.has(schema) || schema.startsWith('pg_'));
}

/** Validates a schema name for a data action and refuses system schemas. Returns the raw (unquoted) name. */
export function assertSchemaAllowed(schema: unknown): string {
  const s = validIdent(schema, 'schema name');
  if (isDeniedSchema(s)) throw new GuardError(`Schema "${s}" is not accessible through ddl-executor.`, 403);
  return s;
}

/** True only for an active Super Admin profile row (read from the database, not from the token). */
export function isActiveSuperAdmin(profile: { role?: unknown; status?: unknown } | null | undefined): boolean {
  return !!profile && profile.role === 'super_admin' && profile.status === 'active';
}

// ── directQuery ─────────────────────────────────────────────────────────────

const WHERE_OPS = new Set(['=', '!=', '<>', '<', '<=', '>', '>=', 'LIKE', 'ILIKE', 'IS', 'IS NOT']);
export const MAX_QUERY_LIMIT = 10000;
export const MAX_QUERY_COLUMNS = 200;
export const MAX_WHERE_CLAUSES = 20;

export interface BuiltQuery { sql: string; params: unknown[] }

function boundedInt(v: unknown, what: string, max: number): number | null {
  if (v === undefined || v === null || v === 0 || v === '0') return null;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== String(v).trim()) throw new GuardError(`Invalid ${what}.`);
  return Math.min(n, max);
}

/** SELECT for the directQuery action. Identifiers are validated and quoted, values are bind parameters. */
export function buildDirectQuery(body: Record<string, unknown>): BuiltQuery {
  const { schemaName, tableName, columns, where, limit, offset } = body;
  if (!schemaName || !tableName) throw new GuardError('Missing schemaName or tableName');
  const schema = assertSchemaAllowed(schemaName);
  const table = validIdent(tableName, 'table name');

  let cols = '*';
  if (columns !== undefined && columns !== null) {
    if (!Array.isArray(columns) || columns.length > MAX_QUERY_COLUMNS) throw new GuardError('Invalid columns.');
    if (columns.length) cols = columns.map((c) => quoteIdent(c, 'column name')).join(', ');
  }

  let sql = `SELECT ${cols} FROM ${quoteIdent(schema)}.${quoteIdent(table)}`;
  const params: unknown[] = [];
  if (where !== undefined && where !== null) {
    if (!Array.isArray(where) || where.length > MAX_WHERE_CLAUSES) throw new GuardError('Invalid where.');
    const clauses: string[] = [];
    for (const w of where) {
      if (!Array.isArray(w) || w.length !== 3) throw new GuardError('Each where clause must be [column, operator, value].');
      const [col, rawOp, val] = w;
      const column = quoteIdent(col, 'column name');
      const op = typeof rawOp === 'string' ? rawOp.trim().replace(/\s+/g, ' ').toUpperCase() : '';
      if (!WHERE_OPS.has(op)) throw new GuardError(`Operator "${String(rawOp)}" is not allowed.`);
      if (op === 'IS' || op === 'IS NOT') {
        if (val !== null) throw new GuardError(`${op} only supports NULL.`);
        clauses.push(`${column} ${op} NULL`);
      } else {
        params.push(val);
        clauses.push(`${column} ${op} $${params.length}`);
      }
    }
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  }
  const lim = boundedInt(limit, 'limit', MAX_QUERY_LIMIT);
  if (lim) sql += ` LIMIT ${lim}`;
  const off = boundedInt(offset, 'offset', Number.MAX_SAFE_INTEGER);
  if (off) sql += ` OFFSET ${off}`;
  return { sql, params };
}

// ── bulkInsert ──────────────────────────────────────────────────────────────

export const BULK_INSERT_BATCH = 200;
export const MAX_BULK_ROWS = 50000;

export interface BulkInsertPlan { qualified: string; colList: string; columns: string[]; rows: Record<string, unknown>[] }

export function planBulkInsert(body: Record<string, unknown>): BulkInsertPlan {
  const { schemaName, tableName, columns, rows } = body;
  if (!schemaName || !tableName || !Array.isArray(columns) || !columns.length || !Array.isArray(rows) || !rows.length) {
    throw new GuardError('Missing schemaName, tableName, columns, or rows');
  }
  if (columns.length > MAX_QUERY_COLUMNS || rows.length > MAX_BULK_ROWS) throw new GuardError('Too many columns or rows.');
  const schema = assertSchemaAllowed(schemaName);
  const table = validIdent(tableName, 'table name');
  const cols = columns.map((c) => validIdent(c, 'column name'));
  for (const r of rows) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new GuardError('Each row must be an object.');
  }
  return {
    qualified: `${quoteIdent(schema)}.${quoteIdent(table)}`,
    colList: cols.map((c) => `"${c}"`).join(', '),
    columns: cols,
    rows: rows as Record<string, unknown>[],
  };
}

/** INSERT for one chunk of rows: placeholders only, values in params. */
export function buildInsertBatch(plan: BulkInsertPlan, chunk: Record<string, unknown>[]): BuiltQuery {
  const valueClauses: string[] = [];
  const params: unknown[] = [];
  for (const row of chunk) {
    const placeholders: string[] = [];
    for (const col of plan.columns) {
      params.push(row[col] ?? null);
      placeholders.push(`$${params.length}`);
    }
    valueClauses.push(`(${placeholders.join(', ')})`);
  }
  return { sql: `INSERT INTO ${plan.qualified} (${plan.colList}) VALUES ${valueClauses.join(', ')}`, params };
}
