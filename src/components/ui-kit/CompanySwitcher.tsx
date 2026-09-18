import { Building2, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Company } from '@/queries';

interface Props {
  companies: Company[];
  value: string;
  onChange: (companyId: string) => void;
  className?: string;
}

/**
 * Always-visible company switcher — the top-level context selector for any
 * page whose data (payroll, compliance) is scoped per-company. Matches the
 * pattern Gusto/Notion/Google use for multi-entity/multi-workspace
 * switching: a single dropdown near the page header, never buried in
 * settings, always showing which context is currently active.
 */
export function CompanySwitcher({ companies, value, onChange, className }: Props) {
  const current = companies.find((c) => c.id === value) ?? companies[0];
  if (!current) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-9 gap-2 border-2 font-semibold', className)}
          style={{ borderColor: current.color }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: current.color }}
            aria-hidden
          />
          {current.name}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onClick={() => onChange(c.id)}
            className="gap-2 cursor-pointer"
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            <span className="flex-1">{c.name}</span>
            {c.id === current.id && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Small inline badge for showing which company a row/card belongs to. */
export function CompanyBadge({ company, className }: { company: Pick<Company, 'name' | 'color'> | null | undefined; className?: string }) {
  if (!company) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-2xs text-muted-foreground', className)}>
        <Building2 className="h-3 w-3" /> No company
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium', className)}
      style={{ borderColor: company.color, color: company.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: company.color }} aria-hidden />
      {company.name}
    </span>
  );
}
