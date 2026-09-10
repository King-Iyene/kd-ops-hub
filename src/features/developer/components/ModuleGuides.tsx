import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, CheckSquare, CalendarDays, Receipt, Banknote,
  Truck, FileText, Building2, UserPlus, Database, CreditCard,
  Copy, Check, ChevronRight, AlertTriangle, Lightbulb, Info,
  ExternalLink, ChevronDown, Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/* ─── Constants ─── */

const API_BASE = 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/platform-api/v1';

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

interface ModuleDef {
  id: string;
  name: string;
  icon: React.ElementType;
  basePath: string;
  overview: string;
  access: string;
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
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
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

/* ─── Module Data ─── */

const modules: ModuleDef[] = [
  // ────────── EMPLOYEES ──────────
  {
    id: 'employees',
    name: 'Employees',
    icon: Users,
    basePath: '/employees',
    overview: 'Manage all employees. Employees are the core entity in KDOps — linked to tasks, leave, payroll, expenses, and fleet. Every person on your team starts here.',
    access: 'admin, super_admin (read: all roles)',
    endpoints: [
      {
        method: 'GET',
        path: '/employees',
        description: 'List all employees (paginated). Supports filtering by department, role, status.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/employees?page=1&per_page=10&department=Engineering"`,
        responseExample: JSON.stringify({
          data: [{
            id: "550e8400-e29b-41d4-a716-446655440001",
            first_name: "Chioma",
            last_name: "Okafor",
            email: "chioma@kdsquares.com",
            department: "Engineering",
            role: "operations",
            status: "active",
            salary: 450000,
            bank_name: "Access Bank",
            created_at: "2026-01-15T09:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 45 }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/employees/:id',
        description: 'Get a single employee by UUID. Returns all fields including bank details.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/employees/550e8400-e29b-41d4-a716-446655440001"`,
        responseExample: JSON.stringify({
          data: {
            id: "550e8400-e29b-41d4-a716-446655440001",
            first_name: "Chioma",
            last_name: "Okafor",
            email: "chioma@kdsquares.com",
            phone: "+2348012345678",
            department: "Engineering",
            role: "operations",
            employment_type: "full_time",
            start_date: "2026-01-15",
            salary: 450000,
            bank_name: "Access Bank",
            account_number: "0123456789",
            account_name: "Chioma Okafor",
            status: "active",
            created_at: "2026-01-15T09:00:00Z",
            updated_at: "2026-06-01T12:30:00Z"
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/employees',
        description: 'Create a new employee. Email must be unique across all employees.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "first_name": "Emeka",
    "last_name": "Nwosu",
    "email": "emeka@kdsquares.com",
    "phone": "+2348012345678",
    "department": "Operations",
    "role": "field_staff",
    "employment_type": "full_time",
    "salary": 350000,
    "bank_name": "GTBank",
    "account_number": "0123456789",
    "account_name": "Emeka Nwosu"
  }' \\
  "${API_BASE}/employees"`,
        responseExample: JSON.stringify({
          data: {
            id: "660e8400-e29b-41d4-a716-446655440099",
            first_name: "Emeka",
            last_name: "Nwosu",
            email: "emeka@kdsquares.com",
            phone: "+2348012345678",
            department: "Operations",
            role: "field_staff",
            employment_type: "full_time",
            salary: 350000,
            bank_name: "GTBank",
            account_number: "0123456789",
            account_name: "Emeka Nwosu",
            status: "active",
            start_date: "2026-09-09",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/employees/:id',
        description: 'Update employee fields. Only send the fields you want to change.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"salary": 500000, "department": "Engineering"}' \\
  "${API_BASE}/employees/550e8400-e29b-41d4-a716-446655440001"`,
        responseExample: JSON.stringify({
          data: {
            id: "550e8400-e29b-41d4-a716-446655440001",
            first_name: "Chioma",
            last_name: "Okafor",
            salary: 500000,
            department: "Engineering",
            updated_at: "2026-09-09T11:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/employees/:id',
        description: 'Soft-delete an employee. Sets status to "inactive". Employee data is preserved for audit trail.',
        curlExample: `curl -X DELETE \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/employees/550e8400-e29b-41d4-a716-446655440001"`,
        responseExample: JSON.stringify({
          message: "Employee soft-deleted successfully",
          data: { id: "550e8400-e29b-41d4-a716-446655440001", status: "inactive" }
        }, null, 2),
      },
    ],
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
      { text: 'Always include bank details (bank_name, account_number, account_name) when creating employees who will receive payroll or disbursements.' },
      { text: 'Email must be unique — you\'ll get a 409 Conflict if it already exists.' },
      { text: 'Role determines what the employee can see and do in KDOps — choose carefully.' },
      { text: 'Use the department filter to quickly list employees by team: ?department=Engineering' },
      { text: 'Soft-deleted employees (status: inactive) can be reactivated with a PATCH setting status back to "active".' },
    ],
    mistakes: [
      { text: 'Forgetting bank_name, account_number, account_name → payroll and disbursements won\'t process for this employee.' },
      { text: 'Using wrong role value → must be exactly one of: super_admin, admin, finance, operations, field_staff.' },
      { text: 'Not setting start_date → defaults to today, which may not be correct for backdated hires.' },
      { text: 'Sending a duplicate email → returns 409 Conflict. Check existing employees first.' },
    ],
  },

  // ────────── CONTRACTORS ──────────
  {
    id: 'contractors',
    name: 'Contractors',
    icon: UserCheck,
    basePath: '/contractors',
    overview: 'Manage contractors and freelancers. Similar to employees but for non-permanent staff. Contractors have their own directory, separate from employees, with rate-based compensation.',
    access: 'admin, super_admin (read: all roles)',
    endpoints: [
      {
        method: 'GET',
        path: '/contractors',
        description: 'List all contractors (paginated). Supports filtering by status and company.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/contractors?page=1&per_page=10&status=active"`,
        responseExample: JSON.stringify({
          data: [{
            id: "770e8400-e29b-41d4-a716-446655440010",
            first_name: "Tunde",
            last_name: "Adeyemi",
            email: "tunde@freelance.ng",
            company: "Adeyemi Consulting",
            rate: 25000,
            rate_type: "daily",
            status: "active",
            bank_name: "Zenith Bank",
            created_at: "2026-03-01T08:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 12 }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/contractors/:id',
        description: 'Get a single contractor by UUID.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/contractors/770e8400-e29b-41d4-a716-446655440010"`,
        responseExample: JSON.stringify({
          data: {
            id: "770e8400-e29b-41d4-a716-446655440010",
            first_name: "Tunde",
            last_name: "Adeyemi",
            email: "tunde@freelance.ng",
            phone: "+2348098765432",
            company: "Adeyemi Consulting",
            rate: 25000,
            rate_type: "daily",
            bank_name: "Zenith Bank",
            account_number: "2012345678",
            account_name: "Tunde Adeyemi",
            status: "active",
            created_at: "2026-03-01T08:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/contractors',
        description: 'Create a new contractor.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "first_name": "Aisha",
    "last_name": "Ibrahim",
    "email": "aisha@designstudio.ng",
    "phone": "+2349011223344",
    "company": "Ibrahim Design Studio",
    "rate": 150000,
    "rate_type": "monthly",
    "bank_name": "UBA",
    "account_number": "3012345678",
    "account_name": "Aisha Ibrahim"
  }' \\
  "${API_BASE}/contractors"`,
        responseExample: JSON.stringify({
          data: {
            id: "880e8400-e29b-41d4-a716-446655440020",
            first_name: "Aisha",
            last_name: "Ibrahim",
            email: "aisha@designstudio.ng",
            company: "Ibrahim Design Studio",
            rate: 150000,
            rate_type: "monthly",
            status: "active",
            created_at: "2026-09-09T10:30:00Z"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/contractors/:id',
        description: 'Update contractor fields.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"rate": 30000, "rate_type": "daily"}' \\
  "${API_BASE}/contractors/770e8400-e29b-41d4-a716-446655440010"`,
        responseExample: JSON.stringify({
          data: {
            id: "770e8400-e29b-41d4-a716-446655440010",
            rate: 30000,
            rate_type: "daily",
            updated_at: "2026-09-09T11:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/contractors/:id',
        description: 'Soft-delete a contractor.',
        curlExample: `curl -X DELETE \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/contractors/770e8400-e29b-41d4-a716-446655440010"`,
        responseExample: JSON.stringify({
          message: "Contractor soft-deleted successfully",
          data: { id: "770e8400-e29b-41d4-a716-446655440010", status: "inactive" }
        }, null, 2),
      },
    ],
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
      { text: 'Bank details are needed for payment batches — add them at creation time.' },
      { text: 'rate_type determines how the payment amount is calculated: hourly, daily, or monthly.' },
      { text: 'Use company field to track which firm the contractor represents.' },
    ],
    mistakes: [
      { text: 'Confusing contractors with employees — they are separate endpoints and directories.' },
      { text: 'Missing bank details → contractor cannot receive payment batch disbursements.' },
      { text: 'Invalid rate_type → must be exactly "hourly", "daily", or "monthly".' },
    ],
  },

  // ────────── TASKS ──────────
  {
    id: 'tasks',
    name: 'Tasks',
    icon: CheckSquare,
    basePath: '/tasks',
    overview: 'Task management system. Tasks belong to folders, can be assigned to employees, have priorities and due dates. Powers the KDOps task board.',
    access: 'All authenticated roles',
    endpoints: [
      {
        method: 'GET',
        path: '/tasks',
        description: 'List tasks (paginated). Filter by status, assignee_id, folder_id, priority.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/tasks?status=pending&folder_id=FOLDER_UUID&page=1&per_page=20"`,
        responseExample: JSON.stringify({
          data: [{
            id: "aa0e8400-e29b-41d4-a716-446655440050",
            title: "Review Q3 budget proposal",
            description: "Check line items and approve or flag concerns",
            priority: "high",
            status: "pending",
            due_date: "2026-09-15",
            assignee_id: "550e8400-e29b-41d4-a716-446655440001",
            folder_id: "ff0e8400-e29b-41d4-a716-446655440005",
            created_at: "2026-09-01T08:00:00Z"
          }],
          meta: { page: 1, per_page: 20, total: 38 }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/tasks/:id',
        description: 'Get a single task by UUID.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/tasks/aa0e8400-e29b-41d4-a716-446655440050"`,
        responseExample: JSON.stringify({
          data: {
            id: "aa0e8400-e29b-41d4-a716-446655440050",
            title: "Review Q3 budget proposal",
            description: "Check line items and approve or flag concerns",
            priority: "high",
            status: "pending",
            due_date: "2026-09-15",
            assignee_id: "550e8400-e29b-41d4-a716-446655440001",
            folder_id: "ff0e8400-e29b-41d4-a716-446655440005",
            created_at: "2026-09-01T08:00:00Z",
            updated_at: "2026-09-05T14:30:00Z"
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/tasks',
        description: 'Create a new task. Requires a title. folder_id is needed for board display.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Onboard new fleet driver",
    "description": "Complete documentation and vehicle assignment",
    "priority": "medium",
    "status": "pending",
    "due_date": "2026-09-20",
    "assignee_id": "550e8400-e29b-41d4-a716-446655440001",
    "folder_id": "ff0e8400-e29b-41d4-a716-446655440005"
  }' \\
  "${API_BASE}/tasks"`,
        responseExample: JSON.stringify({
          data: {
            id: "bb0e8400-e29b-41d4-a716-446655440060",
            title: "Onboard new fleet driver",
            priority: "medium",
            status: "pending",
            due_date: "2026-09-20",
            assignee_id: "550e8400-e29b-41d4-a716-446655440001",
            folder_id: "ff0e8400-e29b-41d4-a716-446655440005",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/tasks/:id',
        description: 'Update task fields. Commonly used to change status or reassign.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed"}' \\
  "${API_BASE}/tasks/aa0e8400-e29b-41d4-a716-446655440050"`,
        responseExample: JSON.stringify({
          data: {
            id: "aa0e8400-e29b-41d4-a716-446655440050",
            status: "completed",
            updated_at: "2026-09-09T15:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/tasks/:id',
        description: 'Delete a task.',
        curlExample: `curl -X DELETE \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/tasks/aa0e8400-e29b-41d4-a716-446655440050"`,
        responseExample: JSON.stringify({
          message: "Task deleted successfully"
        }, null, 2),
      },
    ],
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Task title/summary' },
      { name: 'description', type: 'string', required: false, description: 'Detailed description of the task' },
      { name: 'priority', type: 'string', required: false, description: '"low", "medium", "high", "urgent"' },
      { name: 'status', type: 'string', required: false, description: '"pending", "in_progress", "completed", "cancelled"' },
      { name: 'due_date', type: 'string', required: false, description: 'YYYY-MM-DD format' },
      { name: 'assignee_id', type: 'string (UUID)', required: false, description: 'Employee UUID to assign the task to' },
      { name: 'folder_id', type: 'string (UUID)', required: false, description: 'Folder UUID — required for task board display' },
    ],
    tips: [
      { text: 'Tasks need a folder_id to appear on the task board. Without one, the task exists but won\'t show in any folder view.' },
      { text: 'Use assignee_id to assign to a specific employee — must be a valid employee UUID.' },
      { text: 'Filter by status: GET /tasks?status=pending returns only pending tasks.' },
      { text: 'Filter by assignee: GET /tasks?assignee_id=UUID returns tasks for a specific person.' },
      { text: 'Combine filters: ?status=in_progress&assignee_id=UUID&priority=high' },
    ],
    mistakes: [
      { text: 'Creating tasks without a folder_id → task won\'t appear on any task board.' },
      { text: 'Using an invalid assignee_id → returns 400 Bad Request.' },
      { text: 'Wrong priority value → must be exactly "low", "medium", "high", or "urgent".' },
      { text: 'Wrong status value → must be "pending", "in_progress", "completed", or "cancelled".' },
    ],
  },

  // ────────── LEAVES ──────────
  {
    id: 'leaves',
    name: 'Leaves',
    icon: CalendarDays,
    basePath: '/leaves',
    overview: 'Leave request management. Employees request leave, managers approve or reject. Tracks balances by leave type.',
    access: 'All roles (own leaves); admin/super_admin (all leaves, approve/reject)',
    endpoints: [
      {
        method: 'GET',
        path: '/leaves',
        description: 'List leave requests (paginated). Filter by employee_id, status, leave_type.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/leaves?status=pending&page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "cc0e8400-e29b-41d4-a716-446655440070",
            employee_id: "550e8400-e29b-41d4-a716-446655440001",
            leave_type: "annual",
            start_date: "2026-09-20",
            end_date: "2026-09-25",
            reason: "Family vacation to Calabar",
            status: "pending",
            created_at: "2026-09-08T09:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 8 }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/leaves/balance/:employee_id',
        description: 'Check leave balance for an employee. Returns remaining days by leave type.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/leaves/balance/550e8400-e29b-41d4-a716-446655440001"`,
        responseExample: JSON.stringify({
          data: {
            employee_id: "550e8400-e29b-41d4-a716-446655440001",
            balances: {
              annual: { total: 20, used: 5, remaining: 15 },
              sick: { total: 10, used: 2, remaining: 8 },
              casual: { total: 5, used: 1, remaining: 4 },
              maternity: { total: 90, used: 0, remaining: 90 },
              paternity: { total: 10, used: 0, remaining: 10 },
              compassionate: { total: 5, used: 0, remaining: 5 },
              unpaid: { total: null, used: 3, remaining: null }
            }
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/leaves',
        description: 'Submit a new leave request. Status defaults to "pending".',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "employee_id": "550e8400-e29b-41d4-a716-446655440001",
    "leave_type": "annual",
    "start_date": "2026-10-01",
    "end_date": "2026-10-05",
    "reason": "Attending a wedding in Enugu"
  }' \\
  "${API_BASE}/leaves"`,
        responseExample: JSON.stringify({
          data: {
            id: "dd0e8400-e29b-41d4-a716-446655440080",
            employee_id: "550e8400-e29b-41d4-a716-446655440001",
            leave_type: "annual",
            start_date: "2026-10-01",
            end_date: "2026-10-05",
            reason: "Attending a wedding in Enugu",
            status: "pending",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/leaves/:id',
        description: 'Approve or reject a leave request. Include reviewer_notes when rejecting.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "approved"}' \\
  "${API_BASE}/leaves/cc0e8400-e29b-41d4-a716-446655440070"`,
        responseExample: JSON.stringify({
          data: {
            id: "cc0e8400-e29b-41d4-a716-446655440070",
            status: "approved",
            updated_at: "2026-09-09T14:00:00Z"
          }
        }, null, 2),
      },
    ],
    fields: [
      { name: 'employee_id', type: 'string (UUID)', required: true, description: 'UUID of the employee requesting leave' },
      { name: 'leave_type', type: 'string', required: true, description: '"annual", "sick", "casual", "maternity", "paternity", "compassionate", "unpaid"' },
      { name: 'start_date', type: 'string', required: true, description: 'Leave start date in YYYY-MM-DD format' },
      { name: 'end_date', type: 'string', required: true, description: 'Leave end date in YYYY-MM-DD format' },
      { name: 'reason', type: 'string', required: false, description: 'Reason for the leave request' },
      { name: 'status', type: 'string', required: false, description: '"pending", "approved", "rejected" (defaults to pending)' },
      { name: 'reviewer_notes', type: 'string', required: false, description: 'Manager notes — especially important when rejecting' },
    ],
    tips: [
      { text: 'Check leave balance before creating a request: GET /leaves/balance/:employee_id' },
      { text: 'Approval changes status from pending to approved or rejected.' },
      { text: 'Include reviewer_notes when rejecting — employees see this in their leave history.' },
      { text: 'Unpaid leave has no cap (remaining: null). All other types have annual allowances.' },
      { text: 'Filter by leave_type: GET /leaves?leave_type=sick returns only sick leaves.' },
    ],
    mistakes: [
      { text: 'Submitting leave without checking balance → request may exceed available days.' },
      { text: 'Rejecting without reviewer_notes → employee gets no explanation.' },
      { text: 'Wrong leave_type → must be one of the 7 allowed values.' },
      { text: 'end_date before start_date → returns validation error.' },
    ],
  },

  // ────────── EXPENSES ──────────
  {
    id: 'expenses',
    name: 'Expenses',
    icon: Receipt,
    basePath: '/expenses',
    overview: 'Expense tracking and approval. Employees submit expenses with receipts, managers approve or reject for reimbursement.',
    access: 'All roles (own expenses); admin/super_admin/finance (all expenses, approve)',
    endpoints: [
      {
        method: 'GET',
        path: '/expenses',
        description: 'List expenses (paginated). Filter by status, category, employee_id.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/expenses?status=pending&page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "ee0e8400-e29b-41d4-a716-446655440090",
            title: "Uber to client meeting",
            amount: 15000,
            currency: "NGN",
            category: "transport",
            description: "Round trip to Dangote HQ, Victoria Island",
            receipt_url: "https://storage.example.com/receipts/uber-sept.pdf",
            status: "pending",
            employee_id: "550e8400-e29b-41d4-a716-446655440001",
            created_at: "2026-09-08T16:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 23 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/expenses',
        description: 'Submit a new expense.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Office supplies from Jumia",
    "amount": 45000,
    "category": "supplies",
    "description": "Printer cartridges and paper reams",
    "receipt_url": "https://storage.example.com/receipts/jumia-order.pdf"
  }' \\
  "${API_BASE}/expenses"`,
        responseExample: JSON.stringify({
          data: {
            id: "ff0e8400-e29b-41d4-a716-446655440100",
            title: "Office supplies from Jumia",
            amount: 45000,
            currency: "NGN",
            category: "supplies",
            status: "pending",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/expenses/:id',
        description: 'Approve or reject an expense.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "approved"}' \\
  "${API_BASE}/expenses/ee0e8400-e29b-41d4-a716-446655440090"`,
        responseExample: JSON.stringify({
          data: {
            id: "ee0e8400-e29b-41d4-a716-446655440090",
            status: "approved",
            updated_at: "2026-09-09T12:00:00Z"
          }
        }, null, 2),
      },
    ],
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
      { text: 'Attach receipt_url for faster approval — expenses without receipts may be flagged.' },
      { text: 'Filter pending expenses: GET /expenses?status=pending' },
      { text: 'Use category to organize expenses for reporting and budgeting.' },
    ],
    mistakes: [
      { text: 'Entering amount in kobo instead of Naira → ₦15,000 should be 15000, not 1500000.' },
      { text: 'Missing receipt_url → expense may be rejected by approvers.' },
      { text: 'Invalid category → must be one of the 6 allowed values.' },
    ],
  },

  // ────────── PAYROLL ──────────
  {
    id: 'payroll',
    name: 'Payroll',
    icon: Banknote,
    basePath: '/payroll',
    overview: 'Read-only payroll data. View payroll runs and individual payslips. Payroll runs are created in the KDOps UI — the API provides read access for integration and reporting.',
    access: 'admin, super_admin, finance',
    endpoints: [
      {
        method: 'GET',
        path: '/payroll/runs',
        description: 'List payroll runs (paginated). Filter by month.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/payroll/runs?month=2026-09&page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "pr-001",
            month: "2026-09",
            status: "completed",
            total_gross: 12500000,
            total_deductions: 2100000,
            total_net: 10400000,
            employee_count: 45,
            processed_at: "2026-09-28T10:00:00Z",
            created_at: "2026-09-25T08:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 9 }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/payroll/runs/:id',
        description: 'Get details of a specific payroll run.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/payroll/runs/pr-001"`,
        responseExample: JSON.stringify({
          data: {
            id: "pr-001",
            month: "2026-09",
            status: "completed",
            total_gross: 12500000,
            total_deductions: 2100000,
            total_net: 10400000,
            employee_count: 45,
            processed_at: "2026-09-28T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/payroll/runs/:id/slips',
        description: 'Get individual payslips for a payroll run.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/payroll/runs/pr-001/slips?page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "slip-001",
            employee_id: "550e8400-e29b-41d4-a716-446655440001",
            employee_name: "Chioma Okafor",
            gross_pay: 450000,
            deductions: { tax: 45000, pension: 36000, nhf: 11250 },
            net_pay: 357750,
            bank_name: "Access Bank",
            account_number: "0123456789",
            payment_status: "paid"
          }],
          meta: { page: 1, per_page: 10, total: 45 }
        }, null, 2),
      },
    ],
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
      { text: 'Payroll is read-only via API — runs are created and processed in the KDOps UI.' },
      { text: 'Filter by month: GET /payroll/runs?month=2026-09' },
      { text: 'Each payslip contains: employee_id, gross_pay, deductions breakdown, net_pay, and bank details.' },
      { text: 'Deductions include tax, pension, and NHF (National Housing Fund) where applicable.' },
    ],
    mistakes: [
      { text: 'Trying to POST to /payroll → payroll is read-only via API.' },
      { text: 'Incorrect month format → must be YYYY-MM, not YYYY-MM-DD.' },
      { text: 'Expecting payslips at /payroll/slips → they are nested under runs: /payroll/runs/:id/slips.' },
    ],
  },

  // ────────── FLEET ──────────
  {
    id: 'fleet',
    name: 'Fleet',
    icon: Truck,
    basePath: '/fleet',
    overview: 'Fleet management — vehicles, fuel requests, and trips. Track your vehicle fleet, manage fuel disbursements, and log trips with driver assignments.',
    access: 'All roles (own requests); admin/super_admin/operations (all fleet data)',
    warnings: [
      { text: 'BANK DETAILS REQUIRED: Fuel request disbursements ONLY work if the requesting employee has valid bank details on file (bank_name, account_number, account_name). Without bank details, the fuel request will be created but payment CANNOT be processed. Always ensure employees update their bank details in their profile BEFORE making fuel or trip requests.' },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/fleet/vehicles',
        description: 'List all vehicles in the fleet.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/fleet/vehicles?page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "v-001",
            plate_number: "LAG-234-XY",
            make: "Toyota",
            model: "Hilux",
            year: 2024,
            status: "active",
            created_at: "2026-01-10T08:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 8 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/fleet/vehicles',
        description: 'Add a new vehicle to the fleet.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "plate_number": "ABJ-789-ZZ",
    "make": "Ford",
    "model": "Ranger",
    "year": 2025,
    "status": "active"
  }' \\
  "${API_BASE}/fleet/vehicles"`,
        responseExample: JSON.stringify({
          data: {
            id: "v-009",
            plate_number: "ABJ-789-ZZ",
            make: "Ford",
            model: "Ranger",
            year: 2025,
            status: "active",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/fleet/fuel-requests',
        description: 'List fuel requests (paginated). Filter by vehicle_id, status.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/fleet/fuel-requests?status=pending&page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "fr-001",
            vehicle_id: "v-001",
            amount: 25000,
            litres: 45,
            station: "Total Energies, Lekki",
            notes: "Weekly refuel for site visits",
            status: "pending",
            requested_by: "550e8400-e29b-41d4-a716-446655440001",
            created_at: "2026-09-08T07:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 15 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/fleet/fuel-requests',
        description: 'Create a fuel request. Employee must have bank details on file for payment.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "vehicle_id": "v-001",
    "amount": 30000,
    "litres": 55,
    "station": "NNPC Mega Station, Ikoyi",
    "notes": "Emergency refuel for generator delivery"
  }' \\
  "${API_BASE}/fleet/fuel-requests"`,
        responseExample: JSON.stringify({
          data: {
            id: "fr-016",
            vehicle_id: "v-001",
            amount: 30000,
            litres: 55,
            station: "NNPC Mega Station, Ikoyi",
            status: "pending",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/fleet/trips',
        description: 'List trips (paginated). Filter by vehicle_id, driver_id.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/fleet/trips?vehicle_id=v-001&page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "trip-001",
            vehicle_id: "v-001",
            driver_id: "550e8400-e29b-41d4-a716-446655440001",
            start_location: "KD Squares HQ, Lekki",
            end_location: "Dangote Refinery, Ibeju-Lekki",
            distance_km: 45,
            purpose: "Client site inspection",
            created_at: "2026-09-07T06:30:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 32 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/fleet/trips',
        description: 'Log a new trip.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "vehicle_id": "v-001",
    "driver_id": "550e8400-e29b-41d4-a716-446655440001",
    "start_location": "KD Squares HQ, Lekki",
    "end_location": "Tin Can Island Port",
    "distance_km": 38,
    "purpose": "Equipment pickup from port"
  }' \\
  "${API_BASE}/fleet/trips"`,
        responseExample: JSON.stringify({
          data: {
            id: "trip-033",
            vehicle_id: "v-001",
            driver_id: "550e8400-e29b-41d4-a716-446655440001",
            start_location: "KD Squares HQ, Lekki",
            end_location: "Tin Can Island Port",
            distance_km: 38,
            purpose: "Equipment pickup from port",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
    ],
    fields: [
      { name: 'plate_number', type: 'string', required: true, description: 'Vehicle plate number (e.g., "LAG-234-XY")' },
      { name: 'make', type: 'string', required: false, description: 'Vehicle manufacturer (e.g., "Toyota")' },
      { name: 'model', type: 'string', required: false, description: 'Vehicle model (e.g., "Hilux")' },
      { name: 'year', type: 'number', required: false, description: 'Year of manufacture' },
      { name: 'vehicle_id', type: 'string', required: true, description: '(Fuel/Trips) Vehicle UUID' },
      { name: 'amount', type: 'number', required: true, description: '(Fuel) Amount in NGN' },
      { name: 'litres', type: 'number', required: false, description: '(Fuel) Litres of fuel' },
      { name: 'station', type: 'string', required: false, description: '(Fuel) Fuel station name and location' },
      { name: 'driver_id', type: 'string (UUID)', required: true, description: '(Trips) Employee UUID of the driver' },
      { name: 'start_location', type: 'string', required: true, description: '(Trips) Trip origin' },
      { name: 'end_location', type: 'string', required: true, description: '(Trips) Trip destination' },
      { name: 'distance_km', type: 'number', required: false, description: '(Trips) Distance in kilometers' },
      { name: 'purpose', type: 'string', required: false, description: '(Trips) Purpose of the trip' },
    ],
    tips: [
      { text: 'Always check that a vehicle exists before creating a fuel request or trip for it.' },
      { text: 'driver_id must be a valid employee UUID.' },
      { text: 'Trip distance_km helps with fuel efficiency reporting and cost analysis.' },
      { text: 'Fuel request amounts are in NGN — same as all monetary values in KDOps.' },
    ],
    mistakes: [
      { text: 'Employee without bank details making fuel request → request created but payment CANNOT be processed.' },
      { text: 'Invalid vehicle_id → returns 400 Bad Request.' },
      { text: 'Invalid driver_id → returns 400 Bad Request. Must be an existing employee.' },
      { text: 'Forgetting to log trips → fleet utilization reports will be inaccurate.' },
    ],
  },

  // ────────── INVOICES ──────────
  {
    id: 'invoices',
    name: 'Invoices',
    icon: FileText,
    basePath: '/invoices',
    overview: 'Client invoicing. Create, track, and manage invoices with line items, VAT calculation, and payment status tracking.',
    access: 'admin, super_admin, finance',
    endpoints: [
      {
        method: 'GET',
        path: '/invoices',
        description: 'List invoices (paginated). Filter by client_id, status.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/invoices?status=sent&page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "inv-001",
            client_id: "cl-001",
            client_name: "Dangote Industries",
            items: [
              { description: "Consulting — Q3 Strategy", amount: 2500000 },
              { description: "Staff Augmentation (3 engineers)", amount: 4500000 }
            ],
            subtotal: 7000000,
            vat_rate: 7.5,
            vat_amount: 525000,
            total: 7525000,
            due_date: "2026-10-15",
            status: "sent",
            created_at: "2026-09-01T08:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 18 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/invoices',
        description: 'Create a new invoice with line items.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_id": "cl-001",
    "items": [
      { "description": "Software Development — Phase 1", "amount": 3000000 },
      { "description": "UI/UX Design", "amount": 1500000 },
      { "description": "Project Management", "amount": 500000 }
    ],
    "due_date": "2026-10-30",
    "vat_rate": 7.5,
    "notes": "Payment due within 30 days. Bank: Access Bank, Acct: 0123456789"
  }' \\
  "${API_BASE}/invoices"`,
        responseExample: JSON.stringify({
          data: {
            id: "inv-019",
            client_id: "cl-001",
            items: [
              { description: "Software Development — Phase 1", amount: 3000000 },
              { description: "UI/UX Design", amount: 1500000 },
              { description: "Project Management", amount: 500000 }
            ],
            subtotal: 5000000,
            vat_rate: 7.5,
            vat_amount: 375000,
            total: 5375000,
            due_date: "2026-10-30",
            status: "draft",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/invoices/:id',
        description: 'Update invoice — change status, items, or due date.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "paid"}' \\
  "${API_BASE}/invoices/inv-001"`,
        responseExample: JSON.stringify({
          data: {
            id: "inv-001",
            status: "paid",
            updated_at: "2026-09-09T16:00:00Z"
          }
        }, null, 2),
      },
    ],
    fields: [
      { name: 'client_id', type: 'string', required: true, description: 'Client UUID (must exist in /clients)' },
      { name: 'items', type: 'array', required: true, description: 'Array of { description: string, amount: number } line items' },
      { name: 'due_date', type: 'string', required: false, description: 'Payment due date in YYYY-MM-DD' },
      { name: 'vat_rate', type: 'number', required: false, description: 'VAT percentage (e.g., 7.5 means 7.5%)' },
      { name: 'notes', type: 'string', required: false, description: 'Additional notes shown on the invoice' },
      { name: 'status', type: 'string', required: false, description: '"draft", "sent", "paid", "overdue"' },
    ],
    tips: [
      { text: 'Create the client first via /clients, then reference their ID in the invoice.' },
      { text: 'Items is an array — each item needs both description and amount.' },
      { text: 'VAT is a percentage: 7.5 means 7.5%. The API calculates vat_amount and total automatically.' },
      { text: 'Status flow: draft → sent → paid / overdue. Move through states with PATCH.' },
      { text: 'Include payment instructions in notes for clarity.' },
    ],
    mistakes: [
      { text: 'Using a client_id that doesn\'t exist → returns 400 Bad Request. Create the client first.' },
      { text: 'Items missing description or amount → validation error.' },
      { text: 'Setting vat_rate as a decimal (0.075) instead of percentage (7.5) → incorrect VAT calculation.' },
      { text: 'Skipping status transitions (draft → paid without sending) → may cause reporting inconsistencies.' },
    ],
  },

  // ────────── CLIENTS ──────────
  {
    id: 'clients',
    name: 'Clients',
    icon: Building2,
    basePath: '/clients',
    overview: 'Client and company directory. Clients are linked to invoices and placements. Create clients here before referencing them in invoices.',
    access: 'admin, super_admin, finance',
    endpoints: [
      {
        method: 'GET',
        path: '/clients',
        description: 'List all clients (paginated). Filter by industry, status.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/clients?page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "cl-001",
            name: "Dangote Industries",
            industry: "Manufacturing",
            contact_person: "Alhaji Musa",
            contact_email: "musa@dangote.com",
            phone: "+2348033001122",
            contract_value: 25000000,
            status: "active",
            created_at: "2026-02-01T08:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 14 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/clients',
        description: 'Create a new client.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "MTN Nigeria",
    "industry": "Telecommunications",
    "contact_person": "Ngozi Anya",
    "contact_email": "ngozi@mtn.ng",
    "phone": "+2349012345678",
    "contract_value": 15000000
  }' \\
  "${API_BASE}/clients"`,
        responseExample: JSON.stringify({
          data: {
            id: "cl-015",
            name: "MTN Nigeria",
            industry: "Telecommunications",
            contact_person: "Ngozi Anya",
            contact_email: "ngozi@mtn.ng",
            status: "active",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/clients/:id',
        description: 'Update client details.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"contract_value": 30000000, "contact_person": "Amina Bello"}' \\
  "${API_BASE}/clients/cl-001"`,
        responseExample: JSON.stringify({
          data: {
            id: "cl-001",
            contract_value: 30000000,
            contact_person: "Amina Bello",
            updated_at: "2026-09-09T11:00:00Z"
          }
        }, null, 2),
      },
    ],
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
      { text: 'Contact fields help your team know who to reach at each client.' },
    ],
    mistakes: [
      { text: 'Trying to create an invoice with a nonexistent client_id → create the client first.' },
      { text: 'Duplicate client names are allowed but may cause confusion — check before creating.' },
    ],
  },

  // ────────── RECRUITMENT ──────────
  {
    id: 'recruitment',
    name: 'Recruitment',
    icon: UserPlus,
    basePath: '/recruitment',
    overview: 'Job openings and applicant tracking. Create job openings, track applicants through pipeline stages from new to hired/rejected.',
    access: 'admin, super_admin (read openings: all roles)',
    endpoints: [
      {
        method: 'GET',
        path: '/recruitment/openings',
        description: 'List job openings (paginated). Filter by department, status.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/recruitment/openings?page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "op-001",
            title: "Senior Backend Engineer",
            department: "Engineering",
            employment_type: "full_time",
            salary_min: 600000,
            salary_max: 900000,
            closing_date: "2026-10-15",
            status: "open",
            applicant_count: 23,
            created_at: "2026-08-15T08:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 5 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/recruitment/openings',
        description: 'Create a new job opening.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Fleet Operations Manager",
    "department": "Operations",
    "employment_type": "full_time",
    "salary_min": 500000,
    "salary_max": 750000,
    "closing_date": "2026-11-01"
  }' \\
  "${API_BASE}/recruitment/openings"`,
        responseExample: JSON.stringify({
          data: {
            id: "op-006",
            title: "Fleet Operations Manager",
            department: "Operations",
            employment_type: "full_time",
            salary_min: 500000,
            salary_max: 750000,
            closing_date: "2026-11-01",
            status: "open",
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/recruitment/applicants',
        description: 'List all applicants across all openings.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/recruitment/applicants?page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "app-001",
            opening_id: "op-001",
            name: "Oluwaseun Adebayo",
            email: "seun@email.com",
            phone: "+2348055667788",
            stage: "interview_1",
            applied_at: "2026-08-20T14:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 67 }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/recruitment/openings/:id/applicants',
        description: 'List applicants for a specific opening.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/recruitment/openings/op-001/applicants?page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "app-001",
            name: "Oluwaseun Adebayo",
            email: "seun@email.com",
            stage: "interview_1",
            applied_at: "2026-08-20T14:00:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 23 }
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/recruitment/applicants/:id',
        description: 'Update applicant stage. Use rejection_reason when moving to "rejected".',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"stage": "interview_2"}' \\
  "${API_BASE}/recruitment/applicants/app-001"`,
        responseExample: JSON.stringify({
          data: {
            id: "app-001",
            stage: "interview_2",
            updated_at: "2026-09-09T14:00:00Z"
          }
        }, null, 2),
      },
    ],
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
      { text: 'Include rejection_reason when moving an applicant to "rejected" — helps with reporting.' },
      { text: 'salary_min and salary_max define the range shown to applicants.' },
      { text: 'Filter applicants by stage: GET /recruitment/applicants?stage=interview_1' },
    ],
    mistakes: [
      { text: 'Invalid stage value → must be one of the 7 pipeline stages.' },
      { text: 'Rejecting without rejection_reason → no audit trail for why candidate was rejected.' },
      { text: 'salary_min greater than salary_max → validation error.' },
    ],
  },

  // ────────── DATA (DATABASE) ──────────
  {
    id: 'data',
    name: 'Database',
    icon: Database,
    basePath: '/data',
    overview: 'Custom database tables (Airtable-compatible). Create bases, tables, and records programmatically. Features smart type detection and auto-column creation for unknown fields.',
    access: 'All authenticated roles',
    endpoints: [
      {
        method: 'GET',
        path: '/data/bases',
        description: 'List all bases in the workspace.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/data/bases"`,
        responseExample: JSON.stringify({
          data: [
            { id: "base-001", name: "CRM", slug: "crm", table_count: 4, created_at: "2026-03-01T08:00:00Z" },
            { id: "base-002", name: "Inventory", slug: "inventory", table_count: 2, created_at: "2026-05-10T10:00:00Z" }
          ]
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/data/bases/:baseId/tables',
        description: 'List tables in a base. baseId can be UUID or slug.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/data/bases/crm/tables"`,
        responseExample: JSON.stringify({
          data: [
            { id: "tbl-001", name: "Companies", slug: "companies", field_count: 8, record_count: 156 },
            { id: "tbl-002", name: "Contacts", slug: "contacts", field_count: 6, record_count: 342 }
          ]
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/data/bases/:baseId/tables/:tableId/records',
        description: 'List records in a table. Supports pagination, sorting, and filtering.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/data/bases/crm/tables/companies/records?page=1&per_page=20&sort=Revenue:desc"`,
        responseExample: JSON.stringify({
          data: [{
            id: "rec-001",
            fields: {
              Company: "Dangote Industries",
              Revenue: 5000000000,
              Industry: "Manufacturing",
              Website: "https://dangote.com",
              Contact_Email: "info@dangote.com"
            },
            created_at: "2026-06-15T09:00:00Z"
          }],
          meta: { page: 1, per_page: 20, total: 156 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/data/bases/:baseId/tables/:tableId/records',
        description: 'Create records (max 10 per request). Unknown field names auto-create new columns.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      { "fields": { "Company": "Dangote Industries", "Revenue": 5000000000, "Industry": "Manufacturing" } },
      { "fields": { "Company": "MTN Nigeria", "Revenue": 2000000000, "Industry": "Telecom" } }
    ]
  }' \\
  "${API_BASE}/data/bases/crm/tables/companies/records"`,
        responseExample: JSON.stringify({
          data: [
            { id: "rec-157", fields: { Company: "Dangote Industries", Revenue: 5000000000, Industry: "Manufacturing" } },
            { id: "rec-158", fields: { Company: "MTN Nigeria", Revenue: 2000000000, Industry: "Telecom" } }
          ]
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/data/bases/:baseId/tables/:tableId/records',
        description: 'Update existing records. Each record needs its id.',
        curlExample: `curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      { "id": "rec-157", "fields": { "Revenue": 5500000000, "Industry": "Conglomerate" } }
    ]
  }' \\
  "${API_BASE}/data/bases/crm/tables/companies/records"`,
        responseExample: JSON.stringify({
          data: [
            { id: "rec-157", fields: { Company: "Dangote Industries", Revenue: 5500000000, Industry: "Conglomerate" } }
          ]
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/data/bases/:baseId/tables/:tableId/records',
        description: 'Delete records by ID.',
        curlExample: `curl -X DELETE \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"records": ["rec-157", "rec-158"]}' \\
  "${API_BASE}/data/bases/crm/tables/companies/records"`,
        responseExample: JSON.stringify({
          deleted: ["rec-157", "rec-158"]
        }, null, 2),
      },
    ],
    fields: [
      { name: 'records', type: 'array', required: true, description: 'Array of record objects. Each has a "fields" object with column names as keys.' },
      { name: 'fields', type: 'object', required: true, description: 'Key-value pairs where key = column name, value = cell value' },
      { name: 'id', type: 'string', required: false, description: 'Record ID (required for PATCH/DELETE, auto-generated on POST)' },
      { name: 'page', type: 'number', required: false, description: 'Page number for pagination (query param)' },
      { name: 'per_page', type: 'number', required: false, description: 'Records per page (query param, max 100)' },
      { name: 'sort', type: 'string', required: false, description: 'Sort by field: "FieldName:asc" or "FieldName:desc" (query param)' },
    ],
    tips: [
      { text: 'Base and table can be referenced by UUID or slug — slugs are easier to read in URLs.' },
      { text: 'Unknown field names in POST/PATCH auto-create new columns with smart type detection.' },
      { text: 'Smart type detection: emails become email fields, URLs become URL fields, dates and numbers are auto-typed.' },
      { text: 'Records use a "fields" wrapper: { "records": [{ "fields": { "Name": "value" } }] }' },
      { text: 'Maximum 10 records per POST request. Batch larger inserts into multiple requests.' },
      { text: 'Sort with query params: ?sort=Revenue:desc' },
    ],
    mistakes: [
      { text: 'Forgetting the "fields" wrapper → { "Company": "X" } won\'t work. Use { "fields": { "Company": "X" } }.' },
      { text: 'Sending more than 10 records in one POST → returns 400. Batch into groups of 10.' },
      { text: 'Using field IDs instead of names → use human-readable column names.' },
      { text: 'Forgetting record ID in PATCH → each record object needs its "id" for updates.' },
    ],
  },

  // ────────── PAYMENT BATCHES ──────────
  {
    id: 'payment-batches',
    name: 'Payment Batches',
    icon: CreditCard,
    basePath: '/payment-batches',
    overview: 'Bulk payment processing. Create batches of payments to multiple recipients — employees, contractors, or vendors. All recipients must have valid bank details on file.',
    access: 'admin, super_admin, finance',
    warnings: [
      { text: 'All recipients MUST have valid bank details on file (bank_name, account_number, account_name). Payments to recipients without bank details will be SKIPPED silently. Verify bank details before creating payment batches.' },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/payment-batches',
        description: 'List payment batches (paginated). Filter by status.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/payment-batches?page=1&per_page=10"`,
        responseExample: JSON.stringify({
          data: [{
            id: "pb-001",
            description: "September contractor payments",
            total_amount: 2500000,
            recipient_count: 8,
            status: "completed",
            successful_payments: 7,
            failed_payments: 1,
            created_at: "2026-09-05T10:00:00Z",
            processed_at: "2026-09-05T10:15:00Z"
          }],
          meta: { page: 1, per_page: 10, total: 12 }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/payment-batches',
        description: 'Create a new payment batch with recipients.',
        curlExample: `curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "description": "October contractor payments",
    "payments": [
      { "recipient_id": "770e8400-e29b-41d4-a716-446655440010", "amount": 500000, "narration": "Oct consulting fee" },
      { "recipient_id": "880e8400-e29b-41d4-a716-446655440020", "amount": 150000, "narration": "Oct design retainer" },
      { "recipient_id": "550e8400-e29b-41d4-a716-446655440001", "amount": 100000, "narration": "Oct bonus" }
    ]
  }' \\
  "${API_BASE}/payment-batches"`,
        responseExample: JSON.stringify({
          data: {
            id: "pb-013",
            description: "October contractor payments",
            total_amount: 750000,
            recipient_count: 3,
            status: "pending",
            payments: [
              { recipient_id: "770e8400-e29b-41d4-a716-446655440010", amount: 500000, status: "pending" },
              { recipient_id: "880e8400-e29b-41d4-a716-446655440020", amount: 150000, status: "pending" },
              { recipient_id: "550e8400-e29b-41d4-a716-446655440001", amount: 100000, status: "pending" }
            ],
            created_at: "2026-09-09T10:00:00Z"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/payment-batches/:id',
        description: 'Get batch details with individual payment statuses.',
        curlExample: `curl -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${API_BASE}/payment-batches/pb-001"`,
        responseExample: JSON.stringify({
          data: {
            id: "pb-001",
            description: "September contractor payments",
            total_amount: 2500000,
            status: "completed",
            payments: [
              { recipient_id: "770e8400-e29b-41d4-a716-446655440010", recipient_name: "Tunde Adeyemi", amount: 500000, status: "paid", bank_name: "Zenith Bank" },
              { recipient_id: "990e8400-e29b-41d4-a716-446655440030", recipient_name: "No Bank Details", amount: 200000, status: "skipped", reason: "Missing bank details" }
            ],
            processed_at: "2026-09-05T10:15:00Z"
          }
        }, null, 2),
      },
    ],
    fields: [
      { name: 'description', type: 'string', required: false, description: 'Description of the payment batch' },
      { name: 'payments', type: 'array', required: true, description: 'Array of { recipient_id, amount, narration }' },
      { name: 'recipient_id', type: 'string (UUID)', required: true, description: 'Employee or contractor UUID' },
      { name: 'amount', type: 'number', required: true, description: 'Payment amount in NGN' },
      { name: 'narration', type: 'string', required: false, description: 'Payment description/narration shown to recipient' },
    ],
    tips: [
      { text: 'Verify all recipients have bank details before creating a batch to avoid skipped payments.' },
      { text: 'Check batch status with GET /payment-batches/:id to see individual payment outcomes.' },
      { text: 'Narration appears on the recipient\'s bank statement — make it descriptive.' },
      { text: 'Failed/skipped payments can be identified in the batch details response.' },
    ],
    mistakes: [
      { text: 'Recipients without bank details → payment is silently skipped (status: "skipped").' },
      { text: 'Invalid recipient_id → returns 400 Bad Request.' },
      { text: 'Amount as string instead of number → validation error. Use 500000, not "500000".' },
      { text: 'Not checking batch results → you won\'t know which payments were skipped or failed.' },
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
                  <Badge variant="outline" className="ml-auto text-3xs px-1.5 py-0 shrink-0">
                    {mod.basePath}
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
              <code className="text-xs text-blue-100 font-mono">{API_BASE}{mod.basePath}</code>
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
        <div key={i} className="flex gap-3 p-4 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40">
          <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 leading-relaxed">{w.text}</p>
        </div>
      ))}

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
            <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <AlertTriangle size={14} className="shrink-0 text-amber-500 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{m.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
