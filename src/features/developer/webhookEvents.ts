// Single source of truth for every webhook event the platform actually
// fires. WebhooksManager.tsx (the event picker when creating a webhook)
// and ApiReference.tsx (the "Platform events" doc page) each used to keep
// their own hand-typed copy of this list, and the two had already drifted:
// the docs advertised employee.deleted, contractor.contract_expired, and
// task.overdue as real, subscribable events — none of the three were ever
// in the actual picker, and nothing in the codebase ever dispatched any of
// them. A developer who configured a webhook for one of those event names
// (because the docs told them it existed) would silently never receive
// anything, with no error anywhere to explain why.
//
// Keep this list and what actually calls dispatchPlatformWebhook()/
// dispatchFormWebhook() in sync — that's the actual contract, this file is
// just where both consumers read it from now instead of guessing.
export const EVENT_GROUPS: { module: string; color: string; events: string[] }[] = [
  { module: 'Employees', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', events: ['employee.created', 'employee.updated', 'employee.suspended', 'employee.reactivated'] },
  { module: 'Contractors', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', events: ['contractor.created', 'contractor.updated', 'contractor.deleted'] },
  { module: 'Tasks', color: 'bg-violet-500/15 text-violet-400 border-violet-500/30', events: ['task.created', 'task.updated', 'task.completed', 'task.deleted', 'task.assigned', 'task.comment_added', 'task.form_submitted'] },
  { module: 'Tables', color: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30', events: ['table.form_submitted'] },
  { module: 'Leave', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', events: ['leave.requested', 'leave.approved', 'leave.rejected', 'leave.cancelled'] },
  { module: 'Expenses', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', events: ['expense.submitted', 'expense.approved', 'expense.rejected', 'expense.reimbursed'] },
  { module: 'Payroll', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', events: ['payroll.run_started', 'payroll.run_completed', 'payroll.slip_generated'] },
  { module: 'Fleet', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30', events: ['fuel_request.created', 'fuel_request.approved', 'fuel_request.rejected', 'trip.logged', 'trip.completed', 'vehicle.added'] },
  { module: 'Invoices', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', events: ['invoice.created', 'invoice.sent', 'invoice.paid'] },
  { module: 'Clients', color: 'bg-teal-500/15 text-teal-400 border-teal-500/30', events: ['client.created', 'client.updated', 'client.deleted'] },
  { module: 'Recruitment', color: 'bg-pink-500/15 text-pink-400 border-pink-500/30', events: ['applicant.created', 'applicant.stage_changed', 'applicant.hired', 'applicant.rejected', 'opening.created', 'opening.closed'] },
  { module: 'Payments', color: 'bg-green-500/15 text-green-400 border-green-500/30', events: ['payment.completed', 'payment.failed', 'payment.pending', 'batch.created', 'batch.approved', 'batch.processed'] },
  { module: 'Database', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', events: ['record.created', 'record.updated', 'record.deleted', 'record.bulk_created'] },
];

export const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events);

export function eventColor(event: string): string {
  for (const g of EVENT_GROUPS) {
    if (g.events.includes(event)) return g.color;
  }
  return 'bg-muted text-muted-foreground';
}

export function eventModule(event: string): string {
  for (const g of EVENT_GROUPS) {
    if (g.events.includes(event)) return g.module;
  }
  return 'Other';
}

/** Renders the catalog as `# Module\nevent.a, event.b\n\n# Next module\n...`
 *  text — used by the API Reference doc page so its "available events"
 *  listing can never drift from what WebhooksManager's picker actually
 *  offers (and what the code actually dispatches). */
export function formatEventCatalogAsText(): string {
  return EVENT_GROUPS.map((g) => `# ${g.module}\n${g.events.join(', ')}`).join('\n\n');
}
