import { describe, expect, it } from 'vitest';
import { applyDraftEdit } from '../settings/settingsDraft';

const saved = { mode: 'observe', ai_enabled: false, default_working_days: [1, 2, 3, 4, 5], model_prices: { a: { input: 1 } }, hr_contact_id: null as string | null };

describe('applyDraftEdit', () => {
  it('keeps a changed field in the draft', () => {
    expect(applyDraftEdit({}, saved, 'ai_enabled', true)).toEqual({ ai_enabled: true });
  });

  it('drops the field again when the value is put back, so nothing is sent', () => {
    const edited = applyDraftEdit({}, saved, 'ai_enabled', true);
    expect(applyDraftEdit(edited, saved, 'ai_enabled', false)).toEqual({});
  });

  it('compares arrays and objects by value, not by reference', () => {
    expect(applyDraftEdit({}, saved, 'default_working_days', [1, 2, 3, 4, 5])).toEqual({});
    expect(applyDraftEdit({}, saved, 'default_working_days', [1, 2, 3, 4])).toEqual({ default_working_days: [1, 2, 3, 4] });
    expect(applyDraftEdit({}, saved, 'model_prices', { a: { input: 1 } })).toEqual({});
    expect(applyDraftEdit({}, saved, 'model_prices', { a: { input: 2 } })).toEqual({ model_prices: { a: { input: 2 } } });
  });

  it('treats clearing a nullable field as a change only when it had a value', () => {
    expect(applyDraftEdit({}, saved, 'hr_contact_id', null)).toEqual({});
    expect(applyDraftEdit({}, { ...saved, hr_contact_id: 'p1' }, 'hr_contact_id', null)).toEqual({ hr_contact_id: null });
  });

  it('leaves other edits alone and never mutates the draft it was given', () => {
    const draft = { mode: 'remind' };
    const next = applyDraftEdit(draft, saved, 'ai_enabled', true);
    expect(next).toEqual({ mode: 'remind', ai_enabled: true });
    expect(draft).toEqual({ mode: 'remind' });
  });
});
