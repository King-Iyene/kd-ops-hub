import { describe, it, expect } from 'vitest';
import { viewConfigFromMeta } from '../hooks/useViews';
import type { ViewMeta } from '../types';

const base = {
  id: 'v1',
  table_id: 't1',
  name: 'A view',
  slug: null,
  type: 'grid',
  filters: [],
  sorts: [],
  groups: [],
  field_order: [],
  field_visibility: {},
  field_widths: { f1: 240 },
  is_default: true,
  is_locked: false,
  position: 0,
  form_config: {},
  created_at: '',
  updated_at: '',
} as unknown as ViewMeta;

describe('viewConfigFromMeta: the look saved with a view', () => {
  it('carries the row height and the row color rules', () => {
    const rules = [{ id: 'r1' }] as unknown as ViewMeta['row_color_rules'];
    const cfg = viewConfigFromMeta({ ...base, row_height: 'short', row_color_rules: rules });
    expect(cfg.rowHeight).toBe('short');
    expect(cfg.rowColorRules).toBe(rules);
    expect(cfg.fieldWidths).toEqual({ f1: 240 });
  });

  it('copes with a view saved before these existed', () => {
    const cfg = viewConfigFromMeta({ ...base, row_height: undefined, row_color_rules: undefined } as unknown as ViewMeta);
    expect(cfg.rowHeight).toBeNull();
    expect(cfg.rowColorRules).toEqual([]);
  });
});
