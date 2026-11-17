import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanies, useCompany } from '../lib/company';
import { useActiveEmployees as useAllEmployeesRaw } from '@/queries/useEmployees';

/** Company picker shown at the top of every Time Tracking page. The choice is remembered. */
export function CompanyFilter() {
  const [company, setCompany] = useCompany();
  const { data: companies } = useCompanies();
  const { data: everyone } = useAllEmployeesRaw();
  if (!companies || companies.length < 2) return null;
  const unassigned = (everyone ?? []).filter((e) => !e.department_id).length;
  return (
    <Select value={company} onValueChange={setCompany}>
      <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Company">
        <Building2 className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All companies</SelectItem>
        {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        {unassigned > 0 && <SelectItem value="none">No company assigned ({unassigned})</SelectItem>}
      </SelectContent>
    </Select>
  );
}
