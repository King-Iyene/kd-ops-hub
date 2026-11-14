import { useState } from 'react';
import { Check, ChevronDown, Download, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ReportFiltersState } from './useReportFilters';
import { useReportLookups } from './useReportData';

/** Generic "All X" + searchable multi-pick popover — used for People,
 * Projects, and Tags, matching TimeCamp's own filter dropdowns. */
export function MultiSelectFilter({
  label, allLabel, options, selected, onChange,
}: {
  label: string;
  allLabel: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? options.find((o) => o.id === selected[0])?.name ?? `1 selected`
      : `${selected.length} selected`;

  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between font-normal mt-1">
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
            <CommandList>
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => onChange([])}>
                  <Check className={cn('mr-2 h-4 w-4', selected.length === 0 ? 'opacity-100' : 'opacity-0')} />
                  {allLabel}
                </CommandItem>
                {options.map((opt) => {
                  const isChecked = selected.includes(opt.id);
                  return (
                    <CommandItem
                      key={opt.id}
                      onSelect={() => onChange(isChecked ? selected.filter((id) => id !== opt.id) : [...selected, opt.id])}
                    >
                      <Check className={cn('mr-2 h-4 w-4', isChecked ? 'opacity-100' : 'opacity-0')} />
                      {opt.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export interface ReportFiltersBarProps {
  filters: ReportFiltersState;
  /** Export handlers — pages pass whichever formats make sense for them.
   * Omit to hide the Export button entirely (e.g. Real-time dashboard). */
  onExportCsv?: () => void;
  onExportXlsx?: () => void;
  /** Extra actions rendered to the right (e.g. "Save this report"). */
  extraActions?: React.ReactNode;
}

export function ReportFiltersBar({ filters: f, onExportCsv, onExportXlsx, extraActions }: ReportFiltersBarProps) {
  const { employees, projects, tags } = useReportLookups();

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Date range</Label>
            <div className="flex items-center gap-1.5 mt-1">
              <Input type="date" value={f.start} onChange={(e) => f.setStart(e.target.value)} className="h-8 text-xs w-[136px]" />
              <span className="text-muted-foreground text-xs">–</span>
              <Input type="date" value={f.end} onChange={(e) => f.setEnd(e.target.value)} className="h-8 text-xs w-[136px]" />
            </div>
          </div>

          <MultiSelectFilter
            label="People" allLabel="All users"
            options={(employees.data ?? []).map((e) => ({ id: e.id, name: e.full_name ?? e.email }))}
            selected={f.employeeIds} onChange={f.setEmployeeIds}
          />

          <MultiSelectFilter
            label="Projects" allLabel="Projects"
            options={(projects.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
            selected={f.projectIds} onChange={f.setProjectIds}
          />

          <div>
            <Label className="text-xs text-muted-foreground">Active/archived</Label>
            <Select value={f.activeArchived} onValueChange={(v) => f.setActiveArchived(v as typeof f.activeArchived)}>
              <SelectTrigger className="h-8 text-xs w-[130px] mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active tasks</SelectItem>
                <SelectItem value="archived">Archived tasks</SelectItem>
                <SelectItem value="all">All tasks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <MultiSelectFilter
            label="Tags" allLabel="Select a tag"
            options={(tags.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
            selected={f.tagIds} onChange={f.setTagIds}
          />

          <div>
            <Label className="text-xs text-muted-foreground">Invoiced status</Label>
            <Select value={f.invoicedStatus} onValueChange={(v) => f.setInvoicedStatus(v as typeof f.invoicedStatus)}>
              <SelectTrigger className="h-8 text-xs w-[110px] mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
                <SelectItem value="not_invoiced">Not invoiced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-end gap-2">
          {extraActions}
          <Button variant="outline" size="sm" disabled title="Periodical email digests aren't wired up yet">
            <Mail className="h-3.5 w-3.5 mr-1.5" /> Periodical emails
          </Button>
          {(onExportCsv || onExportXlsx) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1.5" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onExportCsv && <DropdownMenuItem onClick={onExportCsv}>Export CSV</DropdownMenuItem>}
                {onExportXlsx && <DropdownMenuItem onClick={onExportXlsx}>Download Excel (XLSX)</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Billable status</Label>
          <Select value={f.billableStatus} onValueChange={(v) => f.setBillableStatus(v as typeof f.billableStatus)}>
            <SelectTrigger className="h-8 text-xs w-[110px] mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="billable">Billable</SelectItem>
              <SelectItem value="non_billable">Non-billable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[160px] max-w-xs">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Input placeholder="Search" value={f.notes} onChange={(e) => f.setNotes(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
      </div>
    </div>
  );
}
