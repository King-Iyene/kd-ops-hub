import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CircleDollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import LoanAmortisationChart from './LoanAmortisationChart';

/**
 * Loans panel for an employee — lists every employee_loans row for the
 * given employee, click a card to expand the LoanAmortisationChart
 * inline. Read-only; loan creation happens elsewhere.
 */

interface Loan {
  id: string;
  amount_ngn: number;
  interest_rate_pct: number;
  tenure_months: number;
  monthly_installment_ngn: number;
  disbursement_date: string;
  status: 'active' | 'fully_paid' | 'written_off' | 'cancelled';
  purpose: string;
}

const STATUS_TONE: Record<Loan['status'], string> = {
  active:       'bg-primary/10 text-primary',
  fully_paid:   'bg-emerald-100 text-emerald-700',
  written_off:  'bg-amber-100 text-amber-700',
  cancelled:    'bg-muted text-muted-foreground',
};

interface Props {
  employeeId: string;
}

export const EmployeeLoansPanel = ({ employeeId }: Props) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('employee_loans')
        .select('id, amount_ngn, interest_rate_pct, tenure_months, monthly_installment_ngn, disbursement_date, status, purpose')
        .eq('employee_id', employeeId)
        .order('disbursement_date', { ascending: false });
      setLoans((data ?? []) as Loan[]);
      setLoading(false);
    })();
  }, [employeeId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading loans…</p>;
  }
  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CircleDollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No staff loans on file for this employee.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {loans.map((l) => {
        const isOpen = expanded === l.id;
        return (
          <Card key={l.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CircleDollarSign className="h-4 w-4" />
                    {l.purpose}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Disbursed {formatDate(l.disbursement_date)} · Tenure {l.tenure_months}m
                    {l.interest_rate_pct > 0 && ` · ${l.interest_rate_pct}% p.a.`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={cn('text-[11px]', STATUS_TONE[l.status])}>
                    {l.status}
                  </Badge>
                  <p className="text-right">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Principal</span>
                    <br />
                    <span className="text-sm font-bold currency">{formatNaira(l.amount_ngn)}</span>
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(isOpen ? null : l.id)}
                  >
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {isOpen ? 'Collapse' : 'Details'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="pt-0">
                <LoanAmortisationChart loanId={l.id} />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default EmployeeLoansPanel;
