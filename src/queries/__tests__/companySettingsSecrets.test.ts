import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COMPANY_SETTINGS_SECRET_COLUMNS } from '../useCompanySettings';

// company_settings secret columns (20261430000200_company_settings_secret_columns.sql): signed-in users cannot read
// them, so any `select('*')` / bare `.select()` on the table fails for them. These tests keep the front end, the
// migration and later migrations in step.

const ROOT = process.cwd();
const MIGRATION = '20261430000200_company_settings_secret_columns.sql';
const SECRET_SUFFIX = /(_enc|_private_key|_password|_secret_key|_token)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('secret column list', () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations', MIGRATION), 'utf8');

  it('is the same list as the migration', () => {
    const m = sql.match(/p_column = ANY \(ARRAY\[([\s\S]*?)\]\)/);
    expect(m).not.toBeNull();
    const inSql = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect([...COMPANY_SETTINGS_SECRET_COLUMNS].sort()).toEqual(inSql);
  });

  it('covers every secret-looking column in the generated types', () => {
    const types = readFileSync(join(ROOT, 'src/integrations/supabase/types.ts'), 'utf8');
    const start = types.indexOf('      company_settings: {');
    const row = types.slice(start, types.indexOf('Insert: {', start));
    const cols = [...row.matchAll(/^\s+(\w+)\??:/gm)].map((x) => x[1]);
    const secretLooking = cols.filter((c) => SECRET_SUFFIX.test(c));
    expect(secretLooking.length).toBeGreaterThan(0);
    for (const c of secretLooking) expect(COMPANY_SETTINGS_SECRET_COLUMNS).toContain(c);
  });
});

describe('front-end reads of company_settings', () => {
  const files = walk(join(ROOT, 'src')).filter((f) => !f.includes('/__tests__/') && !f.endsWith('integrations/supabase/types.ts'));

  it('never select("*") or bare .select() on company_settings (it fails for roles without the secret columns)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/from\(\s*['"]company_settings['"]\s*\)([\s\S]{0,400}?)(?:;|\n\s*\n)/g)) {
        if (/\.select\(\s*(['"`]\*['"`])?\s*\)/.test(m[1])) offenders.push(f.replace(ROOT + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never names a secret column in a query', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith('queries/useCompanySettings.ts')) continue;
      const src = readFileSync(f, 'utf8');
      if (!/company_settings/.test(src)) continue;
      for (const c of COMPANY_SETTINGS_SECRET_COLUMNS) if (src.includes(c)) offenders.push(`${f.replace(ROOT + '/', '')}: ${c}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('later migrations that add a company_settings column', () => {
  it('re-grant the column privileges (a new column has no grant until they do)', () => {
    const dir = join(ROOT, 'supabase/migrations');
    const later = readdirSync(dir).filter((n) => n.endsWith('.sql') && n > MIGRATION);
    const offenders: string[] = [];
    for (const n of later) {
      const sql = readFileSync(join(dir, n), 'utf8').replace(/--.*$/gm, '');
      const adds = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?company_settings\b[^;]*\bADD\s+COLUMN/i.test(sql);
      if (adds && !/company_settings_regrant_columns\s*\(/.test(sql)) offenders.push(n);
    }
    expect(offenders).toEqual([]);
  });
});
