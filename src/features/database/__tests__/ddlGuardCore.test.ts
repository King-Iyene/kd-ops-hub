import { describe, expect, it } from 'vitest';
import {
  DENY_SCHEMAS,
  GuardError,
  assertSchemaAllowed,
  buildDirectQuery,
  buildInsertBatch,
  isActiveSuperAdmin,
  isDeniedSchema,
  planBulkInsert,
  quoteIdent,
  validIdent,
} from '../../../../supabase/functions/_shared/ddl-guard-core';

describe('who may call ddl-executor', () => {
  it('lets an active super_admin through', () => {
    expect(isActiveSuperAdmin({ role: 'super_admin', status: 'active' })).toBe(true);
  });
  it('refuses every other role, even an admin', () => {
    for (const role of ['admin', 'finance', 'operations', 'field_staff', 'driver', '', null, undefined]) {
      expect(isActiveSuperAdmin({ role, status: 'active' })).toBe(false);
    }
  });
  it('refuses a super_admin who is not active', () => {
    for (const status of ['inactive', 'invited', '', null, undefined]) {
      expect(isActiveSuperAdmin({ role: 'super_admin', status })).toBe(false);
    }
  });
  it('refuses a missing profile row', () => {
    expect(isActiveSuperAdmin(null)).toBe(false);
    expect(isActiveSuperAdmin(undefined)).toBe(false);
    expect(isActiveSuperAdmin({})).toBe(false);
  });
});

describe('identifiers', () => {
  it('accepts plain lower-case names and quotes them', () => {
    expect(validIdent('kd_sheet_1')).toBe('kd_sheet_1');
    expect(validIdent('_private')).toBe('_private');
    expect(quoteIdent('salaries')).toBe('"salaries"');
  });
  it('rejects anything that could break out of the quotes', () => {
    for (const bad of ['', 'Users', '1abc', 'a-b', 'a b', 'a"b', 'a;drop table x', 'a.b', "a'b", 'x'.repeat(64), 5, null, undefined, {}]) {
      expect(() => quoteIdent(bad)).toThrow(GuardError);
    }
  });
});

describe('schema deny-list', () => {
  const required = ['auth', 'vault', 'storage', 'pg_catalog', 'information_schema', 'supabase_functions', 'extensions', 'cron', 'net', 'realtime'];
  it('holds every required system schema', () => {
    for (const s of required) {
      expect(DENY_SCHEMAS.has(s)).toBe(true);
      expect(isDeniedSchema(s)).toBe(true);
      expect(() => assertSchemaAllowed(s)).toThrow(/not accessible/);
    }
  });
  it('refuses any pg_ prefixed schema', () => {
    expect(isDeniedSchema('pg_toast')).toBe(true);
    expect(isDeniedSchema('pg_temp_3')).toBe(true);
  });
  it('allows an ordinary schema, and a denied one is a 403', () => {
    expect(assertSchemaAllowed('base_abc123')).toBe('base_abc123');
    try { assertSchemaAllowed('auth'); } catch (e) { expect((e as GuardError).status).toBe(403); }
  });
  it('is not fooled by case or quoting tricks', () => {
    expect(() => assertSchemaAllowed('Auth')).toThrow(GuardError);       // fails the identifier rule
    expect(() => assertSchemaAllowed('auth"; --')).toThrow(GuardError);
  });
});

describe('directQuery', () => {
  it('builds a quoted select with bind parameters', () => {
    const q = buildDirectQuery({
      schemaName: 'base_x', tableName: 'tbl_y', columns: ['id', 'airtable_id'],
      where: [['name', '=', "o'brien"], ['link', 'IS NOT', null]], limit: 1000, offset: 2000,
    });
    expect(q.sql).toBe('SELECT "id", "airtable_id" FROM "base_x"."tbl_y" WHERE "name" = $1 AND "link" IS NOT NULL LIMIT 1000 OFFSET 2000');
    expect(q.params).toEqual(["o'brien"]);
  });
  it('selects * when no columns are asked for, and skips a zero offset', () => {
    expect(buildDirectQuery({ schemaName: 'base_x', tableName: 'tbl_y', offset: 0 }).sql).toBe('SELECT * FROM "base_x"."tbl_y"');
  });
  it('refuses system schemas', () => {
    for (const s of ['auth', 'vault', 'storage', 'pg_catalog', 'information_schema']) {
      expect(() => buildDirectQuery({ schemaName: s, tableName: 'users' })).toThrow(GuardError);
    }
  });
  it('refuses injection through table, column, operator, limit and offset', () => {
    expect(() => buildDirectQuery({ schemaName: 'base_x', tableName: 'a"; drop table b; --' })).toThrow(GuardError);
    expect(() => buildDirectQuery({ schemaName: 'base_x', tableName: 't', columns: ['id", (select 1) AS "x'] })).toThrow(GuardError);
    expect(() => buildDirectQuery({ schemaName: 'base_x', tableName: 't', where: [['a', '= 1 OR 1=1 --', 1]] })).toThrow(/not allowed/);
    expect(() => buildDirectQuery({ schemaName: 'base_x', tableName: 't', where: [['a', 'IS', 'x']] })).toThrow(GuardError);
    expect(() => buildDirectQuery({ schemaName: 'base_x', tableName: 't', limit: '1; drop table t' })).toThrow(GuardError);
    expect(() => buildDirectQuery({ schemaName: 'base_x', tableName: 't', offset: -5 })).toThrow(GuardError);
  });
  it('caps the page size and needs a schema and table', () => {
    expect(buildDirectQuery({ schemaName: 'base_x', tableName: 't', limit: 99999999 }).sql).toMatch(/LIMIT 10000$/);
    expect(() => buildDirectQuery({ tableName: 't' })).toThrow(/Missing/);
  });
});

describe('bulkInsert', () => {
  it('plans a quoted insert with one placeholder per value', () => {
    const plan = planBulkInsert({ schemaName: 'base_x', tableName: 'tbl_y', columns: ['a', 'b'], rows: [{ a: 1, b: 'x' }, { a: 2 }] });
    const q = buildInsertBatch(plan, plan.rows);
    expect(q.sql).toBe('INSERT INTO "base_x"."tbl_y" ("a", "b") VALUES ($1, $2), ($3, $4)');
    expect(q.params).toEqual([1, 'x', 2, null]);
  });
  it('refuses system schemas, bad names, and empty input', () => {
    expect(() => planBulkInsert({ schemaName: 'auth', tableName: 'users', columns: ['id'], rows: [{ id: 1 }] })).toThrow(GuardError);
    expect(() => planBulkInsert({ schemaName: 'base_x', tableName: 't', columns: ['a"b'], rows: [{}] })).toThrow(GuardError);
    expect(() => planBulkInsert({ schemaName: 'base_x', tableName: 't', columns: [], rows: [{}] })).toThrow(/Missing/);
    expect(() => planBulkInsert({ schemaName: 'base_x', tableName: 't', columns: ['a'], rows: ['x'] })).toThrow(GuardError);
  });
});
