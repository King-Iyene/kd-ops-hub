import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOM_TONES, SURFACES } from '../ambient';
import { SaveConflictError } from '../data';
import { buildHQ } from '../world/templates';

describe('the main office is only for admins to change', () => {
  const sql = readFileSync('supabase/migrations/20261397000000_office_main_space_admins_only.sql', 'utf8');
  it('the database keeps builders out of the company spaces, for the old row and the new one', () => {
    expect((sql.match(/not in \('team', 'hq'\)/g) ?? []).length).toBe(2);
    expect(sql).toContain('create policy office_spaces_update_builders');
  });
});

describe('saving at the same time as another admin', () => {
  it('says plainly what happened and what to do', () => {
    const e = new SaveConflictError();
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toMatch(/Someone else saved/);
    expect(e.message).toMatch(/Save again/);
  });
});

describe('sounds by floor and by room', () => {
  const hq = buildHQ();
  it('has a step sound for every floor the building uses', () => {
    const floors = new Set(hq.zones.map((z) => z.floor).filter(Boolean) as string[]);
    for (const f of floors) expect(SURFACES[f], f).toBeTruthy();
  });
  it('steps sound different on stone, wood and carpet (and carpet is softest)', () => {
    expect(SURFACES.stone.lp).toBeGreaterThan(SURFACES.wood.lp);
    expect(SURFACES.wood.lp).toBeGreaterThan(SURFACES.carpet.lp);
    expect(SURFACES.carpet.peak).toBeLessThan(SURFACES.wood.peak);
  });
  it('every room with its own sound is a real room in the building', () => {
    const ids = new Set(hq.zones.map((z) => z.id));
    for (const id of Object.keys(ROOM_TONES)) expect(ids.has(id), id).toBe(true);
  });
});

describe('the remodelled main building', () => {
  const hq = buildHQ();
  it('has a stage, a reception and the new rooms', () => {
    for (const id of ['stage', 'reception', 'game', 'library', 'wellness', 'workshop', 'hall']) expect(hq.zones.some((z) => z.id === id), id).toBe(true);
  });
  it('gives desks better screens and keeps item ids unique', () => {
    expect(hq.items.some((i) => i.t === 'dualmonitor')).toBe(true);
    expect(hq.items.some((i) => i.t === 'ultrawide')).toBe(true);
    expect(new Set(hq.items.map((i) => i.id)).size).toBe(hq.items.length);
  });
});
