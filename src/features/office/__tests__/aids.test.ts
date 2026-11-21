import { describe, expect, it } from 'vitest';
import { AIDS, COSTUMES } from '../world/avatarParts';
import { COSTUME_KINDS } from '../world/avatarCostumes';
import { AID_SPEED } from '../world/avatarAids';
import { cleanAvatar, defaultAvatar } from '../world/render';

describe('the wolf and the mobility aids', () => {
  it('the wolf is a costume and every costume has a drawing', () => {
    expect(COSTUMES).toContain('Wolf');
    expect(COSTUMES.length).toBe(COSTUME_KINDS.length);
    expect(COSTUME_KINDS[COSTUMES.indexOf('Wolf')]).toBe('wolf');
  });
  it('a stick, crutches and a wheelchair can be chosen, saved and loaded; anything else becomes none', () => {
    expect(AIDS.length).toBe(4);
    for (let i = 0; i < AIDS.length; i++) expect(cleanAvatar({ ...defaultAvatar('x'), aid: i }, 'x').aid).toBe(i);
    expect(cleanAvatar({ ...defaultAvatar('x'), aid: 9 }, 'x').aid).toBe(0);
    expect(cleanAvatar({ ...defaultAvatar('x') }, 'x').aid).toBe(0); // an avatar saved before there were aids
  });
  it('crutches and a wheelchair slow you down a little, and nothing makes you faster', () => {
    expect(AID_SPEED[0]).toBe(1);
    for (const k of AID_SPEED) expect(k).toBeLessThanOrEqual(1);
    expect(AID_SPEED[2]).toBeLessThan(AID_SPEED[1]);
    expect(AID_SPEED.length).toBe(AIDS.length);
  });
});
