/**
 * Bank payment file generator — produces NIBSS-format or CSV payment
 * instruction files from an approved payroll run, ready for upload to
 * the bank's corporate internet banking portal.
 */

import { supabase } from '@/lib/supabase';
import { toCsv } from '@/lib/csv';

export interface PaymentInstruction {
  employee_name: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  amount: number;
  currency: string;
  narration: string;
}

export async function buildPaymentInstructions(
  payrollRunId: string,
): Promise<PaymentInstruction[]> {
  const { data: payslips, error } = await supabase
    .from('payslips')
    .select(`
      net_ngn,
      currency,
      profiles:employee_id(
        full_name,
        bank_name,
        bank_code,
        bank_account_number,
        bank_account_name,
        pay_currency
      )
    `)
    .eq('payroll_run_id', payrollRunId);

  if (error || !payslips?.length) return [];

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('period')
    .eq('id', payrollRunId)
    .single();

  const period = run?.period || '';

  return (payslips as any[])
    .filter((p) => p.profiles?.bank_account_number && p.net_ngn > 0)
    .map((p) => ({
      employee_name: p.profiles.full_name || '',
      bank_name: p.profiles.bank_name || '',
      bank_code: p.profiles.bank_code || '',
      account_number: p.profiles.bank_account_number || '',
      account_name: p.profiles.bank_account_name || p.profiles.full_name || '',
      amount: Math.round(Number(p.net_ngn)),
      currency: p.currency || p.profiles.pay_currency || 'NGN',
      narration: `Salary ${period}`,
    }))
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

export function instructionsToCsv(instructions: PaymentInstruction[]): string {
  const header = [
    'S/N',
    'Employee Name',
    'Bank Name',
    'Bank Code',
    'Account Number',
    'Account Name',
    'Amount',
    'Currency',
    'Narration',
  ];
  const rows = instructions.map((inst, i) => [
    String(i + 1),
    inst.employee_name,
    inst.bank_name,
    inst.bank_code,
    inst.account_number,
    inst.account_name,
    String(inst.amount),
    inst.currency,
    inst.narration,
  ]);
  return toCsv(header, rows);
}

export function instructionsToNibss(instructions: PaymentInstruction[]): string {
  const lines = instructions.map((inst) =>
    [
      inst.account_number.padEnd(10),
      inst.bank_code.padEnd(6),
      String(inst.amount).padStart(15, '0'),
      inst.account_name.padEnd(30).slice(0, 30),
      inst.narration.padEnd(30).slice(0, 30),
    ].join(','),
  );
  return lines.join('\n');
}
