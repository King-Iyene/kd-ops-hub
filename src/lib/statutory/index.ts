/**
 * Statutory export foundation — Nigerian filing packs from an approved
 * payroll run.
 *
 * Each exporter (LIRS, FIRS, PenCom PSSP, NHF, NSITF, ITF) is a pure
 * function that takes a `StatutoryRunData` snapshot and produces a
 * downloadable CSV. The snapshot is loaded once via `loadStatutoryRunData()`
 * and reused so all exporters see the same numbers.
 *
 * Zero dependencies on the payments module. Read-only against
 * payroll_runs, payroll_run_items, profiles, employee_benefits and
 * company_settings.
 */

import { supabase } from '@/lib/supabase';
import {
  PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_RATE,
  NHIS_EMPLOYEE_RATE,
  NSITF_RATE,
  RENT_RELIEF_RATE,
  RENT_RELIEF_CAP_ANNUAL,
} from '@/lib/tax';

export interface StatutoryLineItem {
  employee_id: string;
  employee_name: string;
  first_name: string | null;
  last_name: string | null;
  staff_number: string | null;
  email: string | null;
  tin: string | null;
  nin: string | null;
  nhf_number: string | null;
  nhis_number: string | null;
  rsa_pin: string | null;
  pfa_name: string | null;
  pfa_code: string | null;
  state_of_residence: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  gross_monthly_ngn: number;
  paye_monthly_ngn: number;
  pension_employee_monthly_ngn: number;
  pension_employer_monthly_ngn: number;
  nhf_monthly_ngn: number;
  nhis_monthly_ngn: number;
  avc_monthly_ngn: number;
  rent_relief_monthly_ngn: number;
  life_assurance_monthly_ngn: number;
  net_monthly_ngn: number;
}

export interface EmployerHeader {
  company_name: string;
  employer_tin: string | null;
  employer_rc_number: string | null;
  state_of_business: string | null;
  pencom_employer_code: string | null;
  nhf_employer_code: string | null;
  nsitf_employer_code: string | null;
  itf_employer_code: string | null;
  company_address: string | null;
}

export interface StatutoryRunData {
  period: string;
  payroll_run_id: string;
  employer: EmployerHeader;
  items: StatutoryLineItem[];
  totals: {
    gross_monthly_ngn: number;
    paye_monthly_ngn: number;
    pension_employee_monthly_ngn: number;
    pension_employer_monthly_ngn: number;
    nhf_monthly_ngn: number;
    nhis_monthly_ngn: number;
    net_monthly_ngn: number;
    nsitf_monthly_ngn: number;
    headcount: number;
  };
}

export interface StatutoryExportFile {
  filename: string;
  csv: string;
  /** Human-readable summary shown in the download toast. */
  summary: string;
  /** Filing kind this exporter covers (used to link back to compliance_filings). */
  kind: 'paye_lirs' | 'paye_firs' | 'pension_pssp' | 'nhf' | 'nsitf' | 'itf';
}

const round = (n: number | null | undefined): number => Math.round(Number(n || 0));

/**
 * Load a full statutory snapshot for a payroll period.
 *
 * Reads:
 *   - payroll_runs by period ('YYYY-MM')
 *   - payroll_run_items joined with profiles + active pension_pfa benefit
 *   - company_settings for the employer header
 *
 * Returns null if the payroll run doesn't exist. Throws only on hard DB errors.
 */
export async function loadStatutoryRunData(
  period: string,
): Promise<StatutoryRunData | null> {
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('id, period, status')
    .eq('period', period)
    .maybeSingle();
  if (runErr) throw new Error(runErr.message);
  if (!run) return null;

  const { data: rawItems, error: itemsErr } = await supabase
    .from('payroll_run_items')
    .select('id, employee_id, employee_name, gross_ngn, paye_ngn, pension_ngn, nhf_ngn, nhis_ngn, avc_ngn, net_ngn')
    .eq('payroll_run_id', run.id);
  if (itemsErr) throw new Error(itemsErr.message);
  const items = (rawItems ?? []) as any[];

  const employeeIds = items
    .map((i: any) => i.employee_id)
    .filter((x: string | null): x is string => !!x);

  const [profilesRes, benefitsRes, companyRes] = await Promise.all([
    employeeIds.length
      ? supabase
          .from('profiles')
          .select(
            'id, first_name, last_name, full_name, email, tin, tax_id, nin, nhf_number, nhis_number, pension_pin, pfa_code, state_of_residence, staff_number, employee_number, bank_name, bank_account_number, bank_account_name, nhis_enabled, voluntary_pension_pct, annual_rent_ngn, annual_life_assurance_ngn',
          )
          .in('id', employeeIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    employeeIds.length
      ? supabase
          .from('employee_benefits')
          .select('employee_id, benefit_type, provider, status')
          .in('employee_id', employeeIds)
          .eq('benefit_type', 'pension_pfa')
          .eq('status', 'active')
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase
      .from('company_settings')
      .select(
        // Includes both the new statutory-export fields (employer_tin,
        // employer_rc_number, state_of_business, per-scheme employer codes)
        // AND the pre-existing tin/rc_number/address so we can fall back
        // when the finance team hasn't yet duplicated them.
        'company_name, address, company_address, tin, rc_number, employer_tin, employer_rc_number, state_of_business, pencom_employer_code, nhf_employer_code, nsitf_employer_code, itf_employer_code',
      )
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle(),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (benefitsRes.error) throw new Error(benefitsRes.error.message);

  const profileById = new Map<string, any>();
  for (const p of (profilesRes.data ?? []) as any[]) profileById.set(p.id, p);
  const pfaByEmployee = new Map<string, string>();
  for (const b of (benefitsRes.data ?? []) as any[]) {
    if (!pfaByEmployee.has(b.employee_id) && b.provider) {
      pfaByEmployee.set(b.employee_id, b.provider);
    }
  }

  const cs = (companyRes.data ?? {}) as any;

  const lineItems: StatutoryLineItem[] = items.map((it: any) => {
    const p = it.employee_id ? profileById.get(it.employee_id) : null;
    const pensionEmployee = round(it.pension_ngn);
    const pensionEmployer = Math.round(pensionEmployee * (PENSION_EMPLOYER_RATE / PENSION_EMPLOYEE_RATE));
    const nhisMonthly = round(it.nhis_ngn) || (p?.nhis_enabled ? Math.round(Number(it.gross_ngn || 0) * NHIS_EMPLOYEE_RATE) : 0);
    const avcMonthly = round(it.avc_ngn);
    const annualRent = Number(p?.annual_rent_ngn || 0);
    const rentReliefAnnual = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP_ANNUAL);
    const rentReliefMonthly = Math.round(rentReliefAnnual / 12);
    const lifeAssuranceMonthly = Math.round(Number(p?.annual_life_assurance_ngn || 0) / 12);
    return {
      employee_id: it.employee_id ?? '',
      employee_name: it.employee_name || p?.full_name || 'Unknown',
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      staff_number: p?.staff_number ?? p?.employee_number ?? null,
      email: p?.email ?? null,
      tin: p?.tin ?? p?.tax_id ?? null,
      nin: p?.nin ?? null,
      nhf_number: p?.nhf_number ?? null,
      nhis_number: p?.nhis_number ?? null,
      rsa_pin: p?.pension_pin ?? null,
      pfa_name: pfaByEmployee.get(it.employee_id ?? '') ?? null,
      pfa_code: p?.pfa_code ?? null,
      state_of_residence: p?.state_of_residence ?? null,
      bank_name: p?.bank_name ?? null,
      bank_account_number: p?.bank_account_number ?? null,
      bank_account_name: p?.bank_account_name ?? null,
      gross_monthly_ngn: round(it.gross_ngn),
      paye_monthly_ngn: round(it.paye_ngn),
      pension_employee_monthly_ngn: pensionEmployee,
      pension_employer_monthly_ngn: pensionEmployer,
      nhf_monthly_ngn: round(it.nhf_ngn),
      nhis_monthly_ngn: nhisMonthly,
      avc_monthly_ngn: avcMonthly,
      rent_relief_monthly_ngn: rentReliefMonthly,
      life_assurance_monthly_ngn: lifeAssuranceMonthly,
      net_monthly_ngn: round(it.net_ngn),
    };
  });

  const totals = lineItems.reduce(
    (acc, li) => ({
      gross_monthly_ngn: acc.gross_monthly_ngn + li.gross_monthly_ngn,
      paye_monthly_ngn: acc.paye_monthly_ngn + li.paye_monthly_ngn,
      pension_employee_monthly_ngn:
        acc.pension_employee_monthly_ngn + li.pension_employee_monthly_ngn,
      pension_employer_monthly_ngn:
        acc.pension_employer_monthly_ngn + li.pension_employer_monthly_ngn,
      nhf_monthly_ngn: acc.nhf_monthly_ngn + li.nhf_monthly_ngn,
      nhis_monthly_ngn: acc.nhis_monthly_ngn + li.nhis_monthly_ngn,
      net_monthly_ngn: acc.net_monthly_ngn + li.net_monthly_ngn,
      nsitf_monthly_ngn: 0,
      headcount: acc.headcount + 1,
    }),
    {
      gross_monthly_ngn: 0,
      paye_monthly_ngn: 0,
      pension_employee_monthly_ngn: 0,
      pension_employer_monthly_ngn: 0,
      nhf_monthly_ngn: 0,
      nhis_monthly_ngn: 0,
      net_monthly_ngn: 0,
      nsitf_monthly_ngn: 0,
      headcount: 0,
    },
  );
  totals.nsitf_monthly_ngn = Math.round(totals.gross_monthly_ngn * NSITF_RATE);

  return {
    period: run.period as string,
    payroll_run_id: run.id as string,
    employer: {
      company_name: cs.company_name || 'KD Squares Ltd',
      // Fall back to the canonical fields most sites already populate.
      employer_tin: cs.employer_tin ?? cs.tin ?? null,
      employer_rc_number: cs.employer_rc_number ?? cs.rc_number ?? null,
      state_of_business: cs.state_of_business ?? null,
      pencom_employer_code: cs.pencom_employer_code ?? null,
      nhf_employer_code: cs.nhf_employer_code ?? null,
      nsitf_employer_code: cs.nsitf_employer_code ?? null,
      itf_employer_code: cs.itf_employer_code ?? null,
      company_address: cs.company_address ?? cs.address ?? null,
    },
    items: lineItems,
    totals,
  };
}

/**
 * Format a period 'YYYY-MM' as 'Apr 2026' — used in filenames.
 */
export function shortPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period.replace(/[^a-z0-9-]/gi, '');
  const [, y, mm] = m;
  const label = new Date(Number(y), Number(mm) - 1, 1).toLocaleString('en-GB', {
    month: 'short',
  });
  return `${label}-${y}`;
}
