import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Pool } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;

function validateId(name: string): string {
  if (!IDENTIFIER_RE.test(name) || name.length > 63) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

const PROTECTED_SCHEMAS = new Set([
  'nc_meta', 'auth', 'public', 'storage', 'extensions',
  'supabase_migrations', 'information_schema', 'pg_catalog',
]);

interface FilterDef {
  field: string;
  operator: string;
  value: unknown;
}

interface SortDef {
  field: string;
  direction: 'asc' | 'desc';
}

function buildWhereClause(filters: FilterDef[], paramOffset: number): { sql: string; params: unknown[] } {
  if (!filters.length) return { sql: '', params: [] };
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = paramOffset;

  for (const f of filters) {
    const col = validateId(f.field);
    switch (f.operator) {
      case 'is':
      case 'eq':
        clauses.push(`${col} = $${++idx}`);
        params.push(f.value);
        break;
      case 'isNot':
      case 'neq':
        clauses.push(`${col} != $${++idx}`);
        params.push(f.value);
        break;
      case 'contains':
        clauses.push(`${col} ILIKE $${++idx}`);
        params.push(`%${f.value}%`);
        break;
      case 'doesNotContain':
        clauses.push(`${col} NOT ILIKE $${++idx}`);
        params.push(`%${f.value}%`);
        break;
      case 'startsWith':
        clauses.push(`${col} ILIKE $${++idx}`);
        params.push(`${f.value}%`);
        break;
      case 'endsWith':
        clauses.push(`${col} ILIKE $${++idx}`);
        params.push(`%${f.value}`);
        break;
      case 'gt':
        clauses.push(`${col} > $${++idx}`);
        params.push(f.value);
        break;
      case 'gte':
        clauses.push(`${col} >= $${++idx}`);
        params.push(f.value);
        break;
      case 'lt':
        clauses.push(`${col} < $${++idx}`);
        params.push(f.value);
        break;
      case 'lte':
        clauses.push(`${col} <= $${++idx}`);
        params.push(f.value);
        break;
      case 'isEmpty':
        clauses.push(`(${col} IS NULL OR ${col}::text = '')`);
        break;
      case 'isNotEmpty':
        clauses.push(`(${col} IS NOT NULL AND ${col}::text != '')`);
        break;
      case 'isBefore':
        clauses.push(`${col} < $${++idx}`);
        params.push(f.value);
        break;
      case 'isAfter':
        clauses.push(`${col} > $${++idx}`);
        params.push(f.value);
        break;
      case 'isOnOrBefore':
        clauses.push(`${col} <= $${++idx}`);
        params.push(f.value);
        break;
      case 'isOnOrAfter':
        clauses.push(`${col} >= $${++idx}`);
        params.push(f.value);
        break;
      case 'isBetween':
        if (Array.isArray(f.value) && f.value.length === 2) {
          clauses.push(`${col} >= $${++idx} AND ${col} <= $${++idx}`);
          params.push(f.value[0], f.value[1]);
        }
        break;
      case 'isAnyOf':
        if (Array.isArray(f.value) && f.value.length) {
          const placeholders = f.value.map(() => `$${++idx}`).join(', ');
          clauses.push(`${col} IN (${placeholders})`);
          params.push(...f.value);
        }
        break;
      case 'isNoneOf':
        if (Array.isArray(f.value) && f.value.length) {
          const placeholders = f.value.map(() => `$${++idx}`).join(', ');
          clauses.push(`${col} NOT IN (${placeholders})`);
          params.push(...f.value);
        }
        break;
      case 'isExactly':
        clauses.push(`${col}::text = $${++idx}`);
        params.push(JSON.stringify(f.value));
        break;
      default:
        break;
    }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function buildOrderClause(sorts: SortDef[]): string {
  if (!sorts.length) return 'ORDER BY "nc_order" ASC NULLS LAST, "created_at" ASC';
  const parts = sorts.map(s => {
    const col = validateId(s.field);
    const dir = s.direction === 'desc' ? 'DESC' : 'ASC';
    return `${col} ${dir} NULLS LAST`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { action, schemaName, tableName, record, recordId, filters, sorts, page, pageSize, search, searchFields } = body;

    if (!schemaName || !tableName) {
      return jsonResponse({ error: 'schemaName and tableName are required' }, 400);
    }
    if (PROTECTED_SCHEMAS.has(schemaName)) {
      return jsonResponse({ error: 'Cannot operate on protected schema' }, 403);
    }

    const { data: baseAccess, error: accessError } = await supabase
      .schema('nc_meta')
      .from('bases')
      .select('id')
      .eq('schema_name', schemaName)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (accessError || !baseAccess) {
      return jsonResponse({ error: 'Access denied to this schema' }, 403);
    }

    const schema = validateId(schemaName);
    const table = validateId(tableName);
    const fqn = `${schema}.${table}`;

    const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
    const pool = new Pool(dbUrl, 1, true);
    const conn = await pool.connect();

    try {
      switch (action) {
        case 'list': {
          const pg = page && page > 0 ? page : 1;
          const ps = pageSize && pageSize > 0 ? Math.min(pageSize, 1000) : 50;
          const offset = (pg - 1) * ps;

          let searchClause = '';
          const searchParams: unknown[] = [];
          if (search && searchFields?.length) {
            const conditions = searchFields.map((sf: string) => {
              const col = validateId(sf);
              searchParams.push(`%${search}%`);
              return `${col}::text ILIKE $${searchParams.length}`;
            });
            searchClause = `WHERE (${conditions.join(' OR ')})`;
          }

          const { sql: filterSql, params: filterParams } = buildWhereClause(
            filters || [],
            searchParams.length
          );

          let whereClause: string;
          const allParams = [...searchParams, ...filterParams];
          if (searchClause && filterSql) {
            whereClause = `${searchClause} AND ${filterSql.replace('WHERE ', '')}`;
          } else {
            whereClause = searchClause || filterSql;
          }

          const orderClause = buildOrderClause(sorts || []);
          const limitIdx = allParams.length + 1;
          const offsetIdx = allParams.length + 2;

          const countResult = await conn.queryObject<{ count: string }>(
            `SELECT COUNT(*) as count FROM ${fqn} ${whereClause}`,
            allParams,
          );
          const totalCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

          const dataResult = await conn.queryObject(
            `SELECT * FROM ${fqn} ${whereClause} ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            [...allParams, ps, offset],
          );

          return jsonResponse({
            records: dataResult.rows,
            totalCount,
            page: pg,
            pageSize: ps,
            totalPages: Math.ceil(totalCount / ps),
          });
        }

        case 'get': {
          if (!recordId) return jsonResponse({ error: 'recordId required' }, 400);
          const result = await conn.queryObject(
            `SELECT * FROM ${fqn} WHERE "id" = $1`,
            [recordId],
          );
          if (!result.rows.length) return jsonResponse({ error: 'Not found' }, 404);
          return jsonResponse({ record: result.rows[0] });
        }

        case 'create': {
          if (!record || typeof record !== 'object') {
            return jsonResponse({ error: 'record object required' }, 400);
          }
          const rec = { ...record, created_by: user.id };
          const keys = Object.keys(rec);
          const cols = keys.map(k => validateId(k)).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const vals = keys.map(k => rec[k]);

          const result = await conn.queryObject(
            `INSERT INTO ${fqn} (${cols}) VALUES (${placeholders}) RETURNING *`,
            vals,
          );
          return jsonResponse({ record: result.rows[0] }, 201);
        }

        case 'update': {
          if (!recordId || !record) {
            return jsonResponse({ error: 'recordId and record required' }, 400);
          }
          const keys = Object.keys(record);
          if (!keys.length) return jsonResponse({ error: 'No fields to update' }, 400);

          const setClauses = keys.map((k, i) => `${validateId(k)} = $${i + 1}`).join(', ');
          const vals = keys.map(k => record[k]);
          vals.push(recordId);

          const result = await conn.queryObject(
            `UPDATE ${fqn} SET ${setClauses} WHERE "id" = $${vals.length} RETURNING *`,
            vals,
          );
          if (!result.rows.length) return jsonResponse({ error: 'Not found' }, 404);
          return jsonResponse({ record: result.rows[0] });
        }

        case 'delete': {
          if (!recordId) return jsonResponse({ error: 'recordId required' }, 400);
          await conn.queryObject(
            `DELETE FROM ${fqn} WHERE "id" = $1`,
            [recordId],
          );
          return jsonResponse({ success: true });
        }

        case 'bulkCreate': {
          const records = body.records;
          if (!Array.isArray(records) || !records.length) {
            return jsonResponse({ error: 'records array required' }, 400);
          }
          const maxBatch = 500;
          if (records.length > maxBatch) {
            return jsonResponse({ error: `Max ${maxBatch} records per batch` }, 400);
          }
          const created: unknown[] = [];
          for (const rec of records) {
            const r = { ...rec, created_by: user.id };
            const keys = Object.keys(r);
            const cols = keys.map(k => validateId(k)).join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const vals = keys.map(k => r[k]);
            const result = await conn.queryObject(
              `INSERT INTO ${fqn} (${cols}) VALUES (${placeholders}) RETURNING *`,
              vals,
            );
            created.push(result.rows[0]);
          }
          return jsonResponse({ records: created, count: created.length }, 201);
        }

        case 'bulkUpdate': {
          const updates = body.updates;
          if (!Array.isArray(updates) || !updates.length) {
            return jsonResponse({ error: 'updates array required (each with id and fields)' }, 400);
          }
          const maxBatch = 500;
          if (updates.length > maxBatch) {
            return jsonResponse({ error: `Max ${maxBatch} updates per batch` }, 400);
          }
          const updated: unknown[] = [];
          for (const upd of updates) {
            if (!upd.id || !upd.fields || !Object.keys(upd.fields).length) continue;
            const keys = Object.keys(upd.fields);
            const setClauses = keys.map((k, i) => `${validateId(k)} = $${i + 1}`).join(', ');
            const vals = keys.map(k => upd.fields[k]);
            vals.push(upd.id);
            const result = await conn.queryObject(
              `UPDATE ${fqn} SET ${setClauses} WHERE "id" = $${vals.length} RETURNING *`,
              vals,
            );
            if (result.rows.length) updated.push(result.rows[0]);
          }
          return jsonResponse({ records: updated, count: updated.length });
        }

        case 'bulkDelete': {
          const recordIds = body.recordIds;
          if (!Array.isArray(recordIds) || !recordIds.length) {
            return jsonResponse({ error: 'recordIds array required' }, 400);
          }
          const maxBatch = 500;
          if (recordIds.length > maxBatch) {
            return jsonResponse({ error: `Max ${maxBatch} deletes per batch` }, 400);
          }
          const placeholders = recordIds.map((_: unknown, i: number) => `$${i + 1}`).join(', ');
          const result = await conn.queryObject(
            `DELETE FROM ${fqn} WHERE "id" IN (${placeholders}) RETURNING "id"`,
            recordIds,
          );
          return jsonResponse({ deleted: result.rows.length });
        }

        default:
          return jsonResponse({ error: `Unknown action: ${action}` }, 400);
      }
    } finally {
      conn.release();
      await pool.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return jsonResponse({ error: message }, 500);
  }
});
