import { describe, expect, it } from 'vitest';
import { isHeld, type VehicleRow } from '../useVehicles';

const row = (over: Partial<VehicleRow>): VehicleRow => ({ space_id: 's', item_id: 'bike1', x: 3, y: 4, dir: 0, holder_id: null, lease_expires_at: null, version: 0, ...over });

describe('a vehicle is held only while the rider keeps hold', () => {
  const now = Date.parse('2026-01-01T10:00:00Z');
  it('is free when nobody holds it', () => {
    expect(isHeld(row({}), now)).toBe(false);
  });
  it('is held while the lease is running', () => {
    expect(isHeld(row({ holder_id: 'u1', lease_expires_at: '2026-01-01T10:00:20Z' }), now)).toBe(true);
  });
  it('is free again once the rider vanishes and the lease runs out', () => {
    expect(isHeld(row({ holder_id: 'u1', lease_expires_at: '2026-01-01T09:59:50Z' }), now)).toBe(false);
  });
});
