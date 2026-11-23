import { describe, expect, it } from 'vitest';
import {
  V0_BRANCH,
  V0_ENDPOINTS,
  V0_ERRORS,
  V0_KNOWN_DIFFERENCES,
  V0_LIST_OPTIONS,
  V0_SCOPES,
  V0_STATUS_LABELS,
} from '../data/v0Endpoints';

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

describe('v0 endpoint data', () => {
  it('gives every endpoint a method, a path and a description', () => {
    for (const e of V0_ENDPOINTS) {
      expect(METHODS, e.id).toContain(e.method);
      expect(e.path.startsWith('/v0/'), e.id).toBe(true);
      expect(e.description.trim().length, e.id).toBeGreaterThan(0);
      expect(e.name.trim().length, e.id).toBeGreaterThan(0);
      expect(Object.keys(V0_STATUS_LABELS), e.id).toContain(e.status);
    }
  });

  it('has unique ids and unique method + path + name combinations', () => {
    const ids = V0_ENDPOINTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = V0_ENDPOINTS.map((e) => `${e.method} ${e.path} ${e.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers both groups and at least the core record operations', () => {
    expect(V0_ENDPOINTS.some((e) => e.group === 'Records' && e.method === 'GET' && e.status === 'supported')).toBe(true);
    expect(V0_ENDPOINTS.some((e) => e.group === 'Meta')).toBe(true);
    expect(V0_ENDPOINTS.some((e) => e.method === 'DELETE' && e.status === 'supported')).toBe(true);
  });

  it('keeps the supporting tables well formed', () => {
    for (const o of V0_LIST_OPTIONS) {
      expect(o.name).toBeTruthy();
      expect(o.notes).toBeTruthy();
      expect(Object.keys(V0_STATUS_LABELS)).toContain(o.status);
    }
    for (const s of V0_SCOPES) {
      expect(s.airtable).toMatch(/^[a-z.]+:(read|write)$/);
      expect(s.sameAs).toMatch(/^[a-z]+:(read|write)$/);
      expect(s.allows).toBeTruthy();
    }
    for (const er of V0_ERRORS) {
      expect(er.status).toBeGreaterThanOrEqual(400);
      expect(er.type).toMatch(/^[A-Z_]+$/);
      expect(er.when).toBeTruthy();
    }
    expect(V0_KNOWN_DIFFERENCES.length).toBeGreaterThan(0);
  });

  it('names the branch it was written from', () => {
    expect(V0_BRANCH).toBe('feature/airtable-api-v0');
  });
});
