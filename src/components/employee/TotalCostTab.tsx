import { Wallet, Receipt, HeartPulse, Package } from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  totalCostOfEmployment: number;
  payrollTotal: number;
  payrollGross: number;
  payrollEmployerPension: number;
  payrollEmployerNsitf: number;
  nsitfEnabled: boolean;
  payslipsInRange: any[];
  expensesTotal: number;
  approvedExpenses: any[];
  expensesCount: number;
  benefitsAnnualized: number;
  costedBenefits: any[];
  assignedAssets: any[];
  assetsBookValue: number;
}

export default function TotalCostTab(props: Props) {
  const {
    totalCostOfEmployment, payrollTotal, payrollGross, payrollEmployerPension,
    payrollEmployerNsitf, nsitfEnabled, payslipsInRange, expensesTotal,
    approvedExpenses, expensesCount, benefitsAnnualized, costedBenefits,
    assignedAssets, assetsBookValue,
  } = props;

  return (
    <div className="mt-4 space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Total cost of employment · trailing 12 months
          </p>
          <p className="text-3xl font-bold tabular-nums">{formatNaira(totalCostOfEmployment)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Payroll (gross + employer pension + employer NSITF) + approved expenses + employer-paid benefits.
            Loans and salary advances are excluded — see the Advances tab — because that's repayable cash, not new cost.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Payroll
            </p>
            <p className="text-2xl font-bold tabular-nums">{formatNaira(payrollTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNaira(payrollGross)} gross + {formatNaira(payrollEmployerPension)} employer pension
              {nsitfEnabled ? ` + ${formatNaira(payrollEmployerNsitf)} NSITF` : ''} · {payslipsInRange.length} payslip{payslipsInRange.length === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> Approved expenses
            </p>
            <p className="text-2xl font-bold tabular-nums">{formatNaira(expensesTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {approvedExpenses.length} approved claim{approvedExpenses.length === 1 ? '' : 's'}
              {expensesCount >= 20
                ? ' — capped at the latest 20 claims on this profile, may understate a high submitter.'
                : ' — see the Expenses tab for the full list.'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <HeartPulse className="h-3.5 w-3.5" /> Benefits (annualised)
            </p>
            <p className="text-2xl font-bold tabular-nums">{formatNaira(benefitsAnnualized)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {costedBenefits.length === 0
                ? 'No active HMO / group life / other benefits on file.'
                : `${costedBenefits.length} active enrolment${costedBenefits.length === 1 ? '' : 's'}, at current premiums.`}
            </p>
          </CardContent>
        </Card>
      </div>

      {assignedAssets.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" /> Equipment assigned
            </CardTitle>
            <span className="text-sm font-semibold tabular-nums">{formatNaira(assetsBookValue)}</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {assignedAssets.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground capitalize">{a.category}</span>
                  <span className="tabular-nums">{formatNaira(a.cost_ngn || 0)}</span>
                </div>
              ))}
            </div>
            <p className="px-4 py-2 text-xs text-muted-foreground border-t">
              Purchase cost of equipment currently assigned — a one-time capital cost, shown for reference and not added to the total above.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
