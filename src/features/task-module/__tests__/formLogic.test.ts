import { describe, expect, it } from 'vitest';
import type { FormLogic, FormRule, TableField, TableFieldType } from '@/queries/useTaskModule';
import {
  cleanLogic, computeVisible, condMet, conditionComplete, conditionWith, defaultCondition, firstIncomplete,
  invalidConditions, opLabel, opsForField, ruleVisible, valueKind,
} from '../table/formLogic';
import { customRule, presetOf, recurrenceLabel, ruleFor, withUntil } from '../recurrence';

// These are the same cases the database tests run against tm_form_cond_met /
// tm_form_rule_visible: the page and the server must always agree.
describe('conditions (same truth table as the database)', () => {
  it('is / is not / empty / checked', () => {
    expect(condMet('Blocked', 'is', 'Blocked')).toBe(true);
    expect(condMet('On track', 'is', 'Blocked')).toBe(false);
    expect(condMet('On track', 'is_not', 'Blocked')).toBe(true);
    expect(condMet(null, 'is_not', 'Blocked')).toBe(true);
    for (const empty of [undefined, null, '', [], false]) expect(condMet(empty, 'is_empty', undefined)).toBe(true);
    expect(condMet('x', 'not_empty', undefined)).toBe(true);
    expect(condMet(0, 'is_empty', undefined)).toBe(false); // zero is an answer
    expect(condMet(true, 'checked', undefined)).toBe(true);
    expect(condMet(false, 'checked', undefined)).toBe(false);
    expect(condMet(undefined, 'checked', undefined)).toBe(false);
    expect(condMet(undefined, 'unchecked', undefined)).toBe(true);
    expect(condMet(true, 'unchecked', undefined)).toBe(false);
  });
  it('any of / none of / multi-select answers', () => {
    expect(condMet('b', 'is_any_of', ['a', 'b'])).toBe(true);
    expect(condMet('c', 'is_any_of', ['a', 'b'])).toBe(false);
    expect(condMet('c', 'is_none_of', ['a', 'b'])).toBe(true);
    expect(condMet('a', 'is_none_of', ['a', 'b'])).toBe(false);
    expect(condMet(['x', 'b'], 'is_any_of', ['a', 'b'])).toBe(true);
    expect(condMet(['x', 'b'], 'is', 'b')).toBe(true);
    expect(condMet(null, 'is_any_of', null)).toBe(false);
  });
  it('contains ignores case; an empty needle never matches', () => {
    expect(condMet('Server is Down', 'contains', 'down')).toBe(true);
    expect(condMet('ok', 'contains', 'down')).toBe(false);
    expect(condMet('ok', 'not_contains', 'down')).toBe(true);
    expect(condMet('anything', 'contains', '')).toBe(false);
  });
  it('numbers', () => {
    expect(condMet(9, 'gt', 8)).toBe(true);
    expect(condMet(8, 'gt', 8)).toBe(false);
    expect(condMet(8, 'gte', 8)).toBe(true);
    expect(condMet(2.5, 'lt', 3)).toBe(true);
    expect(condMet(3, 'lte', 3)).toBe(true);
    expect(condMet('abc', 'lt', 3)).toBe(false);
    expect(condMet('10', 'gt', 5)).toBe(true); // a number typed into the page is still text there
    expect(condMet(5.0, 'is', 5)).toBe(true);
    expect(condMet(5, 'is', '5')).toBe(true);
    expect(condMet(5, 'bogus' as never, 5)).toBe(false);
  });
});

describe('rules', () => {
  const a = { s: 'Blocked', n: 10 };
  const rule = (r: Partial<FormRule>): FormRule => ({ mode: 'show', match: 'all', conditions: [], ...r });
  it('no rule / no conditions = shown', () => {
    expect(ruleVisible(undefined, a)).toBe(true);
    expect(ruleVisible(rule({ mode: 'hide' }), a)).toBe(true);
  });
  it('show, hide, all, any', () => {
    const blocked = { field: 's', op: 'is' as const, value: 'Blocked' };
    const big = { field: 'n', op: 'gt' as const, value: 5 };
    expect(ruleVisible(rule({ conditions: [blocked] }), a)).toBe(true);
    expect(ruleVisible(rule({ conditions: [blocked] }), { s: 'On track' })).toBe(false);
    expect(ruleVisible(rule({ mode: 'hide', conditions: [blocked] }), a)).toBe(false);
    expect(ruleVisible(rule({ mode: 'hide', conditions: [blocked] }), { s: 'On track' })).toBe(true);
    expect(ruleVisible(rule({ conditions: [blocked, big] }), a)).toBe(true);
    expect(ruleVisible(rule({ conditions: [blocked, big] }), { s: 'Blocked', n: 1 })).toBe(false);
    const any = rule({ match: 'any', conditions: [blocked, { field: 'n', op: 'gt', value: 50 }] });
    expect(ruleVisible(any, { s: 'Blocked', n: 1 })).toBe(true);
    expect(ruleVisible(any, { s: 'x', n: 99 })).toBe(true);
    expect(ruleVisible(any, { s: 'x', n: 1 })).toBe(false);
    expect(ruleVisible(rule({ conditions: [{ field: 'missing', op: 'not_empty' }] }), a)).toBe(false);
  });
  it('is evaluated top to bottom; hidden answers are dropped and dependants stay hidden', () => {
    const logic: FormLogic = {
      blocker: rule({ conditions: [{ field: 'status', op: 'is', value: 'Blocked' }] }),
      help: rule({ conditions: [{ field: 'blocker', op: 'not_empty' }] }),
    };
    const ids = ['status', 'blocker', 'help'];
    const onTrack = computeVisible(ids, logic, { status: 'On track', blocker: 'sneaky', help: 'p1' });
    expect([...onTrack.shown]).toEqual(['status']);
    expect(onTrack.effective).toEqual({ status: 'On track' });
    const blocked = computeVisible(ids, logic, { status: 'Blocked', blocker: 'VPN down' });
    expect([...blocked.shown]).toEqual(['status', 'blocker', 'help']);
    const blockedNoText = computeVisible(ids, logic, { status: 'Blocked' });
    expect([...blockedNoText.shown]).toEqual(['status', 'blocker']);
  });
});

describe('what the builder allows', () => {
  const f = (id: string, type: TableFieldType, config: TableField['config'] = {}): TableField => ({ id, table_id: 't', name: id, type, config, position: 0, created_at: '' });
  const fields = [f('status', 'single_select', { options: ['a', 'b'] }), f('hours', 'number'), f('who', 'person'), f('files', 'attachment'), f('notes', 'long_text')];
  const byId = new Map(fields.map((x) => [x.id, x]));
  it('operators and value boxes by field type', () => {
    expect(opsForField('checkbox')).toEqual(['checked', 'unchecked']);
    expect(opsForField('attachment')).toEqual([]);
    expect(valueKind('single_select', 'is')).toBe('option');
    expect(valueKind('single_select', 'is_any_of')).toBe('options');
    expect(valueKind('number', 'gt')).toBe('number');
    expect(valueKind('person', 'is_any_of')).toBe('people');
    expect(valueKind('text', 'is_empty')).toBe('none');
    expect(opLabel('is', 'multi_select')).toBe('includes');
    expect(opLabel('is', 'single_select')).toBe('is');
  });
  it('a condition needs its value before it can be saved', () => {
    expect(conditionComplete({ field: 'status', op: 'is' }, 'single_select')).toBe(false);
    expect(conditionComplete({ field: 'status', op: 'is', value: 'a' }, 'single_select')).toBe(true);
    expect(conditionComplete({ field: 'hours', op: 'gt', value: 'abc' }, 'number')).toBe(false);
    expect(conditionComplete({ field: 'hours', op: 'gt', value: 8 }, 'number')).toBe(true);
    expect(conditionComplete({ field: 'who', op: 'is_any_of', value: [] }, 'person')).toBe(false);
    expect(conditionComplete({ field: 'notes', op: 'is_empty' }, 'long_text')).toBe(true);
  });
  it('changing the operator keeps the value only when it still fits', () => {
    const c = { field: 'status', op: 'is' as const, value: 'a' };
    expect(conditionWith(c, { op: 'is_not' }, byId.get('status')!).value).toBe('a');
    expect(conditionWith(c, { op: 'is_any_of' }, byId.get('status')!).value).toEqual([]);
    expect(conditionWith(c, { op: 'is_empty' }, byId.get('status')!)).toEqual({ field: 'status', op: 'is_empty' });
    expect(defaultCondition(byId.get('hours')!)).toEqual({ field: 'hours', op: 'is' });
  });
  it('conditions may only look at questions above, that rules can use', () => {
    const ids = ['status', 'hours', 'notes', 'files'];
    const rule: FormRule = { mode: 'show', match: 'all', conditions: [
      { field: 'status', op: 'is', value: 'a' },     // above: ok
      { field: 'files', op: 'not_empty' },           // below
      { field: 'ghost', op: 'not_empty' },           // not on the form
      { field: 'hours', op: 'contains', value: '1' }, // operator not valid for a number
    ] };
    expect(invalidConditions(rule, 'notes', ids, byId).map((c) => c.field)).toEqual(['files', 'ghost', 'hours']);
    const logic: FormLogic = { notes: rule, hours: { mode: 'hide', match: 'any', conditions: [{ field: 'status', op: 'is', value: 'a' }] }, status: { mode: 'show', match: 'all', conditions: [{ field: 'hours', op: 'not_empty' }] } };
    const cleaned = cleanLogic(logic, ids, byId);
    expect(Object.keys(cleaned).sort()).toEqual(['hours', 'notes']); // status looked below itself: dropped entirely
    expect(cleaned.notes.conditions).toHaveLength(1);
    expect(firstIncomplete({ notes: { mode: 'show', match: 'all', conditions: [{ field: 'status', op: 'is' }] } }, ids, byId)).toBe('notes');
    expect(firstIncomplete(cleaned, ids, byId)).toBe(null);
  });
});

describe('repeat rules', () => {
  it('presets and labels', () => {
    expect(presetOf(null)).toBe('none');
    expect(presetOf({ unit: 'day', every: 1 })).toBe('daily');
    expect(presetOf({ unit: 'week', every: 1 })).toBe('weekly');
    expect(presetOf({ unit: 'month', every: 1 })).toBe('monthly');
    expect(presetOf({ unit: 'week', every: 2 })).toBe('custom');
    expect(recurrenceLabel(null)).toBe('Does not repeat');
    expect(recurrenceLabel(ruleFor('daily'))).toBe('Daily');
    expect(recurrenceLabel({ unit: 'week', every: 2 })).toBe('Every 2 weeks');
    expect(recurrenceLabel({ unit: 'month', every: 3, until: '2027-06-30' }, (d) => `on ${d}`)).toBe('Every 3 months until on 2027-06-30');
  });
  it('custom rules are checked', () => {
    expect(customRule('day', 10, null)).toEqual({ unit: 'day', every: 10 });
    expect(customRule('week', 2, '2027-01-01')).toEqual({ unit: 'week', every: 2, until: '2027-01-01' });
    expect(customRule('day', 0, null)).toBeNull();
    expect(customRule('day', 1.5, null)).toBeNull();
    expect(customRule('day', 366, null)).toBeNull();
  });
  it('the end date follows a change of rule', () => {
    expect(withUntil({ unit: 'week', every: 1, until: '2027-01-01' }, null)).toEqual({ unit: 'week', every: 1 });
    expect(withUntil(ruleFor('monthly'), '2027-05-05')).toEqual({ unit: 'month', every: 1, until: '2027-05-05' });
  });
});
