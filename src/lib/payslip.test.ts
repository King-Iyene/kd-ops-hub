import { describe, it, expect } from 'vitest';
import { renderPayslipHtml, PayslipData } from './payslip';

const BASE_DATA: PayslipData = {
  company_name: 'KD Squares',
  employee_name: 'Ada Obi',
  period: '2026-06',
  gross_ngn: 500_000,
  paye_ngn: 30_000,
  pension_ngn: 40_000,
  nhf_ngn: 12_500,
  net_ngn: 417_500,
};

describe('renderPayslipHtml', () => {
  it('returns valid HTML document with doctype', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('</html>');
  });

  it('contains employee name in greeting and meta', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('Ada');
    expect(html).toContain('Ada Obi');
  });

  it('contains company name in header', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('KD Squares');
  });

  it('renders period as month label', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('June 2026');
  });

  it('shows net pay amount', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('417,500');
  });

  it('shows gross pay amount', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('500,000');
  });

  it('shows PAYE deduction row', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('PAYE Income Tax');
    expect(html).toContain('30,000');
  });

  it('shows pension deduction row', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('Pension');
    expect(html).toContain('40,000');
  });

  it('shows NHF deduction row', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('NHF');
    expect(html).toContain('12,500');
  });

  it('omits NHIS row when nhis_ngn is 0 or undefined', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).not.toContain('NHIS (Employee)');
  });

  it('includes NHIS row when nhis_ngn > 0', () => {
    const html = renderPayslipHtml({ ...BASE_DATA, nhis_ngn: 25_000 });
    expect(html).toContain('NHIS (Employee)');
    expect(html).toContain('25,000');
  });

  it('includes AVC row when avc_ngn > 0', () => {
    const html = renderPayslipHtml({ ...BASE_DATA, avc_ngn: 10_000 });
    expect(html).toContain('AVC');
    expect(html).toContain('Voluntary Pension');
    expect(html).toContain('10,000');
  });

  it('shows unpaid leave deduction when present', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      unpaid_leave_deduction: 22_727,
      unpaid_leave_days: 1,
    });
    expect(html).toContain('Unpaid Leave');
    expect(html).toContain('1 day');
    expect(html).toContain('22,727');
  });

  it('pluralizes unpaid leave days correctly', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      unpaid_leave_deduction: 45_454,
      unpaid_leave_days: 3,
    });
    expect(html).toContain('3 days');
  });

  it('renders extra deductions', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      extra_deductions: [
        { description: 'Salary Advance Repayment', amount_ngn: 50_000 },
        { description: 'Development Levy', amount_ngn: 42 },
      ],
    });
    expect(html).toContain('Salary Advance Repayment');
    expect(html).toContain('50,000');
    expect(html).toContain('Development Levy');
  });

  it('renders salary components when provided', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      components: {
        basic_ngn: 300_000,
        housing_ngn: 100_000,
        transport_ngn: 50_000,
        other_allowances_ngn: 50_000,
      },
    });
    expect(html).toContain('Basic Salary');
    expect(html).toContain('Housing Allowance');
    expect(html).toContain('Transport Allowance');
    expect(html).toContain('Other Allowances');
  });

  it('renders itemised other allowances', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      components: {
        basic_ngn: 300_000,
        other_allowances: [
          { description: 'Meal Allowance', amount_ngn: 20_000 },
          { description: 'Internet Allowance', amount_ngn: 10_000 },
        ],
      },
    });
    expect(html).toContain('Meal Allowance');
    expect(html).toContain('Internet Allowance');
  });

  it('includes employer costs section when present', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      employer_costs: {
        pension_employer_ngn: 50_000,
        nhis_employer_ngn: 25_000,
        nsitf_ngn: 5_000,
      },
    });
    expect(html).toContain('Employer-borne contributions');
    expect(html).toContain('Pension (10% employer share)');
    expect(html).toContain('NHIS (5% employer share)');
    expect(html).toContain('NSITF ECS');
    expect(html).toContain('True cost to company');
  });

  it('omits employer costs section when no costs', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).not.toContain('Employer-borne contributions');
    expect(html).not.toContain('True cost to company');
  });

  it('includes YTD section when ytd data provided', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      ytd: {
        gross_ngn: 3_000_000,
        paye_ngn: 180_000,
        pension_ngn: 240_000,
        nhf_ngn: 75_000,
        net_ngn: 2_505_000,
      },
    });
    expect(html).toContain('Year-to-date net');
    expect(html).toContain('2,505,000');
    expect(html).toContain('YTD (NGN)');
  });

  it('includes bank details when provided', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      bank_name: 'GTBank',
      bank_account: '0123456789',
      bank_account_name: 'Ada Obi',
    });
    expect(html).toContain('GTBank');
    expect(html).toContain('0123456789');
    expect(html).toContain('Payment Method');
  });

  it('includes employee identifiers when provided', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      employee_tax_id: 'TIN-12345',
      employee_pension_pin: 'PEN-99999',
      employee_nhf_number: 'NHF-11111',
    });
    expect(html).toContain('TIN TIN-12345');
    expect(html).toContain('PenCom PIN PEN-99999');
    expect(html).toContain('NHF No. NHF-11111');
  });

  it('escapes HTML in employee names', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      employee_name: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in company name', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      company_name: 'A & B "Corp"',
    });
    expect(html).toContain('A &amp; B &quot;Corp&quot;');
  });

  it('includes confidential marker', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('Confidential');
  });

  it('includes payslip ref', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      payslip_ref: 'KDS-ABC123',
    });
    expect(html).toContain('KDS-ABC123');
  });

  it('generates fallback ref when payslip_ref missing', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toMatch(/KDS-[A-Z0-9]+/);
  });

  it('includes print script when autoPrint is true (default)', () => {
    const html = renderPayslipHtml(BASE_DATA);
    expect(html).toContain('window.print()');
  });

  it('omits print script when autoPrint is false', () => {
    const html = renderPayslipHtml(BASE_DATA, { autoPrint: false });
    expect(html).not.toContain('window.print()');
  });

  it('handles zero gross gracefully', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      gross_ngn: 0,
      paye_ngn: 0,
      pension_ngn: 0,
      nhf_ngn: 0,
      net_ngn: 0,
    });
    expect(html).toContain('No deductions applied');
  });

  it('handles missing optional fields without errors', () => {
    const minimal: PayslipData = {
      company_name: 'Test Co',
      employee_name: 'John',
      period: '2026-01',
      gross_ngn: 100_000,
      paye_ngn: 0,
      pension_ngn: 0,
      nhf_ngn: 0,
      net_ngn: 100_000,
    };
    expect(() => renderPayslipHtml(minimal)).not.toThrow();
    const html = renderPayslipHtml(minimal);
    expect(html).toContain('Test Co');
    expect(html).toContain('John');
  });

  it('handles non-standard period format gracefully', () => {
    const html = renderPayslipHtml({
      ...BASE_DATA,
      period: 'Q1 2026',
    });
    expect(html).toContain('Q1 2026');
  });
});
