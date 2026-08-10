/**
 * P9 Annual Tax Deduction Card (Nigeria Form H1).
 *
 * Generates a per-employee annual P9 card from 12 months of payslip data.
 * Each employee gets one row per month showing gross, allowances, pension,
 * chargeable income, and PAYE deducted. A totals row at the bottom sums
 * the year.
 *
 * Used for:
 *   - Year-end employee tax certificates
 *   - Annual PAYE returns to the relevant tax authority (LIRS/FIRS)
 *   - Employee records (they submit P9 to claim relief or file personal returns)
 */

import { supabase } from '@/lib/supabase';
import { toCsv } from '@/lib/csv';

export interface P9CardRow {
  month: string;
  gross_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  nhis_ngn: number;
  total_relief_ngn: number;
  chargeable_ngn: number;
  paye_ngn: number;
  cumulative_paye_ngn: number;
}

export interface P9Card {
  employee_id: string;
  employee_name: string;
  tin: string | null;
  staff_number: string | null;
  year: number;
  rows: P9CardRow[];
  annual_gross_ngn: number;
  annual_paye_ngn: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const round = (n: number | null | undefined): number => Math.round(Number(n || 0));

export async function generateP9Cards(year: number): Promise<P9Card[]> {
  const startPeriod = `${year}-01`;
  const endPeriod = `${year}-12`;

  const { data: payslips, error } = await supabase
    .from('payslips')
    .select('employee_id, period, gross_ngn, paye_ngn, pension_ngn, nhf_ngn, net_ngn, profiles:employee_id(full_name, staff_number, tin)')
    .gte('period', startPeriod)
    .lte('period', endPeriod)
    .order('period');

  if (error || !payslips?.length) return [];

  const byEmployee = new Map<string, { name: string; tin: string | null; staffNo: string | null; slips: any[] }>();

  for (const p of payslips as any[]) {
    const existing = byEmployee.get(p.employee_id);
    if (existing) {
      existing.slips.push(p);
    } else {
      byEmployee.set(p.employee_id, {
        name: p.profiles?.full_name || p.employee_id,
        tin: p.profiles?.tin || null,
        staffNo: p.profiles?.staff_number || null,
        slips: [p],
      });
    }
  }

  const cards: P9Card[] = [];

  for (const [empId, info] of byEmployee) {
    const rows: P9CardRow[] = [];
    let cumulativePaye = 0;

    for (let m = 0; m < 12; m++) {
      const period = `${year}-${String(m + 1).padStart(2, '0')}`;
      const slip = info.slips.find((s: any) => s.period === period);

      const gross = round(slip?.gross_ngn);
      const pension = round(slip?.pension_ngn);
      const nhf = round(slip?.nhf_ngn);
      const nhis = 0;
      const totalRelief = pension + nhf + nhis;
      const chargeable = Math.max(0, gross - totalRelief);
      const paye = round(slip?.paye_ngn);
      cumulativePaye += paye;

      rows.push({
        month: MONTHS[m],
        gross_ngn: gross,
        pension_ngn: pension,
        nhf_ngn: nhf,
        nhis_ngn: nhis,
        total_relief_ngn: totalRelief,
        chargeable_ngn: chargeable,
        paye_ngn: paye,
        cumulative_paye_ngn: cumulativePaye,
      });
    }

    cards.push({
      employee_id: empId,
      employee_name: info.name,
      tin: info.tin,
      staff_number: info.staffNo,
      year,
      rows,
      annual_gross_ngn: rows.reduce((s, r) => s + r.gross_ngn, 0),
      annual_paye_ngn: rows.reduce((s, r) => s + r.paye_ngn, 0),
    });
  }

  return cards.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

export function p9CardsToCsv(cards: P9Card[]): string {
  const header = [
    'Employee Name',
    'Staff Number',
    'TIN',
    'Month',
    'Gross (₦)',
    'Pension (₦)',
    'NHF (₦)',
    'NHIS (₦)',
    'Total Relief (₦)',
    'Chargeable Income (₦)',
    'PAYE (₦)',
    'Cumulative PAYE (₦)',
  ];

  const rows: string[][] = [];
  for (const card of cards) {
    for (const r of card.rows) {
      rows.push([
        card.employee_name,
        card.staff_number || '',
        card.tin || '',
        r.month,
        String(r.gross_ngn),
        String(r.pension_ngn),
        String(r.nhf_ngn),
        String(r.nhis_ngn),
        String(r.total_relief_ngn),
        String(r.chargeable_ngn),
        String(r.paye_ngn),
        String(r.cumulative_paye_ngn),
      ]);
    }
    rows.push([
      card.employee_name + ' — ANNUAL TOTAL',
      card.staff_number || '',
      card.tin || '',
      'TOTAL',
      String(card.annual_gross_ngn),
      String(card.rows.reduce((s, r) => s + r.pension_ngn, 0)),
      String(card.rows.reduce((s, r) => s + r.nhf_ngn, 0)),
      String(card.rows.reduce((s, r) => s + r.nhis_ngn, 0)),
      String(card.rows.reduce((s, r) => s + r.total_relief_ngn, 0)),
      String(card.rows.reduce((s, r) => s + r.chargeable_ngn, 0)),
      String(card.annual_paye_ngn),
      String(card.annual_paye_ngn),
    ]);
  }

  return toCsv(header, rows);
}
