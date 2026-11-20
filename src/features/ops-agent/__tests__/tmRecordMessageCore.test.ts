import { describe, expect, it } from 'vitest';
import { buildEntryText, findPersonId, formatEntry, renderEntryTemplate, valueText } from '../../../../supabase/functions/_shared/tm-record-message-core';
import { effectiveConfig } from '../../../../supabase/functions/_shared/tm-record-message';
import { buildRequest } from '../../../../supabase/functions/_shared/agent-deliver-core';

const P1 = '11111111-1111-1111-1111-111111111111';
const T1 = '22222222-2222-2222-2222-222222222222';
const fields = [
  { id: 'f-name', name: 'Name', type: 'person' },
  { id: 'f-date', name: 'Report Date', type: 'date' },
  { id: 'f-tasks', name: 'Tasks Worked on Today', type: 'task' },
  { id: 'f-report', name: 'Report', type: 'long_text' },
  { id: 'f-more', name: 'Additional Content', type: 'long_text' },
  { id: 'f-done', name: 'Done', type: 'checkbox' },
  { id: 'f-by', name: 'Created by', type: 'created_by' },
];
const names = { people: { [P1]: 'Cara Obi' }, tasks: { [T1]: 'Prepare payroll' } };
const data = { 'f-name': [P1], 'f-date': '2026-11-20', 'f-tasks': [T1], 'f-report': 'Closed the books.\nStarted payroll.', 'f-more': '', 'f-done': true, 'f-by': P1 };

describe('an entry as text', () => {
  it('turns people, tasks and checkboxes into words', () => {
    expect(valueText(fields[0], data['f-name'], names)).toBe('Cara Obi');
    expect(valueText(fields[2], data['f-tasks'], names)).toBe('Prepare payroll');
    expect(valueText(fields[5], true, names)).toBe('Yes');
    expect(valueText(fields[5], false, names)).toBe('No');
    expect(valueText(fields[3], null, names)).toBe('');
  });
  it('lists every answer when there is no template, leaving out empty and system fields', () => {
    const t = formatEntry(fields, data, names);
    expect(t).toContain('Name: Cara Obi');
    expect(t).toContain('Tasks Worked on Today: Prepare payroll');
    expect(t).toContain('Report:\nClosed the books.\nStarted payroll.');
    expect(t).not.toContain('Additional Content');
    expect(t).not.toContain('Created by');
  });
  it('finds the person the entry is about', () => {
    expect(findPersonId(fields, data)).toBe(P1);
    expect(findPersonId(fields, { 'f-name': [] })).toBeNull();
    expect(findPersonId(fields, { 'f-name': ['not-an-id'] })).toBeNull();
  });
  it('fills a template by field name, in any letter case, and blanks what it does not know', () => {
    const out = renderEntryTemplate('Report from {{ name }} for {{Report Date}}: {{report}} {{nothing}} ({{table}}) {{link}} {{submitted_at}}', fields, data, names, { table: 'Reports', link: 'https://x.co/t', submittedAt: 'Nov 20, 2026, 4:00 PM ET' });
    expect(out).toBe('Report from Cara Obi for 2026-11-20: Closed the books.\nStarted payroll.  (Reports) https://x.co/t Nov 20, 2026, 4:00 PM ET');
  });
  it('builds a title and text, with a test marker, and never an empty message', () => {
    const a = buildEntryText({ table: 'Reports', template: '', fields, data, names, link: 'l', submittedAt: 't' });
    expect(a.title).toBe('New entry in Reports');
    expect(a.text).toContain('Name: Cara Obi');
    expect(buildEntryText({ table: 'Reports', template: null, fields, data, names, link: 'l', submittedAt: 't', test: true }).title).toBe('Test: New entry in Reports');
    expect(buildEntryText({ table: 'Reports', template: '{{nothing}}', fields, data, names, link: 'l', submittedAt: 't' }).text).toBe('A new entry was added.');
  });
  it('keeps a very long answer and message within limits', () => {
    const long = 'x'.repeat(5000);
    expect(valueText(fields[3], long, names).length).toBeLessThanOrEqual(700);
    expect(buildEntryText({ table: 'R', template: '{{a}}'.repeat(1) + 'y'.repeat(4000), fields, data, names, link: 'l', submittedAt: 't' }).text.length).toBeLessThanOrEqual(3000);
  });
});

describe('sending an entry to Cliq', () => {
  it('uses the rule channel for a Cliq API connection only', () => {
    expect(effectiveConfig({ mode: 'api', channel: 'ops' }, 'cliq', { channel: 'reports' }).channel).toBe('reports');
    expect(effectiveConfig({ mode: 'api', channel: 'ops' }, 'cliq', { channel: null }).channel).toBe('ops');
    expect(effectiveConfig({ mode: 'webhook' }, 'cliq', { channel: 'reports' }).channel).toBeUndefined();
    expect(effectiveConfig({ channel: 'ops' }, 'slack', { channel: 'reports' }).channel).toBe('ops');
  });
  it('tags the person and CCs their manager in the channel message', async () => {
    const b = await buildRequest({ kind: 'cliq', name: 'c', config: { mode: 'api', dc: 'com', channel: 'reports' } }, { access: '1000.accesstoken123' }, {
      title: 'New entry in Reports', text: 'Name: Cara Obi', mention: { name: 'Cara Obi', id: '111', cc: { name: 'Dan', id: '222' } }, link: { url: 'https://ops.kdsquares.com/task/table/x', label: 'Open the table' },
    });
    if (b.type !== 'http') throw new Error('expected http');
    const text = JSON.parse(b.init.body!).text as string;
    expect(b.url).toBe('https://cliq.zoho.com/api/v3/channelsbyname/reports/messages');
    expect(text).toContain('For Cara Obi: {@111}');
    expect(text).toContain('CC Dan (manager): {@222}');
    expect(text).toContain('Open the table: https://ops.kdsquares.com/task/table/x');
  });
});
