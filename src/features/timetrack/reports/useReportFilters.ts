import { useState } from 'react';
import { format, startOfMonth } from 'date-fns';

/**
 * Shared filter state for every report page under Reports > Time and
 * Reports > Finance — mirrors TimeCamp's own report filter bar (Date range,
 * People, Projects, Active/archived, Tags, Invoiced status, Billable status,
 * Notes) so every leaf report behaves the same way.
 */
export interface ReportFilters {
  start: string;
  end: string;
  employeeIds: string[];
  projectIds: string[];
  activeArchived: 'active' | 'archived' | 'all';
  tagIds: string[];
  invoicedStatus: 'all' | 'invoiced' | 'not_invoiced';
  billableStatus: 'all' | 'billable' | 'non_billable';
  notes: string;
}

export interface ReportFiltersState extends ReportFilters {
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
  setEmployeeIds: (v: string[]) => void;
  setProjectIds: (v: string[]) => void;
  setActiveArchived: (v: ReportFilters['activeArchived']) => void;
  setTagIds: (v: string[]) => void;
  setInvoicedStatus: (v: ReportFilters['invoicedStatus']) => void;
  setBillableStatus: (v: ReportFilters['billableStatus']) => void;
  setNotes: (v: string) => void;
}

export function useReportFilters(): ReportFiltersState {
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [activeArchived, setActiveArchived] = useState<ReportFilters['activeArchived']>('active');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [invoicedStatus, setInvoicedStatus] = useState<ReportFilters['invoicedStatus']>('all');
  const [billableStatus, setBillableStatus] = useState<ReportFilters['billableStatus']>('all');
  const [notes, setNotes] = useState('');

  return {
    start, end, employeeIds, projectIds, activeArchived, tagIds, invoicedStatus, billableStatus, notes,
    setStart, setEnd, setEmployeeIds, setProjectIds, setActiveArchived, setTagIds, setInvoicedStatus, setBillableStatus, setNotes,
  };
}
