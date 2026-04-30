import { describe, it, expect } from 'vitest';
import { renderTemplate } from './notify-templates';

describe('notify-templates', () => {
  it('payslip_ready uses the recipient first name and includes net pay', () => {
    const r = renderTemplate('payslip_ready', {
      name: 'Adebayo Williams',
      period: 'Apr 2026',
      net_ngn: 250_000,
    });
    expect(r.title).toBe('Payslip ready — Apr 2026');
    expect(r.body).toContain('Adebayo');
    expect(r.body).toContain('₦250,000');
  });

  it('payslip_ready falls back to "there" when no name is given', () => {
    const r = renderTemplate('payslip_ready', { period: 'Apr 2026', net_ngn: 100_000 });
    expect(r.body).toContain('Hi there');
  });

  it('payslip_ready includes the URL when supplied', () => {
    const r = renderTemplate('payslip_ready', {
      name: 'Ada',
      period: 'Apr 2026',
      net_ngn: 100_000,
      url: 'https://app.kdsquares.com/p/abc',
    });
    expect(r.body).toContain('https://app.kdsquares.com/p/abc');
  });

  it('ewa_approved tells the user when it will be settled', () => {
    const r = renderTemplate('ewa_approved', {
      name: 'Ada',
      amount_ngn: 50_000,
      settlement_period: 'Apr 2026',
    });
    expect(r.body).toContain('₦50,000');
    expect(r.body).toContain('Apr 2026');
    expect(r.body).toMatch(/approved/i);
  });

  it('ewa_rejected includes the reason verbatim', () => {
    const r = renderTemplate('ewa_rejected', {
      name: 'Ada',
      amount_ngn: 50_000,
      reason: 'Outstanding advance must be cleared first',
    });
    expect(r.body).toContain('Outstanding advance must be cleared first');
  });

  it('payment_received reads naturally with bank name', () => {
    const r = renderTemplate('payment_received', {
      name: 'Ada',
      amount_ngn: 25_000,
      reference: 'kdops_abc123',
      bank: 'GTBank ****5678',
    });
    expect(r.body).toContain('GTBank ****5678');
    expect(r.body).toContain('kdops_abc123');
  });

  it('clamps overly long inputs to ≤ 280 chars', () => {
    const r = renderTemplate('ewa_rejected', {
      name: 'Ada',
      amount_ngn: 10_000,
      reason: 'X'.repeat(500),
    });
    expect(r.body.length).toBeLessThanOrEqual(280);
  });

  it('compliance_due_soon includes the amount when present', () => {
    const r = renderTemplate('compliance_due_soon', {
      kind: 'paye',
      period: '2026-04',
      due_date: '2026-05-10',
      amount_ngn: 1_500_000,
    });
    expect(r.body).toContain('₦1,500,000');
    expect(r.body).toContain('PAYE');
  });
});
