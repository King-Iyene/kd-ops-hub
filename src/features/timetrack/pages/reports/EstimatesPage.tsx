import { useQuery } from '@tanstack/react-query';
import { Loader2, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { formatNaira } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { fetchAllProjects } from '../../lib/queries';
import { formatHours } from '../../reports/useReportData';

interface ProjectEstimate {
  projectId: string; projectName: string;
  budgetType: 'hours' | 'amount' | null;
  budgetHours: number | null; budgetAmount: number | null;
  usedHours: number; usedAmount: number; pctUsed: number; overThreshold: boolean;
}

/**
 * Reports > Finance > Estimates — budget vs. actual, cumulative (not
 * scoped to the date-range filter bar, same as TimeCamp's own version,
 * which banners "longer period is better for projections"). One row per
 * project with a budget configured under its Settings.
 */
function useEstimates() {
  return useQuery({
    queryKey: ['timetrack', 'estimates'],
    queryFn: async (): Promise<ProjectEstimate[]> => {
      const projects = await fetchAllProjects();
      const results = await Promise.all(projects.map(async (p) => {
        const { data, error } = await supabase.rpc('time_project_budget_usage', { p_project_id: p.id });
        if (error) throw error;
        const row = data?.[0];
        if (!row) return null;
        return {
          projectId: p.id, projectName: p.name,
          budgetType: row.budget_type as 'hours' | 'amount', budgetHours: row.budget_hours, budgetAmount: row.budget_amount,
          usedHours: row.used_hours, usedAmount: row.used_amount, pctUsed: row.pct_used, overThreshold: row.over_threshold,
        };
      }));
      return results.filter((r): r is ProjectEstimate => r !== null).sort((a, b) => b.pctUsed - a.pctUsed);
    },
  });
}

export default function EstimatesPage() {
  const { data: rows, isLoading } = useEstimates();
  const list = rows ?? [];

  const exportCsv = () => {
    const header = ['Project', 'Budget type', 'Budget', 'Used', 'Left', '% used'];
    const csvRows = list.map((r) => {
      const budget = r.budgetType === 'hours' ? formatHours(r.budgetHours ?? 0) : formatNaira(r.budgetAmount ?? 0);
      const used = r.budgetType === 'hours' ? formatHours(r.usedHours) : formatNaira(r.usedAmount);
      const left = r.budgetType === 'hours' ? formatHours((r.budgetHours ?? 0) - r.usedHours) : formatNaira((r.budgetAmount ?? 0) - r.usedAmount);
      return [r.projectName, r.budgetType ?? '—', budget, used, left, `${r.pctUsed.toFixed(1)}%`];
    });
    downloadCsv('estimates.csv', toCsv(header, csvRows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Estimates" description="Budget vs. cumulative tracked time, for every project with a budget set" icon={Gauge} />
      <div className="flex justify-end">
        <button onClick={exportCsv} className="text-sm text-primary hover:underline">Export CSV</button>
      </div>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead><TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Used</TableHead><TableHead className="text-right">Left</TableHead>
              <TableHead className="text-right">% used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => {
              const budget = r.budgetType === 'hours' ? formatHours(r.budgetHours ?? 0) : formatNaira(r.budgetAmount ?? 0);
              const used = r.budgetType === 'hours' ? formatHours(r.usedHours) : formatNaira(r.usedAmount);
              const leftVal = r.budgetType === 'hours' ? (r.budgetHours ?? 0) - r.usedHours : (r.budgetAmount ?? 0) - r.usedAmount;
              const left = r.budgetType === 'hours' ? formatHours(leftVal) : formatNaira(leftVal);
              return (
                <TableRow key={r.projectId}>
                  <TableCell>{r.projectName}</TableCell>
                  <TableCell className="text-right">{budget}</TableCell>
                  <TableCell className="text-right">{used}</TableCell>
                  <TableCell className={`text-right ${leftVal < 0 ? 'text-destructive' : ''}`}>{left}</TableCell>
                  <TableCell className={`text-right font-medium ${r.overThreshold ? 'text-destructive' : ''}`}>{r.pctUsed.toFixed(1)}%</TableCell>
                </TableRow>
              );
            })}
            {list.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No project has a budget configured yet — set one under a project's settings.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
