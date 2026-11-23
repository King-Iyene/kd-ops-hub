import { describe, expect, it } from 'vitest';
import { V1_BASE, V1_MODULES } from '../data/v1Reference';
import { RECIPES } from '../data/recipes';
import { MODULE_GUIDES } from '../data/moduleGuides';
import { STATUS_CODES } from '../data/statusCodes';
import { looksLikeRealKey } from '../lib/snippets';

const METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];

describe('/v1 reference data', () => {
  it('has modules with unique ids and a known icon key', () => {
    const ids = V1_MODULES.map((m) => m.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of V1_MODULES) {
      expect(['shield', 'database', 'table', 'rows', 'columns', 'webhook'], m.id).toContain(m.iconKey);
      expect(m.name.trim(), m.id).not.toBe('');
      expect(m.description.trim(), m.id).not.toBe('');
    }
  });

  it('gives every endpoint a method, a path, a description and examples', () => {
    for (const m of V1_MODULES) {
      expect(m.endpoints.length, m.id).toBeGreaterThan(0);
      for (const e of m.endpoints) {
        const label = `${m.id} ${e.method} ${e.path}`;
        expect(METHODS, label).toContain(e.method);
        expect(e.path.trim(), label).not.toBe('');
        expect(e.description.trim(), label).not.toBe('');
        expect(e.exampleRequest.trim(), label).not.toBe('');
        expect(e.exampleResponse.trim(), label).not.toBe('');
      }
    }
  });

  it('keeps REST paths under /v1 and example responses that are JSON', () => {
    const rest = V1_MODULES.flatMap((m) => m.endpoints).filter((e) => e.path.startsWith('/'));
    expect(rest.length).toBeGreaterThan(5);
    for (const e of rest) {
      expect(e.path.startsWith('/v1/'), e.path).toBe(true);
      expect(() => JSON.parse(e.exampleResponse), e.path).not.toThrow();
    }
  });

  it('documents the records endpoints and uses the project base URL', () => {
    const records = V1_MODULES.find((m) => m.id === 'records');
    expect(records).toBeDefined();
    const methods = records!.endpoints.map((e) => e.method);
    for (const m of METHODS) expect(methods).toContain(m);
    expect(V1_BASE.endsWith('/functions/v1/rest-api/v1')).toBe(true);
  });

  it('never contains a real-looking API key in any example', () => {
    const all = V1_MODULES.flatMap((m) => m.endpoints.map((e) => e.exampleRequest + e.exampleResponse)).join('\n');
    expect(looksLikeRealKey(all)).toBe(false);
  });
});

describe('recipes data', () => {
  it('has unique ids and complete entries', () => {
    const ids = RECIPES.map((r) => r.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RECIPES) {
      expect(r.title.trim(), r.id).not.toBe('');
      expect(r.description.trim(), r.id).not.toBe('');
      expect(['Beginner', 'Intermediate', 'Advanced'], r.id).toContain(r.difficulty);
      expect(r.platforms.length, r.id).toBeGreaterThan(0);
      expect(r.steps.length, r.id).toBeGreaterThan(0);
      for (const c of r.code ?? []) {
        expect(c.label.trim(), r.id).not.toBe('');
        expect(c.content.trim(), r.id).not.toBe('');
      }
    }
  });

  it('does not promise a REST endpoint for module data', () => {
    const text = RECIPES.map((r) => r.steps.join(' ')).join(' ');
    expect(text).not.toMatch(/\/v1\/(employees|tasks|payroll|invoices|clients|expenses|leave)\b/);
  });
});

describe('module guides data', () => {
  it('has unique ids and complete entries', () => {
    const ids = MODULE_GUIDES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODULE_GUIDES) {
      expect(m.name.trim(), m.id).not.toBe('');
      expect(m.overview.trim(), m.id).not.toBe('');
      expect(m.iconKey, m.id).toBeTruthy();
      expect(m.fields.length, m.id).toBeGreaterThan(0);
      for (const f of m.fields) {
        expect(f.name.trim(), `${m.id} field`).not.toBe('');
        expect(f.type.trim(), `${m.id}.${f.name}`).not.toBe('');
      }
      for (const e of m.endpoints) {
        expect(METHODS, `${m.id} ${e.path}`).toContain(e.method);
        expect(e.path.trim()).not.toBe('');
        expect(e.description.trim()).not.toBe('');
      }
    }
  });

  it('only lists REST endpoints for modules marked restAvailable', () => {
    for (const m of MODULE_GUIDES) {
      if (!m.restAvailable) expect(m.endpoints, m.id).toHaveLength(0);
      else expect(m.endpoints.length, m.id).toBeGreaterThan(0);
    }
    expect(MODULE_GUIDES.filter((m) => m.restAvailable).map((m) => m.id)).toEqual(['data']);
  });

  it('keeps each webhook example as valid JSON', () => {
    for (const m of MODULE_GUIDES) {
      if (m.webhookExample) {
        expect(() => JSON.parse(m.webhookExample!.code), m.id).not.toThrow();
        expect(JSON.parse(m.webhookExample.code).event).toBe(m.webhookExample.event);
      }
    }
  });
});

describe('status codes data', () => {
  it('has unique codes with a meaning and an action', () => {
    const codes = STATUS_CODES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const s of STATUS_CODES) {
      expect(s.code).toBeGreaterThanOrEqual(200);
      expect(s.code).toBeLessThan(600);
      expect(s.meaning.trim()).not.toBe('');
      expect(s.action.trim()).not.toBe('');
      expect(['green', 'red', 'amber', 'blue']).toContain(s.color);
    }
  });

  it('does not mention module-specific scopes that do not exist', () => {
    expect(STATUS_CODES.map((s) => s.action).join(' ')).not.toMatch(/employees:(read|write)/);
  });
});
