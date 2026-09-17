import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, CheckSquare, CalendarDays, Receipt, Banknote,
  Truck, FileText, Building2, UserPlus, Database, CreditCard,
  Copy, Check, ChevronRight, AlertTriangle, Lightbulb, Info,
  ExternalLink, ChevronDown, Search, Webhook,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EVENT_GROUPS, eventColor } from '../webhookEvents';

/* ─── Constants ─── */

const API_BASE = 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/rest-api/v1';

/* ─── Types ─── */

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Field {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface EndpointDef {
  method: HttpMethod;
  path: string;
  description: string;
  curlExample: string;
  responseExample: string;
}

interface TipItem {
  text: string;
}

interface MistakeItem {
  text: string;
}

interface WarningBox {
  text: string;
}

interface WebhookExample {
  event: string;
  code: string;
  caption?: string;
}

interface ModuleDef {
  id: string;
  name: string;
  icon: React.ElementType;
  basePath: string;
  overview: string;
  access: string;
  /** Whether this module has a real, callable REST endpoint. Only the
   * Database module does — every other module's data lives in dedicated
   * hardcoded tables with no REST route in supabase/functions/rest-api. */
  restAvailable: boolean;
  /** Module key into EVENT_GROUPS (src/features/developer/webhookEvents.ts)
   * — the single source of truth for which webhook events actually fire. */
  webhookModule?: string;
  webhookExample?: WebhookExample;
  endpoints: EndpointDef[];
  fields: Field[];
  tips: TipItem[];
  mistakes: MistakeItem[];
  warnings?: WarningBox[];
}

/* ─── Helpers ─── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 text-zinc-400 dark:text-zinc-500 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [open, setOpen] = useState(false);
  const isLong = code.split('\n').length > 6;
  const show = !isLong || open;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/80">
        <span className="text-3xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-1">
          {isLong && (
            <button onClick={() => setOpen(!open)} className="text-3xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 px-1.5 py-0.5">
              {open ? 'Collapse' : 'Expand'}
            </button>
          )}
          <CopyButton text={code} />
        </div>
      </div>
      <div className={cn("bg-zinc-950 overflow-x-auto", !show && "max-h-[160px] overflow-hidden relative")}>
        <pre className="p-3 text-xs text-zinc-200 font-mono whitespace-pre leading-relaxed">{code}</pre>
        {!show && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-950 to-transparent" />
        )}
      </div>
    </div>
  );
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

/** Builds the real webhook-dispatcher wire envelope for a module event fired
 * via dispatchPlatformWebhook() (src/lib/platform-webhooks.ts). That helper
 * always sends the nil-UUID platform sentinel for base_id/table_id and never
 * passes an old record, so old_payload is always null for these events —
 * this is a different (and simpler) shape than the generic Bases API's
 * record.* webhooks, which carry short IDs and a table_name. */
function platformWebhookEnvelope(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    event,
    timestamp: '2026-09-15T10:30:00Z',
    base_id: '00000000-0000-0000-0000-000000000000',
    table_id: '00000000-0000-0000-0000-000000000000',
    payload,
    old_payload: null,
  }, null, 2);
}

/* ─── Module Data ─── */

const modules: ModuleDef[] = [
  // ────────── EMPLOYEES ──────────
  {
    id: 'employees',
    name: 'Employees',
    icon: Users,
    basePath: '/employees',
    overview: 'Manage all employees. Employees are the core entity in KDOps — linked to tasks, leave, payroll, expenses, and fleet. Every person on your team starts here. There is no REST endpoint for employees today — create and manage them in the KDOps UI, and use webhooks to react to changes in real time.',
    access: 'admin, super_admin (read: all roles)',
    restAvailable: false,
    webhookModule: 'Employees',
    webhookExample: {
      event: 'employee.created',
      code: platformWebhookEnvelope('employee.created', {
        email: 'emeka@kdsquares.com',
        full_name: 'Emeka Nwosu',
        role: 'operations',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'first_name', type: 'string', required: true, description: "Employee's first name" },
      { name: 'last_name', type: 'string', required: true, description: "Employee's last name" },
      { name: 'email', type: 'string', required: true, description: 'Must be unique across all employees' },
      { name: 'phone', type: 'string', required: false, description: 'Phone number (e.g., "+2348012345678")' },
      { name: 'department', type: 'string', required: false, description: 'e.g., "Engineering", "Finance", "Operations"' },
      { name: 'role', type: 'string', required: false, description: 'One of: super_admin, admin, finance, operations, field_staff' },
      { name: 'employment_type', type: 'string', required: false, description: '"full_time", "part_time", "contract"' },
      { name: 'start_date', type: 'string', required: false, description: 'YYYY-MM-DD format. Defaults to today if omitted.' },
      { name: 'salary', type: 'number', required: false, description: 'Monthly salary in NGN (e.g., 450000)' },
      { name: 'bank_name', type: 'string', required: false, description: 'Bank name for payroll (e.g., "Access Bank", "GTBank", "First Bank")' },
      { name: 'account_number', type: 'string', required: false, description: '10-digit NUBAN account number' },
      { name: 'account_name', type: 'string', required: false, description: 'Name on the bank account' },
      { name: 'status', type: 'string', required: false, description: '"active", "inactive", "suspended"' },
    ],
    tips: [
      { text: 'Always include bank details (bank_name, account_number, account_name) for employees who will receive payroll or disbursements.' },
      { text: 'Email must be unique across all employees — the app rejects a duplicate when you try to create one.' },
      { text: 'Role determines what the employee can see and do in KDOps — choose carefully.' },
      { text: 'Subscribe to employee.created, employee.updated, employee.suspended, and employee.reactivated to sync employee changes into another system in real time.' },
      { text: 'Soft-deleted employees (status: inactive) can be reactivated from the Employees page — this fires employee.reactivated.' },
    ],
    mistakes: [
      { text: 'Forgetting bank_name, account_number, account_name → payroll and disbursements won\'t process for this employee.' },
      { text: 'Using the wrong role value → must be exactly one of: super_admin, admin, finance, operations, field_staff.' },
      { text: 'Not setting start_date → defaults to today, which may not be correct for backdated hires.' },
      { text: 'Assuming there\'s a REST endpoint to create or fetch employees — there isn\'t one yet. Manage employees in the UI and react to employee.* webhooks instead.' },
    ],
  },

  // ────────── CONTRACTORS ──────────
  {
    id: 'contractors',
    name: 'Contractors',
    icon: UserCheck,
    basePath: '/contractors',
    overview: 'Manage contractors and freelancers. Similar to employees but for non-permanent staff. Contractors have their own directory, separate from employees, with rate-based compensation. There is no REST endpoint for contractors today — manage them in the KDOps UI and use webhooks to react to changes.',
    access: 'admin, super_admin (read: all roles)',
    restAvailable: false,
    webhookModule: 'Contractors',
    webhookExample: {
      event: 'contractor.created',
      code: platformWebhookEnvelope('contractor.created', {
        full_name: 'Aisha Ibrahim',
        email: 'aisha@designstudio.ng',
        role: 'contractor',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'first_name', type: 'string', required: true, description: "Contractor's first name" },
      { name: 'last_name', type: 'string', required: true, description: "Contractor's last name" },
      { name: 'email', type: 'string', required: true, description: 'Must be unique' },
      { name: 'phone', type: 'string', required: false, description: 'Phone number' },
      { name: 'company', type: 'string', required: false, description: 'Company or business name' },
      { name: 'rate', type: 'number', required: false, description: 'Payment rate in NGN' },
      { name: 'rate_type', type: 'string', required: false, description: '"hourly", "daily", or "monthly" — determines how payment is calculated' },
      { name: 'bank_name', type: 'string', required: false, description: 'Bank name for payments' },
      { name: 'account_number', type: 'string', required: false, description: '10-digit NUBAN account number' },
      { name: 'account_name', type: 'string', required: false, description: 'Name on the bank account' },
      { name: 'status', type: 'string', required: false, description: '"active", "inactive"' },
    ],
    tips: [
      { text: 'Contractors have their own directory, completely separate from employees.' },
      { text: 'Bank details are needed for payment batch disbursements — add them when creating a contractor.' },
      { text: 'rate_type determines how the payment amount is calculated: hourly, daily, or monthly.' },
      { text: 'Subscribe to contractor.created, contractor.updated, and contractor.deleted to keep an external directory or CRM in sync.' },
    ],
    mistakes: [
      { text: 'Confusing contractors with employees — they are separate directories in KDOps.' },
      { text: 'Missing bank details → contractor cannot receive payment batch disbursements.' },
      { text: 'Assuming contractors are reachable via REST — there\'s no /contractors endpoint. Manage them in the UI and listen for contractor.* webhooks.' },
    ],
  },

  // ────────── TASKS ──────────
  {
    id: 'tasks',
    name: 'Tasks',
    icon: CheckSquare,
    basePath: '/tasks',
    overview: 'Task management system. Tasks belong to folders, can be assigned to employees, have priorities and due dates. Powers the KDOps task board. There is no REST endpoint for tasks today — create and update them in the UI, and use webhooks to react to task activity.',
    access: 'All authenticated roles',
    restAvailable: false,
    webhookModule: 'Tasks',
    webhookExample: {
      event: 'task.created',
      code: platformWebhookEnvelope('task.created', {
        id: '5AtKPeE1X79TDi8XZKIZ96',
        title: 'Onboard new fleet driver',
        status: 'pending',
        assignee_id: '2aUyqjCzEIiEcYMKj7TZtx',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Task title/summary' },
      { name: 'description', type: 'string', required: false, description: 'Detailed description of the task' },
      { name: 'priority', type: 'string', required: false, description: '"low", "medium", "high", "urgent"' },
      { name: 'status', type: 'string', required: false, description: '"pending", "in_progress", "completed", "cancelled"' },
      { name: 'due_date', type: 'string', required: false, description: 'YYYY-MM-DD format' },
      { name: 'assignee_id', type: 'string', required: false, description: 'Employee ID to assign the task to' },
      { name: 'folder_id', type: 'string', required: false, description: 'Folder ID — required for task board display' },
    ],
    tips: [
      { text: 'Tasks need a folder to appear on the task board in the KDOps UI.' },
      { text: 'Assign a task to a specific employee from the Tasks page.' },
      { text: 'Subscribe to task.created, task.updated, task.completed, task.assigned, task.comment_added, and task.form_submitted to mirror task activity elsewhere (e.g. Slack, a spreadsheet).' },
      { text: 'task.form_submitted fires when someone submits a task form — a good hook for logging form responses to an external sheet.' },
    ],
    mistakes: [
      { text: 'Creating a task without a folder → it won\'t appear on any task board.' },
      { text: 'Using a priority or status value outside the app\'s fixed set ("low"/"medium"/"high"/"urgent"; "pending"/"in_progress"/"completed"/"cancelled").' },
      { text: 'Expecting a REST endpoint like POST /tasks or GET /tasks?due_date=tomorrow — neither exists. Create and query tasks in the KDOps UI, and use task.* webhooks to react to changes.' },
    ],
  },

  // ────────── LEAVES ──────────
  {
    id: 'leaves',
    name: 'Leaves',
    icon: CalendarDays,
    basePath: '/leaves',
    overview: 'Leave request management. Employees request leave, managers approve or reject. Tracks balances by leave type. There is no REST endpoint for leave requests or balances today — use the KDOps UI and webhooks instead.',
    access: 'All roles (own leaves); admin/super_admin (all leaves, approve/reject)',
    restAvailable: false,
    webhookModule: 'Leave',
    webhookExample: {
      event: 'leave.requested',
      code: platformWebhookEnvelope('leave.requested', {
        employee_id: '2aUyqjCzEIiEcYMKj7TZtx',
        leave_type: 'annual',
        start_date: '2026-10-01',
        end_date: '2026-10-05',
        days_requested: 5,
      }),
    },
    endpoints: [],
    fields: [
      { name: 'employee_id', type: 'string', required: true, description: 'ID of the employee requesting leave' },
      { name: 'leave_type', type: 'string', required: true, description: '"annual", "sick", "casual", "maternity", "paternity", "compassionate", "unpaid"' },
      { name: 'start_date', type: 'string', required: true, description: 'Leave start date in YYYY-MM-DD format' },
      { name: 'end_date', type: 'string', required: true, description: 'Leave end date in YYYY-MM-DD format' },
      { name: 'reason', type: 'string', required: false, description: 'Reason for the leave request' },
      { name: 'status', type: 'string', required: false, description: '"pending", "approved", "rejected" (defaults to pending)' },
      { name: 'reviewer_notes', type: 'string', required: false, description: 'Manager notes — especially important when rejecting' },
    ],
    tips: [
      { text: 'Check an employee\'s leave balance in the Leave page before approving a request.' },
      { text: 'Include reviewer_notes when rejecting — employees see this in their leave history.' },
      { text: 'Unpaid leave has no cap. All other types have annual allowances.' },
      { text: 'Subscribe to leave.requested, leave.approved, leave.rejected, and leave.cancelled to notify managers or sync a shared calendar.' },
    ],
    mistakes: [
      { text: 'Approving a request without checking the employee\'s remaining balance.' },
      { text: 'Rejecting without reviewer_notes → employee gets no explanation.' },
      { text: 'Looking for a REST endpoint like GET /leaves/balances — it doesn\'t exist. Balances are viewable in the KDOps UI, and leave.* webhooks tell you when a request changes state.' },
    ],
  },

  // ────────── EXPENSES ──────────
  {
    id: 'expenses',
    name: 'Expenses',
    icon: Receipt,
    basePath: '/expenses',
    overview: 'Expense tracking and approval. Employees submit expenses with receipts, managers approve or reject for reimbursement. There is no REST endpoint for expenses today — submit and review them in the KDOps UI, and use webhooks to react to status changes.',
    access: 'All roles (own expenses); admin/super_admin/finance (all expenses, approve)',
    restAvailable: false,
    webhookModule: 'Expenses',
    webhookExample: {
      event: 'expense.submitted',
      caption: 'Fields on this event depend on where the expense originates (e.g. the Expenses page vs. a fleet repair log) — this example is from a fleet repair expense.',
      code: platformWebhookEnvelope('expense.submitted', {
        id: '7FCo3z2SAxu3hR9uF5kxLE',
        category: 'repair',
        amount_ngn: 45000,
        description: 'Brake pad replacement — LAG-234-XY',
        status: 'pending',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Brief description of the expense' },
      { name: 'amount', type: 'number', required: true, description: 'Amount in NGN (Naira, not kobo). e.g., 15000 = ₦15,000' },
      { name: 'currency', type: 'string', required: false, description: 'Defaults to "NGN"' },
      { name: 'category', type: 'string', required: false, description: '"transport", "meals", "supplies", "accommodation", "training", "other"' },
      { name: 'description', type: 'string', required: false, description: 'Detailed description or justification' },
      { name: 'receipt_url', type: 'string', required: false, description: 'URL to uploaded receipt image/PDF' },
      { name: 'status', type: 'string', required: false, description: '"pending", "approved", "rejected" (defaults to pending)' },
    ],
    tips: [
      { text: 'Amount is in Naira, not kobo — ₦15,000 = 15000.' },
      { text: 'Attach a receipt for faster approval — expenses without receipts may be flagged.' },
      { text: 'Subscribe to expense.submitted, expense.approved, expense.rejected, and expense.reimbursed to notify finance or log activity to a spreadsheet.' },
    ],
    mistakes: [
      { text: 'Entering amount in kobo instead of Naira → ₦15,000 should be 15000, not 1500000.' },
      { text: 'Missing a receipt → expense may be flagged or delayed in approval.' },
      { text: 'Expecting GET /expenses or POST /expenses to work — there\'s no REST endpoint for expenses. Use the UI and expense.* webhooks.' },
    ],
  },

  // ────────── PAYROLL ──────────
  {
    id: 'payroll',
    name: 'Payroll',
    icon: Banknote,
    basePath: '/payroll',
    overview: 'Payroll runs, salary slips, and compensation data. Payroll runs are created and processed entirely inside the KDOps UI — there is no REST API, read or write, for payroll today. Use webhooks to know when a run starts, completes, or slips are generated.',
    access: 'admin, super_admin, finance',
    restAvailable: false,
    webhookModule: 'Payroll',
    webhookExample: {
      event: 'payroll.run_completed',
      code: platformWebhookEnvelope('payroll.run_completed', {
        run_id: 'pr-001',
        period: '2026-09',
        status: 'paid',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'id', type: 'string', required: false, description: 'Payroll run ID' },
      { name: 'month', type: 'string', required: false, description: 'YYYY-MM format (e.g., "2026-09")' },
      { name: 'status', type: 'string', required: false, description: '"draft", "processing", "completed", "failed"' },
      { name: 'total_gross', type: 'number', required: false, description: 'Total gross pay for all employees in NGN' },
      { name: 'total_deductions', type: 'number', required: false, description: 'Total deductions (tax, pension, NHF)' },
      { name: 'total_net', type: 'number', required: false, description: 'Total net pay after deductions' },
      { name: 'employee_count', type: 'number', required: false, description: 'Number of employees in this run' },
    ],
    tips: [
      { text: 'Payroll runs and payslips are only viewable inside the KDOps UI today — there is no read API.' },
      { text: 'Deductions include tax, pension, and NHF (National Housing Fund) where applicable.' },
      { text: 'Subscribe to payroll.run_started, payroll.run_completed, and payroll.slip_generated to trigger downstream work (e.g. notify finance) once a run finishes.' },
    ],
    mistakes: [
      { text: 'Looking for GET /payroll/runs or GET /payroll/runs/:id/slips — neither exists. There is no REST read access to payroll data.' },
      { text: 'Assuming payroll data can be exported automatically — today the only automated signal is the payroll.* webhooks; the underlying figures still have to be viewed or exported from the UI.' },
    ],
  },

  // ────────── FLEET ──────────
  {
    id: 'fleet',
    name: 'Fleet',
    icon: Truck,
    basePath: '/fleet',
    overview: 'Fleet management — vehicles, fuel requests, and trips. Track your vehicle fleet, manage fuel disbursements, and log trips with driver assignments. There is no REST endpoint for fleet data today — manage vehicles, fuel requests, and trips in the KDOps UI, and use webhooks to react to changes.',
    access: 'All roles (own requests); admin/super_admin/operations (all fleet data)',
    restAvailable: false,
    webhookModule: 'Fleet',
    warnings: [
      { text: 'BANK DETAILS REQUIRED: Fuel request disbursements ONLY work if the requesting employee has valid bank details on file (bank_name, account_number, account_name). Without bank details, the fuel request will be created but payment CANNOT be processed. Always ensure employees update their bank details in their profile BEFORE making fuel or trip requests. This applies however the request is created — there is no REST endpoint to create one via automation, but if you\'re building a webhook-driven workflow around fuel requests, verify bank details are in place before expecting a disbursement to succeed.' },
    ],
    webhookExample: {
      event: 'fuel_request.approved',
      code: platformWebhookEnvelope('fuel_request.approved', {
        id: 'fr-001',
        employee_name: 'Chioma Okafor',
        amount_ngn: 30000,
        status: 'approved',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'plate_number', type: 'string', required: true, description: 'Vehicle plate number (e.g., "LAG-234-XY")' },
      { name: 'make', type: 'string', required: false, description: 'Vehicle manufacturer (e.g., "Toyota")' },
      { name: 'model', type: 'string', required: false, description: 'Vehicle model (e.g., "Hilux")' },
      { name: 'year', type: 'number', required: false, description: 'Year of manufacture' },
      { name: 'vehicle_id', type: 'string', required: true, description: '(Fuel/Trips) Vehicle ID' },
      { name: 'amount', type: 'number', required: true, description: '(Fuel) Amount in NGN' },
      { name: 'litres', type: 'number', required: false, description: '(Fuel) Litres of fuel' },
      { name: 'station', type: 'string', required: false, description: '(Fuel) Fuel station name and location' },
      { name: 'driver_id', type: 'string', required: true, description: '(Trips) Employee ID of the driver' },
      { name: 'start_location', type: 'string', required: true, description: '(Trips) Trip origin' },
      { name: 'end_location', type: 'string', required: true, description: '(Trips) Trip destination' },
      { name: 'distance_km', type: 'number', required: false, description: '(Trips) Distance in kilometers' },
      { name: 'purpose', type: 'string', required: false, description: '(Trips) Purpose of the trip' },
    ],
    tips: [
      { text: 'Always confirm a vehicle exists before logging a fuel request or trip against it.' },
      { text: 'driver_id must reference a valid employee.' },
      { text: 'Trip distance helps with fuel efficiency reporting and cost analysis.' },
      { text: 'Subscribe to fuel_request.created, fuel_request.approved, fuel_request.rejected, trip.logged, trip.completed, and vehicle.added to build fleet dashboards or notify drivers (e.g. SMS on approval).' },
    ],
    mistakes: [
      { text: 'An employee without bank details requesting fuel → the request is created but payment CANNOT be processed.' },
      { text: 'Forgetting to log trips → fleet utilization reports will be inaccurate.' },
      { text: 'Expecting GET /fleet/trips or POST /fleet/fuel-requests to work — there\'s no REST endpoint for fleet data. Use the UI and fleet webhooks.' },
    ],
  },

  // ────────── INVOICES ──────────
  {
    id: 'invoices',
    name: 'Invoices',
    icon: FileText,
    basePath: '/invoices',
    overview: 'Client invoicing. Create, track, and manage invoices with line items, VAT calculation, and payment status tracking. There is no REST endpoint for invoices today — create and manage them in the KDOps UI, and use webhooks to track status changes.',
    access: 'admin, super_admin, finance',
    restAvailable: false,
    webhookModule: 'Invoices',
    webhookExample: {
      event: 'invoice.sent',
      code: platformWebhookEnvelope('invoice.sent', {
        id: 'inv-001',
        invoice_number: 'INV-2026-001',
        status: 'sent',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'client_id', type: 'string', required: true, description: 'Client ID (must exist in Clients)' },
      { name: 'items', type: 'array', required: true, description: 'Array of { description: string, amount: number } line items' },
      { name: 'due_date', type: 'string', required: false, description: 'Payment due date in YYYY-MM-DD' },
      { name: 'vat_rate', type: 'number', required: false, description: 'VAT percentage (e.g., 7.5 means 7.5%)' },
      { name: 'notes', type: 'string', required: false, description: 'Additional notes shown on the invoice' },
      { name: 'status', type: 'string', required: false, description: '"draft", "sent", "paid", "overdue"' },
    ],
    tips: [
      { text: 'Create the client first — invoices are linked to a client record.' },
      { text: 'Items is an array — each item needs both description and amount.' },
      { text: 'VAT is a percentage: 7.5 means 7.5%.' },
      { text: 'Status flow: draft → sent → paid / overdue.' },
      { text: 'Subscribe to invoice.created, invoice.sent, and invoice.paid to keep a Google Sheet or CRM updated with invoice status.' },
    ],
    mistakes: [
      { text: 'Creating an invoice before the client exists — create the client first.' },
      { text: 'Setting vat_rate as a decimal (0.075) instead of a percentage (7.5).' },
      { text: 'Expecting POST /invoices to work — there\'s no REST endpoint for invoices. Create them in the UI and track status changes via invoice.* webhooks.' },
    ],
  },

  // ────────── CLIENTS ──────────
  {
    id: 'clients',
    name: 'Clients',
    icon: Building2,
    basePath: '/clients',
    overview: 'Client and company directory. Clients are linked to invoices and placements. Create clients here before referencing them in invoices. There is no REST endpoint for clients today — manage them in the KDOps UI and use webhooks to sync elsewhere.',
    access: 'admin, super_admin, finance',
    restAvailable: false,
    webhookModule: 'Clients',
    webhookExample: {
      event: 'client.created',
      code: platformWebhookEnvelope('client.created', {
        name: 'MTN Nigeria',
        industry: 'Telecommunications',
        status: 'active',
        contract_value_ngn: 15000000,
      }),
    },
    endpoints: [],
    fields: [
      { name: 'name', type: 'string', required: true, description: 'Company or client name' },
      { name: 'industry', type: 'string', required: false, description: 'Industry sector (e.g., "Manufacturing", "Telecom", "Oil & Gas")' },
      { name: 'contact_person', type: 'string', required: false, description: 'Primary contact name at the client' },
      { name: 'contact_email', type: 'string', required: false, description: 'Contact email address' },
      { name: 'phone', type: 'string', required: false, description: 'Contact phone number' },
      { name: 'contract_value', type: 'number', required: false, description: 'Total contract value in NGN' },
      { name: 'status', type: 'string', required: false, description: '"active", "inactive"' },
    ],
    tips: [
      { text: 'Create clients before creating invoices — invoices require a valid client_id.' },
      { text: 'Use contract_value to track total engagement value for reporting.' },
      { text: 'Subscribe to client.created, client.updated, and client.deleted to sync your client directory into a CRM.' },
    ],
    mistakes: [
      { text: 'Trying to create an invoice with a client that doesn\'t exist yet — create the client first.' },
      { text: 'Expecting GET or POST /clients to work — there\'s no REST endpoint for clients. Manage them in the UI and use client.* webhooks to sync elsewhere.' },
    ],
  },

  // ────────── RECRUITMENT ──────────
  {
    id: 'recruitment',
    name: 'Recruitment',
    icon: UserPlus,
    basePath: '/recruitment',
    overview: 'Job openings and applicant tracking. Create job openings, track applicants through pipeline stages from new to hired/rejected. There is no REST endpoint for recruitment data today — manage openings and applicants in the KDOps UI, and use webhooks to react to pipeline changes.',
    access: 'admin, super_admin (read openings: all roles)',
    restAvailable: false,
    webhookModule: 'Recruitment',
    webhookExample: {
      event: 'applicant.hired',
      code: platformWebhookEnvelope('applicant.hired', {
        id: 'app-001',
        full_name: 'Oluwaseun Adebayo',
        email: 'seun@email.com',
        job_title: 'Senior Backend Engineer',
        start_date: '2026-10-01',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Job title (e.g., "Senior Backend Engineer")' },
      { name: 'department', type: 'string', required: false, description: 'Department the role belongs to' },
      { name: 'employment_type', type: 'string', required: false, description: '"full_time", "part_time", "contract"' },
      { name: 'salary_min', type: 'number', required: false, description: 'Minimum salary in NGN' },
      { name: 'salary_max', type: 'number', required: false, description: 'Maximum salary in NGN' },
      { name: 'closing_date', type: 'string', required: false, description: 'Application deadline in YYYY-MM-DD' },
      { name: 'stage', type: 'string', required: false, description: '(Applicants) "new", "screening", "interview_1", "interview_2", "offer", "hired", "rejected"' },
      { name: 'rejection_reason', type: 'string', required: false, description: '(Applicants) Reason when stage is "rejected"' },
    ],
    tips: [
      { text: 'Stages represent the hiring pipeline: new → screening → interview_1 → interview_2 → offer → hired.' },
      { text: 'Record a rejection reason when moving an applicant to "rejected" — helps with reporting.' },
      { text: 'Subscribe to opening.created, opening.closed, applicant.created, applicant.stage_changed, applicant.hired, and applicant.rejected to notify a hiring channel or update an external ATS.' },
    ],
    mistakes: [
      { text: 'Rejecting an applicant without a reason → no audit trail for why they were rejected.' },
      { text: 'Expecting GET /recruitment/openings or /recruitment/applicants to work — there\'s no REST endpoint for recruitment. Use the UI and recruitment webhooks.' },
    ],
  },

  // ────────── DATABASE ──────────
  {
    id: 'data',
    name: 'Database',
    icon: Database,
    basePath: '/bases',
    overview: 'Custom database tables (Airtable-compatible). Create bases, tables, and records programmatically. Features smart type detection and auto-column creation for unknown fields. This is the only module with a real, working REST API — everything below is verified directly against the rest-api edge function.',
    access: 'All authenticated roles (scopes: records:read, records:write, data:delete, schema:read, schema:write)',
    restAvailable: true,
    endpoints: [
      {
        method: 'GET',
        path: '/bases',
        description: 'List all bases in the workspace. Requires the schema:read scope.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/bases"`,
        responseExample: JSON.stringify({
          bases: [
            { id: "4v7SY1Hl7YZtWCGClC5boe", name: "CRM", slug: "crm", icon: null, color: null, table_count: 4 },
            { id: "5RK81pyPjBY4UNGoLLsvuU", name: "Inventory", slug: "inventory", icon: null, color: null, table_count: 2 }
          ]
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/bases/:baseId/tables',
        description: 'List tables in a base, including each table\'s fields. Requires the schema:read scope.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables"`,
        responseExample: JSON.stringify({
          tables: [
            {
              id: "5xWnVe2a1BULyA7Ojyf47Q",
              name: "Companies",
              slug: "companies",
              pg_table_name: "companies",
              fields: [
                { id: "5UzKVmJnqCxinPpbNYH7ys", name: "Company", type: "SingleLineText", pg_column_name: "company", pg_type: "TEXT", is_system: false, is_hidden: false },
                { id: "61gKJ2fC9ExXjJt3rQ9PVS", name: "Revenue", type: "Number", pg_column_name: "revenue", pg_type: "NUMERIC", is_system: false, is_hidden: false }
              ]
            }
          ]
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/bases/:baseId/tables/:tableId/records',
        description: 'List records in a table. Supports pagination (pageSize, offset), sorting, and filtering. Requires the records:read scope.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/records?pageSize=20&sort=Revenue:desc"`,
        responseExample: JSON.stringify({
          records: [{
            id: "6vwIYHf2g0uYfEeDFRIaL6",
            createdTime: "2026-06-15T09:00:00Z",
            fields: {
              Company: "Dangote Industries",
              Revenue: 5000000000,
              Industry: "Manufacturing",
              Website: "https://dangote.com",
              "Contact Email": "info@dangote.com"
            }
          }],
          offset: "121"
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/bases/:baseId/tables/:tableId/records/:recordId',
        description: 'Get a single record by its short ID. Requires the records:read scope. Returns the record directly — not wrapped in a "records" array.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/records/6vwIYHf2g0uYfEeDFRIaL6"`,
        responseExample: JSON.stringify({
          id: "6vwIYHf2g0uYfEeDFRIaL6",
          createdTime: "2026-06-15T09:00:00Z",
          fields: {
            Company: "Dangote Industries",
            Revenue: 5000000000
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/bases/:baseId/tables/:tableId/records',
        description: 'Create records (max 10 per request). Unknown field names auto-create new columns. Requires the records:write scope. Returns 201 on success.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      { "fields": { "Company": "Dangote Industries", "Revenue": 5000000000, "Industry": "Manufacturing" } },
      { "fields": { "Company": "MTN Nigeria", "Revenue": 2000000000, "Industry": "Telecom" } }
    ]
  }' \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/records"`,
        responseExample: JSON.stringify({
          records: [
            { id: "7SdILXzL92vybiIDkJBiuG", createdTime: "2026-09-09T10:00:00Z", fields: { Company: "Dangote Industries", Revenue: 5000000000, Industry: "Manufacturing" } },
            { id: "4yKFAr3oW6z5YVmJx7xwrI", createdTime: "2026-09-09T10:00:00Z", fields: { Company: "MTN Nigeria", Revenue: 2000000000, Industry: "Telecom" } }
          ]
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/bases/:baseId/tables/:tableId/records',
        description: 'Update existing records. Each record needs its id. Requires the records:write scope.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      { "id": "7SdILXzL92vybiIDkJBiuG", "fields": { "Revenue": 5500000000, "Industry": "Conglomerate" } }
    ]
  }' \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/records"`,
        responseExample: JSON.stringify({
          records: [
            { id: "7SdILXzL92vybiIDkJBiuG", createdTime: "2026-06-15T09:00:00Z", fields: { Company: "Dangote Industries", Revenue: 5500000000, Industry: "Conglomerate" } }
          ]
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/bases/:baseId/tables/:tableId/records',
        description: 'Delete records by ID (max 10 per request). Accepts IDs via body { "records": [...] } or query params ?records[]=. Requires records:write, or the standalone data:delete / *:delete scope.',
        curlExample: `curl -X DELETE \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"records": ["7SdILXzL92vybiIDkJBiuG", "4yKFAr3oW6z5YVmJx7xwrI"]}' \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/records"`,
        responseExample: JSON.stringify({
          records: [
            { id: "7SdILXzL92vybiIDkJBiuG", deleted: true },
            { id: "4yKFAr3oW6z5YVmJx7xwrI", deleted: true }
          ]
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/bases/:baseId/tables/:tableId/fields',
        description: 'List all fields (columns) in a table with full schema metadata. Requires the schema:read scope. Note the type key here is "ui_type" — the tables-list endpoint above aliases the same value to "type" instead.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/fields"`,
        responseExample: JSON.stringify({
          fields: [
            {
              id: "5UzKVmJnqCxinPpbNYH7ys", name: "Company", pg_column_name: "company",
              ui_type: "SingleLineText", pg_type: "TEXT", options: {}, position: 1, width: 180,
              is_primary: true, is_required: false, is_unique: false, is_system: false, is_hidden: false, description: null
            },
            {
              id: "61gKJ2fC9ExXjJt3rQ9PVS", name: "Revenue", pg_column_name: "revenue",
              ui_type: "Number", pg_type: "NUMERIC", options: {}, position: 2, width: 180,
              is_primary: false, is_required: false, is_unique: false, is_system: false, is_hidden: false, description: null
            }
          ]
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/bases/:baseId/tables/:tableId/fields',
        description: 'Create a new field (column) on a table. Requires the schema:write scope. "type" must be one of the supported ui types (e.g. SingleLineText, LongText, Email, Number, Decimal, Currency, Date, DateTime, SingleSelect, MultiSelect, Checkbox, JSON).',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Contact Email",
    "type": "Email",
    "description": "Primary contact email"
  }' \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/fields"`,
        responseExample: JSON.stringify({
          field: {
            id: "6z4MXcX3pP28bUYyFALOZM", name: "Contact Email", pg_column_name: "contact_email",
            ui_type: "Email", pg_type: "TEXT", options: {}, position: 3, width: 180,
            is_primary: false, is_required: false, is_unique: false, is_system: false, is_hidden: false,
            description: "Primary contact email"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/bases/:baseId/tables/:tableId/fields/:fieldId',
        description: 'Rename a field or update its description/options. Requires the schema:write scope. The field\'s type cannot be changed this way.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Company Email"}' \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/fields/6z4MXcX3pP28bUYyFALOZM"`,
        responseExample: JSON.stringify({
          field: {
            id: "6z4MXcX3pP28bUYyFALOZM", name: "Company Email", pg_column_name: "contact_email",
            ui_type: "Email", pg_type: "TEXT", options: {}, position: 3, width: 180,
            is_primary: false, is_required: false, is_unique: false, is_system: false, is_hidden: false,
            description: "Primary contact email"
          }
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/bases/:baseId/tables/:tableId/fields/:fieldId',
        description: 'Delete a field and drop its column. Requires the schema:write scope. System fields and the table\'s primary field cannot be deleted.',
        curlExample: `curl -X DELETE \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/bases/4v7SY1Hl7YZtWCGClC5boe/tables/5xWnVe2a1BULyA7Ojyf47Q/fields/6z4MXcX3pP28bUYyFALOZM"`,
        responseExample: JSON.stringify({
          field: { id: "6z4MXcX3pP28bUYyFALOZM", deleted: true }
        }, null, 2),
      },
    ],
    fields: [
      { name: 'records', type: 'array', required: true, description: 'Array of record objects. Each has a "fields" object with column names as keys.' },
      { name: 'fields', type: 'object', required: true, description: 'Key-value pairs where key = column name (display name), value = cell value' },
      { name: 'id', type: 'string', required: false, description: 'Record ID (required for PATCH/DELETE, auto-generated on POST)' },
      { name: 'pageSize', type: 'number', required: false, description: 'Records per page (query param, default 100, max 1000)' },
      { name: 'offset', type: 'string', required: false, description: 'Cursor-based pagination token returned in previous response' },
      { name: 'sort', type: 'string', required: false, description: 'Sort by field: "FieldName:asc" or "FieldName:desc" (query param, repeatable)' },
      { name: 'filter', type: 'string', required: false, description: 'Filter records: "fieldName op value" — ops: eq, neq, gt, gte, lt, lte, contains (query param, repeatable)' },
    ],
    tips: [
      { text: 'Unknown field names in POST/PATCH auto-create new columns with smart type detection.' },
      { text: 'Smart type detection: emails become Email fields, URLs become URL fields, dates and numbers are auto-typed.' },
      { text: 'Records use a "fields" wrapper: { "records": [{ "fields": { "Name": "value" } }] }' },
      { text: 'Maximum 10 records per POST/PATCH/DELETE request. Batch larger operations into multiple requests.' },
      { text: 'Sort with query params: ?sort=Revenue:desc — repeatable for multi-field sorting.' },
      { text: 'Filter with query params: ?filter=Industry eq Manufacturing' },
      { text: 'Pagination is cursor-based: pass the "offset" from the response to get the next page.' },
      { text: 'Use pageSize to control batch size (default 100, max 1000).' },
      { text: 'Scopes are checked per-operation: records:read for GET, records:write for POST/PATCH (and DELETE, or the standalone data:delete/*:delete), schema:read for listing bases/tables/fields, schema:write for creating/editing/deleting fields.' },
    ],
    mistakes: [
      { text: 'Forgetting the "fields" wrapper → { "Company": "X" } won\'t work. Use { "fields": { "Company": "X" } }.' },
      { text: 'Sending more than 10 records in one request → returns 422 Unprocessable, not 400. Batch into groups of 10.' },
      { text: 'Using field IDs instead of display names → use human-readable column names like "Company", not IDs.' },
      { text: 'Forgetting record ID in PATCH → each record object needs its "id" for updates.' },
      { text: 'Using page/per_page instead of pageSize/offset → pagination is cursor-based, not page-number-based.' },
      { text: 'Assuming GET .../fields returns a "type" key like the tables endpoint does — the dedicated fields endpoint returns "ui_type" instead.' },
    ],
  },

  // ────────── PAYMENT BATCHES ──────────
  {
    id: 'payment-batches',
    name: 'Payment Batches',
    icon: CreditCard,
    basePath: '/payment-batches',
    overview: 'Bulk payment processing. Create batches of payments to multiple recipients — employees, contractors, or vendors. All recipients must have valid bank details on file. There is no REST endpoint for payment batches today — create and approve them in the KDOps UI, and use webhooks to track disbursement status.',
    access: 'admin, super_admin, finance',
    restAvailable: false,
    webhookModule: 'Payments',
    warnings: [
      { text: 'All recipients MUST have valid bank details on file (bank_name, account_number, account_name). Payments to recipients without bank details will be SKIPPED silently. Verify bank details before creating payment batches.' },
    ],
    webhookExample: {
      event: 'batch.approved',
      code: platformWebhookEnvelope('batch.approved', {
        id: 'pb-013',
        name: 'October contractor payments',
        total_amount: 750000,
        beneficiary_count: 3,
        status: 'approved',
      }),
    },
    endpoints: [],
    fields: [
      { name: 'description', type: 'string', required: false, description: 'Description of the payment batch' },
      { name: 'payments', type: 'array', required: true, description: 'Array of { recipient_id, amount, narration }' },
      { name: 'recipient_id', type: 'string', required: true, description: 'Employee or contractor ID' },
      { name: 'amount', type: 'number', required: true, description: 'Payment amount in NGN' },
      { name: 'narration', type: 'string', required: false, description: 'Payment description/narration shown to recipient' },
    ],
    tips: [
      { text: 'Verify all recipients have bank details before creating a batch to avoid skipped payments.' },
      { text: 'Narration appears on the recipient\'s bank statement — make it descriptive.' },
      { text: 'Subscribe to batch.created, batch.approved, batch.processed, payment.completed, payment.failed, and payment.pending to track disbursement status in real time.' },
    ],
    mistakes: [
      { text: 'A recipient without bank details → their payment is silently skipped.' },
      { text: 'Not checking batch results → you won\'t know which payments were skipped or failed.' },
      { text: 'Expecting POST /payment-batches to work — there\'s no REST endpoint for payment batches. Create and approve them in the UI, and track outcomes via the payment.* and batch.* webhooks.' },
    ],
  },
];

/* ─── Component ─── */

export default function ModuleGuides() {
  const [activeModuleId, setActiveModuleId] = useState(modules[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mainRef = useRef<HTMLDivElement>(null);

  const activeModule = useMemo(
    () => modules.find(m => m.id === activeModuleId) ?? modules[0],
    [activeModuleId],
  );

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modules;
    const q = searchQuery.toLowerCase();
    return modules.filter(
      m => m.name.toLowerCase().includes(q) || m.basePath.toLowerCase().includes(q) || m.overview.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Scroll to top of main content when module changes
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeModuleId]);

  return (
    <div className="flex h-full min-h-0">
      {/* ─── Left Sidebar ─── */}
      <div className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-700/80 flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-700/80">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search modules..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {filteredModules.map(mod => {
              const Icon = mod.icon;
              const isActive = mod.id === activeModuleId;
              return (
                <button
                  key={mod.id}
                  onClick={() => setActiveModuleId(mod.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60',
                  )}
                >
                  <Icon size={15} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'} />
                  <span className="truncate">{mod.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-auto text-3xs px-1.5 py-0 shrink-0',
                      mod.restAvailable
                        ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'
                        : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
                    )}
                  >
                    {mod.restAvailable ? 'REST' : 'Webhooks only'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ─── Main Content ─── */}
      <div ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-8">
          <ModuleContent module={activeModule} />
        </div>
      </div>
    </div>
  );
}

/* ─── Module Content Renderer ─── */

function ModuleContent({ module: mod }: { module: ModuleDef }) {
  const Icon = mod.icon;
  const webhookGroup = mod.webhookModule ? EVENT_GROUPS.find(g => g.module === mod.webhookModule) : undefined;

  return (
    <>
      {/* Overview Card */}
      <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/20">
              <Icon size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{mod.name}</h2>
              {mod.restAvailable ? (
                <code className="text-xs text-blue-100 font-mono">{API_BASE}{mod.basePath}</code>
              ) : (
                <span className="text-xs text-blue-100/90 font-medium">Not available via REST API — see Webhooks below</span>
              )}
            </div>
          </div>
        </div>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{mod.overview}</p>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Access:</span>
            <span>{mod.access}</span>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {mod.warnings?.map((w, i) => (
        <div key={i} className="flex gap-3 p-4 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-warning/10/40">
          <AlertTriangle size={18} className="shrink-0 text-warning mt-0.5" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 leading-relaxed">{w.text}</p>
        </div>
      ))}

      {mod.restAvailable ? (
        <>
          {/* Endpoints Table */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
              <ExternalLink size={14} />
              Available Endpoints
            </h3>
            <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-200 dark:border-zinc-700/80">
                    <TableHead className="text-xs w-20">Method</TableHead>
                    <TableHead className="text-xs">Path</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mod.endpoints.map((ep, i) => (
                    <TableRow key={i} className="border-zinc-200 dark:border-zinc-700/80">
                      <TableCell>
                        <Badge className={cn('text-3xs font-bold', methodColors[ep.method])}>{ep.method}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{ep.path}</TableCell>
                      <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">{ep.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </Card>
          </section>

          {/* Field Reference */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
              <Info size={14} />
              Field Reference
            </h3>
            <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-200 dark:border-zinc-700/80">
                      <TableHead className="text-xs">Field</TableHead>
                      <TableHead className="text-xs w-28">Type</TableHead>
                      <TableHead className="text-xs w-20">Required</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mod.fields.map((f, i) => (
                      <TableRow key={i} className="border-zinc-200 dark:border-zinc-700/80">
                        <TableCell className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">{f.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-3xs font-mono">{f.type}</Badge>
                        </TableCell>
                        <TableCell>
                          {f.required ? (
                            <Badge className="text-3xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Yes</Badge>
                          ) : (
                            <span className="text-3xs text-zinc-400">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">{f.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </section>

          {/* Examples */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
              <ChevronRight size={14} />
              Full Examples
            </h3>
            <div className="space-y-6">
              {mod.endpoints.map((ep, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className={cn('text-3xs font-bold', methodColors[ep.method])}>{ep.method}</Badge>
                    <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{ep.path}</code>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">— {ep.description}</span>
                  </div>
                  <CodeBlock label="cURL Request" code={ep.curlExample} />
                  <CodeBlock label="Response" code={ep.responseExample} />
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          {/* No REST endpoint callout */}
          <section>
            <Card className="border-amber-200 dark:border-amber-800/60 bg-warning/10/30">
              <CardContent className="p-4 flex gap-3">
                <Info size={18} className="shrink-0 text-warning mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed space-y-1.5">
                  <p className="font-semibold">No REST endpoint for {mod.name}</p>
                  <p>
                    {mod.name} data isn't exposed through the KDOps REST API today — there's no route to list, create, or
                    update these records by request. The only working REST surface is the generic Database API
                    (<code className="text-xs font-mono">/v1/bases/:baseId/tables/:tableId/records</code>), which
                    operates on custom tables you build yourself, not on this module's built-in data.
                  </p>
                  <p>Manage {mod.name.toLowerCase()} in the KDOps UI, and subscribe to the webhook events below to react to changes in real time.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Webhook Events */}
          {webhookGroup && (
            <section>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                <Webhook size={14} />
                Webhook Events
              </h3>
              <Card className="border-zinc-200 dark:border-zinc-700/80">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {webhookGroup.events.map(e => (
                      <Badge key={e} variant="outline" className={cn('text-2xs font-mono border', eventColor(e))}>
                        {e}
                      </Badge>
                    ))}
                  </div>
                  {mod.webhookExample && (
                    <div className="space-y-1.5">
                      {mod.webhookExample.caption && (
                        <p className="text-2xs text-zinc-500 dark:text-zinc-400">{mod.webhookExample.caption}</p>
                      )}
                      <CodeBlock label={`Delivered payload — ${mod.webhookExample.event}`} code={mod.webhookExample.code} />
                    </div>
                  )}
                  <p className="text-2xs text-zinc-500 dark:text-zinc-400">
                    Configure a webhook for these events from the <strong>Webhooks</strong> tab in this Developer Hub.
                  </p>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Field Reference */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
              <Info size={14} />
              Field Reference
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 leading-relaxed">
              Reference only — there's no REST endpoint to fetch this schema. A webhook payload for this module typically
              includes only a subset of these fields (see the example above).
            </p>
            <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-200 dark:border-zinc-700/80">
                      <TableHead className="text-xs">Field</TableHead>
                      <TableHead className="text-xs w-28">Type</TableHead>
                      <TableHead className="text-xs w-20">Required</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mod.fields.map((f, i) => (
                      <TableRow key={i} className="border-zinc-200 dark:border-zinc-700/80">
                        <TableCell className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">{f.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-3xs font-mono">{f.type}</Badge>
                        </TableCell>
                        <TableCell>
                          {f.required ? (
                            <Badge className="text-3xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Yes</Badge>
                          ) : (
                            <span className="text-3xs text-zinc-400">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">{f.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </section>
        </>
      )}

      {/* Tips */}
      <section>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Lightbulb size={14} className="text-blue-500" />
          Tips & Best Practices
        </h3>
        <div className="space-y-2">
          {mod.tips.map((t, i) => (
            <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
              <Lightbulb size={14} className="shrink-0 text-blue-500 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Common Mistakes */}
      <section>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500" />
          Common Mistakes
        </h3>
        <div className="space-y-2">
          {mod.mistakes.map((m, i) => (
            <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-warning/10/30 border border-warning/20/50">
              <AlertTriangle size={14} className="shrink-0 text-amber-500 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{m.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
