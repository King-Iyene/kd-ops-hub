import type { FilterFieldDef } from './types';

/** Task fields the filter builder can condition on this phase. Custom
 *  fields, tags and Task-link join the list once the field engine exists
 *  (Phase 5) and tables exist (Phase 9/10) — the engine itself already
 *  supports any field of these four types without further changes. */
export const TASK_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'status', label: 'Status', type: 'select' },
  {
    key: 'priority',
    label: 'Priority',
    type: 'select',
    options: [
      { value: 'urgent', label: 'Urgent' },
      { value: 'high', label: 'High' },
      { value: 'normal', label: 'Normal' },
      { value: 'low', label: 'Low' },
    ],
  },
  { key: 'assignees', label: 'Assignees', type: 'person' },
  { key: 'due_date', label: 'Due date', type: 'date' },
  { key: 'start_date', label: 'Start date', type: 'date' },
  { key: 'created_at', label: 'Created', type: 'date' },
];
