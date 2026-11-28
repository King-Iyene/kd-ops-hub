import { describe, expect, it } from 'vitest';
import type { CrewAgent } from '../crewDb';
import { approveLabel, buildOrgTree, describeAction, riskOrder } from '../orgChart';
import { hash, speakable, voiceFor } from '../voice';

const agent = (id: string, name: string, department: string, reports_to: string | null = null): CrewAgent => ({
  id, slug: id, name, title: name, role: 'x', department, company: 'All', reports_to, status: 'idle', activity: '', last_seen_at: null, color: '#000', active: true,
});

describe('org chart', () => {
  it('builds the reporting tree: CFO over heads, VP Finance over the finance staff', () => {
    const list = [
      agent('ctrl', 'Chinedu', 'Finance', 'fd'), agent('fd', 'Adaeze', 'Finance', 'dep'), agent('dep', 'Tobi', 'Executive'),
      agent('eng', 'Kunle', 'Engineering', 'dep'), agent('trs', 'Halima', 'Finance', 'fd'),
    ];
    const tree = buildOrgTree(list);
    expect(tree.map((n) => n.agent.id)).toEqual(['dep']);
    expect(tree[0].reports.map((n) => n.agent.id)).toEqual(['eng', 'fd']); // Engineering before Finance, by department
    const fd = tree[0].reports.find((n) => n.agent.id === 'fd')!;
    expect(fd.reports.map((n) => n.agent.id)).toEqual(['ctrl', 'trs']); // same department: by name
  });

  it('shows someone whose manager is missing as a top-level person instead of hiding them', () => {
    const tree = buildOrgTree([agent('a', 'A', 'X', 'ghost'), agent('b', 'B', 'X')]);
    expect(tree.map((n) => n.agent.id).sort()).toEqual(['a', 'b']);
  });

  it('never hangs on a reporting loop and never drops anybody', () => {
    const tree = buildOrgTree([agent('a', 'A', 'X', 'b'), agent('b', 'B', 'X', 'a'), agent('c', 'C', 'X', 'c')]);
    const ids: string[] = [];
    const walk = (ns: typeof tree) => ns.forEach((n) => { ids.push(n.agent.id); walk(n.reports); });
    walk(tree);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('labels and orders things for a decision', () => {
    expect([riskOrder('low'), riskOrder('high'), riskOrder('medium')].sort()).toEqual([0, 1, 2]);
    expect(riskOrder('high')).toBeLessThan(riskOrder('low'));
    expect(approveLabel('record.create')).toBe('Approve and apply');
    expect(approveLabel('external.vercel')).toBe('Approve (go ahead)');
    expect(approveLabel('advice.strategy')).toBe('Accept');
    expect(describeAction('draft.filing')).toBe('Draft a tax filing');
    expect(describeAction('record.soft_delete')).toBe('Move a record to the trash');
    expect(describeAction('advice.market_sizing')).toBe('Advice: market sizing');
  });
});

describe('free voice', () => {
  it('gives every agent a stable voice and different agents different ones', () => {
    expect(voiceFor('cfo')).toEqual(voiceFor('cfo'));
    const v = voiceFor('vp_finance');
    expect(v.pitch).toBeGreaterThanOrEqual(0.8);
    expect(v.pitch).toBeLessThanOrEqual(1.5);
    expect(v.rate).toBeGreaterThanOrEqual(0.95);
    expect(v.rate).toBeLessThanOrEqual(1.15);
    expect(hash('a')).not.toBe(hash('b'));
    const set = new Set(['cfo', 'controller', 'treasury', 'payroll', 'revenue', 'fpa', 'ops_head', 'product_head', 'marketing_head', 'engineering_head', 'ndi_head'].map((s) => `${voiceFor(s).pitch.toFixed(2)}/${voiceFor(s).rate.toFixed(2)}`));
    expect(set.size).toBeGreaterThan(5);
  });

  it('cleans text so it is pleasant to hear', () => {
    expect(speakable('**Cash** is short: see https://example.com/x?y=1 and `code`')).toBe('Cash is short: see a link and code');
    expect(speakable('Record 3f2504e0-4f89-41d3-9a0c-0305e82c3301 is a duplicate')).toBe('Record an id is a duplicate');
    expect(speakable('```sql\nselect 1\n```')).toBe('code omitted.');
    expect(speakable('x'.repeat(2000)).length).toBe(900);
  });
});
