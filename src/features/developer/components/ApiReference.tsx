import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Search, Copy, Check, ChevronDown, ChevronRight, Lock,
  Users, Briefcase, ListTodo, Calendar, Receipt, Banknote,
  Car, FileText, Building2, UserPlus, Database, Webhook,
  Shield, ArrowRight, ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/* ─── Types ─── */

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface Endpoint {
  method: HttpMethod;
  path: string;
  description: string;
  params?: Param[];
  bodyFields?: Param[];
  exampleRequest: string;
  exampleResponse: string;
  notes?: string;
}

interface Module {
  id: string;
  name: string;
  icon: React.ElementType;
  basePath: string;
  description: string;
  endpoints: Endpoint[];
}

/* ─── Helpers ─── */

function CopyButton({ text, size = 12 }: { text: string; size?: number }) {
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
      {copied ? <Check size={size} className="text-emerald-500" /> : <Copy size={size} />}
    </button>
  );
}

function CodeBlock({ label, code, language }: { label: string; code: string; language?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="text-3xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
          {language && (
            <span className="text-3xs px-1.5 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 font-medium">
              {language}
            </span>
          )}
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="px-3 py-2.5 text-2xs leading-relaxed font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all bg-white dark:bg-zinc-900/60 overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: HttpMethod }) {
  const colors: Record<HttpMethod, string> = {
    GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={cn('text-3xs font-bold font-mono px-2 py-0.5 rounded', colors[method])}>
      {method}
    </span>
  );
}

/* ─── Data ─── */

const BASE = 'https://api.kdops.ng/v1';

const MODULES: Module[] = [
  {
    id: 'authentication',
    name: 'Authentication',
    icon: Shield,
    basePath: '/v1',
    description: 'All API requests require a Bearer token. Create keys in the API Keys tab. Each key has scopes that limit access.',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/auth/validate',
        description: 'Validate an API key and return its scopes and metadata.',
        bodyFields: [
          { name: 'api_key', type: 'string', required: true, description: 'The API key to validate' },
        ],
        exampleRequest: `curl -X POST ${BASE}/auth/validate \\
  -H "Content-Type: application/json" \\
  -d '{"api_key": "kdops_live_abc123..."}'`,
        exampleResponse: JSON.stringify({
          valid: true,
          key_id: 'key_9f8e7d6c',
          name: 'Production Key',
          scopes: ['employees:read', 'employees:write', 'tasks:read'],
          created_at: '2026-03-15T09:00:00Z',
          last_used_at: '2026-09-09T14:22:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'employees',
    name: 'Employees',
    icon: Users,
    basePath: '/v1/employees',
    description: 'Manage employee records including personal details, department assignments, and banking information.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/employees',
        description: 'List all employees with optional filters and pagination.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number (default: 1)' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page (default: 25, max: 100)' },
          { name: 'department', type: 'string', required: false, description: 'Filter by department slug' },
          { name: 'status', type: 'string', required: false, description: 'Filter by status: active, inactive, terminated' },
          { name: 'search', type: 'string', required: false, description: 'Search by name or email' },
        ],
        exampleRequest: `curl ${BASE}/employees?department=engineering&status=active \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'emp_2f8a9b1c',
              first_name: 'Chioma',
              last_name: 'Okafor',
              email: 'chioma.okafor@kdops.ng',
              phone: '+234 812 345 6789',
              department: 'Engineering',
              role: 'Senior Developer',
              employment_type: 'full_time',
              status: 'active',
              start_date: '2024-06-01',
              created_at: '2024-06-01T08:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 48, total_pages: 2 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/employees/:id',
        description: 'Retrieve a single employee by ID.',
        exampleRequest: `curl ${BASE}/employees/emp_2f8a9b1c \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'emp_2f8a9b1c',
          first_name: 'Chioma',
          last_name: 'Okafor',
          email: 'chioma.okafor@kdops.ng',
          phone: '+234 812 345 6789',
          department: 'Engineering',
          role: 'Senior Developer',
          employment_type: 'full_time',
          status: 'active',
          start_date: '2024-06-01',
          salary: 850000,
          bank_name: 'Access Bank',
          account_number: '0123456789',
          account_name: 'Chioma Okafor',
          created_at: '2024-06-01T08:00:00Z',
          updated_at: '2026-08-20T11:30:00Z',
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/employees',
        description: 'Create a new employee record.',
        bodyFields: [
          { name: 'first_name', type: 'string', required: true, description: 'Employee first name' },
          { name: 'last_name', type: 'string', required: true, description: 'Employee last name' },
          { name: 'email', type: 'string', required: true, description: 'Work email address' },
          { name: 'phone', type: 'string', required: false, description: 'Phone number' },
          { name: 'department', type: 'string', required: false, description: 'Department name or ID' },
          { name: 'role', type: 'string', required: false, description: 'Job title' },
          { name: 'employment_type', type: 'string', required: false, description: 'full_time, part_time, or contract' },
          { name: 'start_date', type: 'string', required: false, description: 'ISO 8601 date' },
          { name: 'salary', type: 'number', required: false, description: 'Monthly salary in NGN' },
          { name: 'bank_name', type: 'string', required: false, description: 'Bank name for payroll' },
          { name: 'account_number', type: 'string', required: false, description: 'Bank account number' },
          { name: 'account_name', type: 'string', required: false, description: 'Account holder name' },
        ],
        exampleRequest: `curl -X POST ${BASE}/employees \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "first_name": "Emeka",
    "last_name": "Nwosu",
    "email": "emeka.nwosu@kdops.ng",
    "department": "Operations",
    "role": "Fleet Manager",
    "employment_type": "full_time",
    "start_date": "2026-10-01",
    "salary": 650000,
    "bank_name": "GTBank",
    "account_number": "0987654321",
    "account_name": "Emeka Nwosu"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'emp_4d7c1e3f',
          first_name: 'Emeka',
          last_name: 'Nwosu',
          email: 'emeka.nwosu@kdops.ng',
          department: 'Operations',
          role: 'Fleet Manager',
          employment_type: 'full_time',
          status: 'active',
          start_date: '2026-10-01',
          salary: 650000,
          bank_name: 'GTBank',
          account_number: '0987654321',
          account_name: 'Emeka Nwosu',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/employees/:id',
        description: 'Update one or more fields on an employee record.',
        bodyFields: [
          { name: '...fields', type: 'mixed', required: false, description: 'Any employee field to update' },
        ],
        exampleRequest: `curl -X PATCH ${BASE}/employees/emp_2f8a9b1c \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"salary": 950000, "role": "Lead Developer"}'`,
        exampleResponse: JSON.stringify({
          id: 'emp_2f8a9b1c',
          first_name: 'Chioma',
          last_name: 'Okafor',
          role: 'Lead Developer',
          salary: 950000,
          updated_at: '2026-09-09T15:30:00Z',
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/v1/employees/:id',
        description: 'Soft-delete an employee. Sets status to "terminated". Record is retained for compliance.',
        exampleRequest: `curl -X DELETE ${BASE}/employees/emp_2f8a9b1c \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'emp_2f8a9b1c',
          status: 'terminated',
          terminated_at: '2026-09-09T16:00:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'contractors',
    name: 'Contractors',
    icon: Briefcase,
    basePath: '/v1/contractors',
    description: 'Manage external contractors, consultants, and vendor personnel.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/contractors',
        description: 'List all contractors.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'status', type: 'string', required: false, description: 'active or inactive' },
        ],
        exampleRequest: `curl ${BASE}/contractors?status=active \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'ctr_8a1b2c3d',
              first_name: 'Ngozi',
              last_name: 'Adeyemi',
              email: 'ngozi@designstudio.ng',
              company: 'Adeyemi Design Studio',
              phone: '+234 803 456 7890',
              rate: 75000,
              rate_type: 'daily',
              status: 'active',
            },
          ],
          meta: { page: 1, per_page: 25, total: 12 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/contractors/:id',
        description: 'Get a contractor by ID.',
        exampleRequest: `curl ${BASE}/contractors/ctr_8a1b2c3d \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'ctr_8a1b2c3d',
          first_name: 'Ngozi',
          last_name: 'Adeyemi',
          email: 'ngozi@designstudio.ng',
          company: 'Adeyemi Design Studio',
          rate: 75000,
          rate_type: 'daily',
          status: 'active',
          created_at: '2025-11-01T10:00:00Z',
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/contractors',
        description: 'Add a new contractor.',
        bodyFields: [
          { name: 'first_name', type: 'string', required: true, description: 'First name' },
          { name: 'last_name', type: 'string', required: true, description: 'Last name' },
          { name: 'email', type: 'string', required: true, description: 'Email address' },
          { name: 'company', type: 'string', required: false, description: 'Company name' },
          { name: 'phone', type: 'string', required: false, description: 'Phone number' },
          { name: 'rate', type: 'number', required: false, description: 'Rate amount in NGN' },
          { name: 'rate_type', type: 'string', required: false, description: 'hourly, daily, or project' },
        ],
        exampleRequest: `curl -X POST ${BASE}/contractors \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "first_name": "Tunde",
    "last_name": "Bakare",
    "email": "tunde@cloudops.ng",
    "company": "CloudOps Nigeria",
    "rate": 120000,
    "rate_type": "daily"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'ctr_5e6f7a8b',
          first_name: 'Tunde',
          last_name: 'Bakare',
          email: 'tunde@cloudops.ng',
          company: 'CloudOps Nigeria',
          rate: 120000,
          rate_type: 'daily',
          status: 'active',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/contractors/:id',
        description: 'Update a contractor.',
        exampleRequest: `curl -X PATCH ${BASE}/contractors/ctr_8a1b2c3d \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"rate": 85000}'`,
        exampleResponse: JSON.stringify({
          id: 'ctr_8a1b2c3d',
          rate: 85000,
          updated_at: '2026-09-09T15:30:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: ListTodo,
    basePath: '/v1/tasks',
    description: 'Create, assign, and manage tasks across projects and folders.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/tasks',
        description: 'List tasks with filters.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'status', type: 'string', required: false, description: 'todo, in_progress, review, done' },
          { name: 'priority', type: 'string', required: false, description: 'low, medium, high, urgent' },
          { name: 'assignee_id', type: 'string', required: false, description: 'Filter by assignee employee ID' },
          { name: 'folder_id', type: 'string', required: false, description: 'Filter by folder/project' },
        ],
        exampleRequest: `curl "${BASE}/tasks?status=in_progress&priority=high" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'tsk_a1b2c3d4',
              title: 'Deploy payroll microservice to staging',
              description: 'Run full integration tests before production push',
              status: 'in_progress',
              priority: 'high',
              assignee_id: 'emp_2f8a9b1c',
              folder_id: 'fld_eng_001',
              due_date: '2026-09-15',
              created_at: '2026-09-05T09:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 7 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/tasks/:id',
        description: 'Get a single task by ID.',
        exampleRequest: `curl ${BASE}/tasks/tsk_a1b2c3d4 \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'tsk_a1b2c3d4',
          title: 'Deploy payroll microservice to staging',
          description: 'Run full integration tests before production push',
          status: 'in_progress',
          priority: 'high',
          assignee_id: 'emp_2f8a9b1c',
          folder_id: 'fld_eng_001',
          due_date: '2026-09-15',
          created_at: '2026-09-05T09:00:00Z',
          updated_at: '2026-09-08T14:00:00Z',
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/tasks',
        description: 'Create a new task.',
        bodyFields: [
          { name: 'title', type: 'string', required: true, description: 'Task title' },
          { name: 'description', type: 'string', required: false, description: 'Task details' },
          { name: 'priority', type: 'string', required: false, description: 'low, medium, high, urgent' },
          { name: 'due_date', type: 'string', required: false, description: 'ISO 8601 date' },
          { name: 'assignee_id', type: 'string', required: false, description: 'Employee ID to assign' },
          { name: 'folder_id', type: 'string', required: false, description: 'Folder/project ID' },
        ],
        exampleRequest: `curl -X POST ${BASE}/tasks \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Set up CI/CD pipeline for fleet module",
    "priority": "high",
    "due_date": "2026-09-20",
    "assignee_id": "emp_2f8a9b1c",
    "folder_id": "fld_eng_001"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'tsk_e5f6a7b8',
          title: 'Set up CI/CD pipeline for fleet module',
          status: 'todo',
          priority: 'high',
          due_date: '2026-09-20',
          assignee_id: 'emp_2f8a9b1c',
          folder_id: 'fld_eng_001',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/tasks/:id',
        description: 'Update a task.',
        exampleRequest: `curl -X PATCH ${BASE}/tasks/tsk_a1b2c3d4 \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"status": "done"}'`,
        exampleResponse: JSON.stringify({
          id: 'tsk_a1b2c3d4',
          status: 'done',
          updated_at: '2026-09-09T16:00:00Z',
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/v1/tasks/:id',
        description: 'Delete a task permanently.',
        exampleRequest: `curl -X DELETE ${BASE}/tasks/tsk_a1b2c3d4 \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({ deleted: true, id: 'tsk_a1b2c3d4' }, null, 2),
      },
    ],
  },
  {
    id: 'leaves',
    name: 'Leave Requests',
    icon: Calendar,
    basePath: '/v1/leaves',
    description: 'Submit and manage employee leave requests with approval workflows.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/leaves',
        description: 'List leave requests.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'status', type: 'string', required: false, description: 'pending, approved, rejected' },
          { name: 'employee_id', type: 'string', required: false, description: 'Filter by employee' },
          { name: 'leave_type', type: 'string', required: false, description: 'annual, sick, maternity, paternity, compassionate' },
        ],
        exampleRequest: `curl "${BASE}/leaves?status=pending" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'lv_3c4d5e6f',
              employee_id: 'emp_2f8a9b1c',
              employee_name: 'Chioma Okafor',
              leave_type: 'annual',
              start_date: '2026-09-20',
              end_date: '2026-09-27',
              days: 6,
              reason: 'Family vacation',
              status: 'pending',
              created_at: '2026-09-08T10:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 3 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/leaves/:id',
        description: 'Get a leave request by ID.',
        exampleRequest: `curl ${BASE}/leaves/lv_3c4d5e6f \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'lv_3c4d5e6f',
          employee_id: 'emp_2f8a9b1c',
          employee_name: 'Chioma Okafor',
          leave_type: 'annual',
          start_date: '2026-09-20',
          end_date: '2026-09-27',
          days: 6,
          reason: 'Family vacation',
          status: 'pending',
          created_at: '2026-09-08T10:00:00Z',
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/leaves',
        description: 'Submit a leave request.',
        bodyFields: [
          { name: 'employee_id', type: 'string', required: true, description: 'Employee ID' },
          { name: 'leave_type', type: 'string', required: true, description: 'annual, sick, maternity, paternity, compassionate' },
          { name: 'start_date', type: 'string', required: true, description: 'Start date (ISO 8601)' },
          { name: 'end_date', type: 'string', required: true, description: 'End date (ISO 8601)' },
          { name: 'reason', type: 'string', required: false, description: 'Reason for leave' },
        ],
        exampleRequest: `curl -X POST ${BASE}/leaves \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "employee_id": "emp_2f8a9b1c",
    "leave_type": "annual",
    "start_date": "2026-09-20",
    "end_date": "2026-09-27",
    "reason": "Family vacation"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'lv_3c4d5e6f',
          employee_id: 'emp_2f8a9b1c',
          leave_type: 'annual',
          start_date: '2026-09-20',
          end_date: '2026-09-27',
          days: 6,
          reason: 'Family vacation',
          status: 'pending',
          created_at: '2026-09-08T10:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/leaves/:id',
        description: 'Approve or reject a leave request.',
        bodyFields: [
          { name: 'status', type: 'string', required: true, description: 'approved or rejected' },
          { name: 'reviewer_notes', type: 'string', required: false, description: 'Notes from the reviewer' },
        ],
        exampleRequest: `curl -X PATCH ${BASE}/leaves/lv_3c4d5e6f \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"status": "approved", "reviewer_notes": "Approved. Enjoy your break!"}'`,
        exampleResponse: JSON.stringify({
          id: 'lv_3c4d5e6f',
          status: 'approved',
          reviewer_notes: 'Approved. Enjoy your break!',
          reviewed_at: '2026-09-09T11:00:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'expenses',
    name: 'Expenses',
    icon: Receipt,
    basePath: '/v1/expenses',
    description: 'Submit and manage expense claims with receipt tracking.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/expenses',
        description: 'List expense claims.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'status', type: 'string', required: false, description: 'pending, approved, rejected, reimbursed' },
          { name: 'category', type: 'string', required: false, description: 'travel, meals, supplies, equipment, other' },
        ],
        exampleRequest: `curl "${BASE}/expenses?status=pending" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'exp_7a8b9c0d',
              title: 'Client meeting transportation',
              amount: 15000,
              currency: 'NGN',
              category: 'travel',
              description: 'Uber rides to and from TechCabal conference',
              receipt_url: 'https://storage.kdops.ng/receipts/exp_7a8b9c0d.pdf',
              status: 'pending',
              submitted_by: 'emp_2f8a9b1c',
              created_at: '2026-09-07T16:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 5 },
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/expenses',
        description: 'Submit a new expense claim.',
        bodyFields: [
          { name: 'title', type: 'string', required: true, description: 'Expense title' },
          { name: 'amount', type: 'number', required: true, description: 'Amount in specified currency' },
          { name: 'currency', type: 'string', required: false, description: 'ISO currency code (default: NGN)' },
          { name: 'category', type: 'string', required: false, description: 'travel, meals, supplies, equipment, other' },
          { name: 'description', type: 'string', required: false, description: 'Details of the expense' },
          { name: 'receipt_url', type: 'string', required: false, description: 'URL to uploaded receipt' },
        ],
        exampleRequest: `curl -X POST ${BASE}/expenses \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Office supplies - whiteboard markers",
    "amount": 8500,
    "category": "supplies",
    "description": "Markers and erasers for engineering floor"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'exp_1e2f3a4b',
          title: 'Office supplies - whiteboard markers',
          amount: 8500,
          currency: 'NGN',
          category: 'supplies',
          status: 'pending',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/expenses/:id',
        description: 'Update or approve/reject an expense.',
        exampleRequest: `curl -X PATCH ${BASE}/expenses/exp_7a8b9c0d \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"status": "approved"}'`,
        exampleResponse: JSON.stringify({
          id: 'exp_7a8b9c0d',
          status: 'approved',
          approved_at: '2026-09-09T16:00:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'payroll',
    name: 'Payroll',
    icon: Banknote,
    basePath: '/v1/payroll',
    description: 'Access payroll run history and employee payslips.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/payroll/runs',
        description: 'List payroll runs.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'month', type: 'integer', required: false, description: 'Month (1-12)' },
          { name: 'year', type: 'integer', required: false, description: 'Year' },
        ],
        exampleRequest: `curl "${BASE}/payroll/runs?year=2026&month=8" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'pr_run_202608',
              month: 8,
              year: 2026,
              status: 'completed',
              total_gross: 42500000,
              total_net: 36200000,
              total_tax: 4800000,
              total_pension: 1500000,
              employee_count: 48,
              processed_at: '2026-08-28T09:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 1 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/payroll/runs/:id',
        description: 'Get details of a specific payroll run.',
        exampleRequest: `curl ${BASE}/payroll/runs/pr_run_202608 \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'pr_run_202608',
          month: 8,
          year: 2026,
          status: 'completed',
          total_gross: 42500000,
          total_net: 36200000,
          total_tax: 4800000,
          total_pension: 1500000,
          employee_count: 48,
          currency: 'NGN',
          processed_at: '2026-08-28T09:00:00Z',
          approved_by: 'emp_admin_001',
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/payroll/runs/:id/slips',
        description: 'Get all payslips for a payroll run.',
        exampleRequest: `curl ${BASE}/payroll/runs/pr_run_202608/slips \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'slip_a1b2c3',
              employee_id: 'emp_2f8a9b1c',
              employee_name: 'Chioma Okafor',
              gross_salary: 850000,
              tax: 85000,
              pension: 25500,
              net_salary: 739500,
              bank_name: 'Access Bank',
              account_number: '0123456789',
            },
          ],
          meta: { page: 1, per_page: 25, total: 48 },
        }, null, 2),
      },
    ],
  },
  {
    id: 'fleet',
    name: 'Fleet & Fuel',
    icon: Car,
    basePath: '/v1/fleet',
    description: 'Manage company vehicles, fuel requests, and trip logs.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/fleet/vehicles',
        description: 'List all vehicles in the fleet.',
        exampleRequest: `curl ${BASE}/fleet/vehicles \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'veh_001',
              make: 'Toyota',
              model: 'Hilux',
              year: 2024,
              plate_number: 'LAG-234-XY',
              status: 'active',
              assigned_driver: 'emp_4d7c1e3f',
              mileage_km: 34500,
            },
          ],
          meta: { page: 1, per_page: 25, total: 8 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/fleet/fuel-requests',
        description: 'List fuel requests.',
        exampleRequest: `curl ${BASE}/fleet/fuel-requests \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'fuel_a1b2',
              vehicle_id: 'veh_001',
              amount: 25000,
              litres: 42.5,
              station: 'Total Energies - Victoria Island',
              status: 'approved',
              requested_by: 'emp_4d7c1e3f',
              created_at: '2026-09-08T08:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 15 },
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/fleet/fuel-requests',
        description: 'Create a fuel request. Employee must have bank details on file for disbursement.',
        bodyFields: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle ID' },
          { name: 'amount', type: 'number', required: true, description: 'Amount in NGN' },
          { name: 'litres', type: 'number', required: false, description: 'Estimated litres' },
          { name: 'station', type: 'string', required: false, description: 'Fuel station name' },
          { name: 'notes', type: 'string', required: false, description: 'Additional notes' },
        ],
        notes: 'Employee must have bank details on file for disbursement.',
        exampleRequest: `curl -X POST ${BASE}/fleet/fuel-requests \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "vehicle_id": "veh_001",
    "amount": 30000,
    "litres": 50,
    "station": "NNPC Mega Station - Lekki"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'fuel_c3d4',
          vehicle_id: 'veh_001',
          amount: 30000,
          litres: 50,
          station: 'NNPC Mega Station - Lekki',
          status: 'pending',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/fleet/trips',
        description: 'List trip logs.',
        exampleRequest: `curl ${BASE}/fleet/trips \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'trip_x1y2',
              vehicle_id: 'veh_001',
              driver_id: 'emp_4d7c1e3f',
              start_location: 'Victoria Island Office',
              end_location: 'Ikeja Client Site',
              distance_km: 28.5,
              purpose: 'Client meeting - Q3 review',
              created_at: '2026-09-09T09:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 120 },
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/fleet/trips',
        description: 'Log a new trip.',
        bodyFields: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle ID' },
          { name: 'driver_id', type: 'string', required: true, description: 'Driver employee ID' },
          { name: 'start_location', type: 'string', required: true, description: 'Starting point' },
          { name: 'end_location', type: 'string', required: true, description: 'Destination' },
          { name: 'distance_km', type: 'number', required: false, description: 'Distance in kilometres' },
          { name: 'purpose', type: 'string', required: false, description: 'Trip purpose' },
        ],
        exampleRequest: `curl -X POST ${BASE}/fleet/trips \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "vehicle_id": "veh_001",
    "driver_id": "emp_4d7c1e3f",
    "start_location": "Victoria Island Office",
    "end_location": "Apapa Warehouse",
    "distance_km": 18,
    "purpose": "Inventory check"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'trip_z3a4',
          vehicle_id: 'veh_001',
          driver_id: 'emp_4d7c1e3f',
          start_location: 'Victoria Island Office',
          end_location: 'Apapa Warehouse',
          distance_km: 18,
          purpose: 'Inventory check',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'invoices',
    name: 'Invoices',
    icon: FileText,
    basePath: '/v1/invoices',
    description: 'Create and manage client invoices with line items and VAT.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/invoices',
        description: 'List invoices.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'status', type: 'string', required: false, description: 'draft, sent, paid, overdue, cancelled' },
          { name: 'client_id', type: 'string', required: false, description: 'Filter by client' },
        ],
        exampleRequest: `curl "${BASE}/invoices?status=sent" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'inv_2026_0042',
              client_id: 'cli_shell_ng',
              client_name: 'Shell Nigeria',
              status: 'sent',
              subtotal: 2500000,
              vat_rate: 7.5,
              vat_amount: 187500,
              total: 2687500,
              currency: 'NGN',
              due_date: '2026-10-01',
              issued_at: '2026-09-01T09:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 18 },
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/invoices',
        description: 'Create a new invoice.',
        bodyFields: [
          { name: 'client_id', type: 'string', required: true, description: 'Client ID' },
          { name: 'items', type: 'array', required: true, description: 'Line items: [{description, quantity, unit_price}]' },
          { name: 'due_date', type: 'string', required: false, description: 'Due date (ISO 8601)' },
          { name: 'vat_rate', type: 'number', required: false, description: 'VAT percentage (default: 7.5)' },
          { name: 'notes', type: 'string', required: false, description: 'Invoice notes' },
        ],
        exampleRequest: `curl -X POST ${BASE}/invoices \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_id": "cli_shell_ng",
    "items": [
      {"description": "DevOps consulting - September", "quantity": 1, "unit_price": 2500000}
    ],
    "due_date": "2026-10-15",
    "vat_rate": 7.5,
    "notes": "Payment due within 30 days"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'inv_2026_0043',
          client_id: 'cli_shell_ng',
          status: 'draft',
          items: [{ description: 'DevOps consulting - September', quantity: 1, unit_price: 2500000, total: 2500000 }],
          subtotal: 2500000,
          vat_rate: 7.5,
          vat_amount: 187500,
          total: 2687500,
          currency: 'NGN',
          due_date: '2026-10-15',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/invoices/:id',
        description: 'Update an invoice (draft only) or mark as sent/paid.',
        exampleRequest: `curl -X PATCH ${BASE}/invoices/inv_2026_0043 \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"status": "sent"}'`,
        exampleResponse: JSON.stringify({
          id: 'inv_2026_0043',
          status: 'sent',
          sent_at: '2026-09-09T16:00:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'clients',
    name: 'Clients',
    icon: Building2,
    basePath: '/v1/clients',
    description: 'Manage client records and contracts.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/clients',
        description: 'List clients.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'industry', type: 'string', required: false, description: 'Filter by industry' },
          { name: 'search', type: 'string', required: false, description: 'Search by name' },
        ],
        exampleRequest: `curl "${BASE}/clients?industry=oil_gas" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'cli_shell_ng',
              name: 'Shell Nigeria',
              industry: 'Oil & Gas',
              contact_person: 'Adaeze Ibe',
              contact_email: 'adaeze.ibe@shell.com.ng',
              phone: '+234 1 277 0000',
              contract_value: 15000000,
              status: 'active',
              created_at: '2025-01-15T09:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 6 },
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/clients',
        description: 'Create a new client.',
        bodyFields: [
          { name: 'name', type: 'string', required: true, description: 'Company name' },
          { name: 'industry', type: 'string', required: false, description: 'Industry sector' },
          { name: 'contact_person', type: 'string', required: false, description: 'Primary contact name' },
          { name: 'contact_email', type: 'string', required: false, description: 'Contact email' },
          { name: 'phone', type: 'string', required: false, description: 'Phone number' },
          { name: 'contract_value', type: 'number', required: false, description: 'Contract value in NGN' },
        ],
        exampleRequest: `curl -X POST ${BASE}/clients \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Dangote Industries",
    "industry": "Manufacturing",
    "contact_person": "Ibrahim Musa",
    "contact_email": "ibrahim.musa@dangote.com",
    "phone": "+234 1 448 0000",
    "contract_value": 25000000
  }'`,
        exampleResponse: JSON.stringify({
          id: 'cli_dangote',
          name: 'Dangote Industries',
          industry: 'Manufacturing',
          contact_person: 'Ibrahim Musa',
          contact_email: 'ibrahim.musa@dangote.com',
          status: 'active',
          contract_value: 25000000,
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/clients/:id',
        description: 'Update client details.',
        exampleRequest: `curl -X PATCH ${BASE}/clients/cli_dangote \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"contract_value": 30000000}'`,
        exampleResponse: JSON.stringify({
          id: 'cli_dangote',
          contract_value: 30000000,
          updated_at: '2026-09-09T16:00:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'recruitment',
    name: 'Recruitment',
    icon: UserPlus,
    basePath: '/v1/recruitment',
    description: 'Manage job openings and applicant tracking.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/recruitment/openings',
        description: 'List job openings.',
        exampleRequest: `curl ${BASE}/recruitment/openings \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'job_fe_dev',
              title: 'Senior Frontend Developer',
              department: 'Engineering',
              location: 'Lagos (Hybrid)',
              status: 'open',
              applicant_count: 23,
              created_at: '2026-08-15T09:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 4 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/recruitment/openings/:id',
        description: 'Get job opening details.',
        exampleRequest: `curl ${BASE}/recruitment/openings/job_fe_dev \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'job_fe_dev',
          title: 'Senior Frontend Developer',
          department: 'Engineering',
          location: 'Lagos (Hybrid)',
          description: 'We are looking for an experienced React/TypeScript developer...',
          requirements: ['5+ years React', 'TypeScript proficiency', 'System design experience'],
          salary_range: { min: 800000, max: 1200000, currency: 'NGN' },
          status: 'open',
          applicant_count: 23,
          created_at: '2026-08-15T09:00:00Z',
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/recruitment/applicants',
        description: 'List all applicants across openings.',
        exampleRequest: `curl ${BASE}/recruitment/applicants \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'app_k1l2m3',
              name: 'Oluwaseun Afolabi',
              email: 'seun.afolabi@gmail.com',
              opening_id: 'job_fe_dev',
              stage: 'technical_interview',
              applied_at: '2026-08-20T14:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 56 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/recruitment/openings/:id/applicants',
        description: 'List applicants for a specific opening.',
        exampleRequest: `curl ${BASE}/recruitment/openings/job_fe_dev/applicants \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'app_k1l2m3',
              name: 'Oluwaseun Afolabi',
              email: 'seun.afolabi@gmail.com',
              stage: 'technical_interview',
              applied_at: '2026-08-20T14:00:00Z',
            },
          ],
          meta: { page: 1, per_page: 25, total: 23 },
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/recruitment/applicants/:id',
        description: 'Update applicant stage.',
        bodyFields: [
          { name: 'stage', type: 'string', required: true, description: 'applied, screening, technical_interview, final_interview, offer, hired, rejected' },
        ],
        exampleRequest: `curl -X PATCH ${BASE}/recruitment/applicants/app_k1l2m3 \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"stage": "final_interview"}'`,
        exampleResponse: JSON.stringify({
          id: 'app_k1l2m3',
          stage: 'final_interview',
          updated_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
    ],
  },
  {
    id: 'data',
    name: 'Database (Custom Tables)',
    icon: Database,
    basePath: '/v1/data',
    description: 'Access custom database tables via the REST API. Supports CRUD operations on records within bases and tables.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/data/bases',
        description: 'List all bases.',
        exampleRequest: `curl ${BASE}/data/bases \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            { id: 'base_ops_001', name: 'Operations Hub', table_count: 5, created_at: '2025-06-01T09:00:00Z' },
            { id: 'base_crm_001', name: 'CRM', table_count: 3, created_at: '2025-08-15T09:00:00Z' },
          ],
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/data/bases/:baseId/tables',
        description: 'List tables in a base.',
        exampleRequest: `curl ${BASE}/data/bases/base_ops_001/tables \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            { id: 'tbl_inventory', name: 'Inventory', record_count: 342, fields: ['item_name', 'quantity', 'location', 'last_updated'] },
          ],
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/data/bases/:baseId/tables/:tableId/records',
        description: 'List records in a table.',
        params: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'per_page', type: 'integer', required: false, description: 'Items per page' },
          { name: 'sort', type: 'string', required: false, description: 'Field to sort by (prefix with - for desc)' },
          { name: 'filter', type: 'string', required: false, description: 'Filter expression, e.g. location=Lagos' },
        ],
        exampleRequest: `curl "${BASE}/data/bases/base_ops_001/tables/tbl_inventory/records?sort=-quantity&filter=location%3DLagos" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            { id: 'rec_001', fields: { item_name: 'Diesel Generator', quantity: 3, location: 'Lagos', last_updated: '2026-09-01' } },
            { id: 'rec_002', fields: { item_name: 'Safety Helmets', quantity: 150, location: 'Lagos', last_updated: '2026-08-28' } },
          ],
          meta: { page: 1, per_page: 25, total: 42 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/v1/data/bases/:baseId/tables/:tableId/records/:recordId',
        description: 'Get a single record.',
        exampleRequest: `curl ${BASE}/data/bases/base_ops_001/tables/tbl_inventory/records/rec_001 \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: 'rec_001',
          fields: { item_name: 'Diesel Generator', quantity: 3, location: 'Lagos', last_updated: '2026-09-01' },
          created_at: '2025-06-15T09:00:00Z',
          updated_at: '2026-09-01T14:30:00Z',
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/data/bases/:baseId/tables/:tableId/records',
        description: 'Create records (max 10 per request).',
        bodyFields: [
          { name: 'records', type: 'array', required: true, description: 'Array of {fields: {...}} objects, max 10' },
        ],
        exampleRequest: `curl -X POST ${BASE}/data/bases/base_ops_001/tables/tbl_inventory/records \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {"fields": {"item_name": "Fire Extinguisher", "quantity": 20, "location": "Abuja"}}
    ]
  }'`,
        exampleResponse: JSON.stringify({
          created: [{ id: 'rec_003', fields: { item_name: 'Fire Extinguisher', quantity: 20, location: 'Abuja' } }],
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/data/bases/:baseId/tables/:tableId/records',
        description: 'Update records. Pass an array of {id, fields} objects.',
        exampleRequest: `curl -X PATCH ${BASE}/data/bases/base_ops_001/tables/tbl_inventory/records \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {"id": "rec_001", "fields": {"quantity": 5}}
    ]
  }'`,
        exampleResponse: JSON.stringify({
          updated: [{ id: 'rec_001', fields: { item_name: 'Diesel Generator', quantity: 5, location: 'Lagos' } }],
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/v1/data/bases/:baseId/tables/:tableId/records',
        description: 'Delete records. Pass record IDs in body.',
        bodyFields: [
          { name: 'record_ids', type: 'array', required: true, description: 'Array of record ID strings' },
        ],
        exampleRequest: `curl -X DELETE ${BASE}/data/bases/base_ops_001/tables/tbl_inventory/records \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"record_ids": ["rec_003"]}'`,
        exampleResponse: JSON.stringify({ deleted: ['rec_003'] }, null, 2),
      },
    ],
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    icon: Webhook,
    basePath: '/v1/webhooks',
    description: 'Subscribe to platform events and receive real-time HTTP callbacks.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/webhooks',
        description: 'List webhook subscriptions.',
        exampleRequest: `curl ${BASE}/webhooks \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          data: [
            {
              id: 'wh_a1b2c3',
              url: 'https://myapp.ng/webhooks/kdops',
              events: ['employee.created', 'task.updated', 'payroll.completed'],
              status: 'active',
              created_at: '2026-07-01T09:00:00Z',
              last_triggered_at: '2026-09-09T14:00:00Z',
            },
          ],
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/webhooks',
        description: 'Create a webhook subscription.',
        bodyFields: [
          { name: 'url', type: 'string', required: true, description: 'HTTPS endpoint to receive events' },
          { name: 'events', type: 'array', required: true, description: 'Event types to subscribe to (e.g. employee.created, task.form_submitted, payment.completed)' },
          { name: 'secret', type: 'string', required: false, description: 'Signing secret for payload verification' },
        ],
        exampleRequest: `curl -X POST ${BASE}/webhooks \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://myapp.ng/webhooks/kdops",
    "events": ["employee.created", "employee.updated", "payroll.completed"],
    "secret": "whsec_my_signing_secret"
  }'`,
        exampleResponse: JSON.stringify({
          id: 'wh_d4e5f6',
          url: 'https://myapp.ng/webhooks/kdops',
          events: ['employee.created', 'employee.updated', 'payroll.completed'],
          status: 'active',
          secret: 'whsec_my_signing_secret',
          created_at: '2026-09-09T15:00:00Z',
        }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/v1/webhooks/:id',
        description: 'Update a webhook subscription.',
        exampleRequest: `curl -X PATCH ${BASE}/webhooks/wh_d4e5f6 \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"events": ["employee.created", "task.created", "task.form_submitted"]}'`,
        exampleResponse: JSON.stringify({
          id: 'wh_d4e5f6',
          events: ['employee.created', 'task.created', 'task.form_submitted'],
          updated_at: '2026-09-09T16:00:00Z',
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/v1/webhooks/:id',
        description: 'Remove a webhook subscription.',
        exampleRequest: `curl -X DELETE ${BASE}/webhooks/wh_d4e5f6 \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({ deleted: true, id: 'wh_d4e5f6' }, null, 2),
      },
    ],
  },
];

/* ─── Endpoint Card ─── */

function EndpointCard({ endpoint, moduleId }: { endpoint: Endpoint; moduleId: string }) {
  const [open, setOpen] = useState(false);
  const anchorId = `${moduleId}-${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[/:]/g, '-').replace(/^-+|-+$/g, '')}`;
  const fields = endpoint.bodyFields || endpoint.params;

  return (
    <div id={anchorId} className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden scroll-mt-24">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <MethodBadge method={endpoint.method} />
        <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 flex-1 truncate">
          {endpoint.path}
        </code>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block max-w-[40%] truncate">
          {endpoint.description}
        </span>
        {open ? <ChevronDown size={14} className="text-zinc-400 shrink-0" /> : <ChevronRight size={14} className="text-zinc-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-4 space-y-4 bg-white dark:bg-zinc-900/30">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{endpoint.description}</p>

          {endpoint.notes && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
              <ArrowRight size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-400">{endpoint.notes}</span>
            </div>
          )}

          {/* Auth note */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Lock size={12} />
            <span>Bearer token required (API key with appropriate scope)</span>
          </div>

          {/* Parameters or Body */}
          {fields && fields.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                {endpoint.bodyFields ? 'Request Body' : 'Query Parameters'}
              </h4>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700/80">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-zinc-50 dark:bg-zinc-800/60">
                      <TableHead className="text-2xs font-semibold text-zinc-500 dark:text-zinc-400 h-8">Name</TableHead>
                      <TableHead className="text-2xs font-semibold text-zinc-500 dark:text-zinc-400 h-8">Type</TableHead>
                      <TableHead className="text-2xs font-semibold text-zinc-500 dark:text-zinc-400 h-8">Required</TableHead>
                      <TableHead className="text-2xs font-semibold text-zinc-500 dark:text-zinc-400 h-8">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((f) => (
                      <TableRow key={f.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                        <TableCell className="text-xs font-mono text-zinc-700 dark:text-zinc-300 py-2">{f.name}</TableCell>
                        <TableCell className="text-2xs text-zinc-500 dark:text-zinc-400 py-2">{f.type}</TableCell>
                        <TableCell className="py-2">
                          {f.required ? (
                            <Badge variant="secondary" className="text-3xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100">
                              Required
                            </Badge>
                          ) : (
                            <span className="text-3xs text-zinc-400">Optional</span>
                          )}
                        </TableCell>
                        <TableCell className="text-2xs text-zinc-600 dark:text-zinc-400 py-2">{f.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Example request */}
          <CodeBlock label="Example Request" code={endpoint.exampleRequest} language="bash" />

          {/* Example response */}
          <CodeBlock label="Example Response" code={endpoint.exampleResponse} language="json" />
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */

export default function ApiReference() {
  const [search, setSearch] = useState('');
  const [activeModule, setActiveModule] = useState('authentication');
  const mainRef = useRef<HTMLDivElement>(null);

  const filteredModules = useMemo(() => {
    if (!search.trim()) return MODULES;
    const q = search.toLowerCase();
    return MODULES.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.basePath.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.endpoints.some(
          (e) =>
            e.path.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q)
        )
    );
  }, [search]);

  const scrollToModule = useCallback((id: string) => {
    setActiveModule(id);
    const el = document.getElementById(`module-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Track active module on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('module-', '');
            setActiveModule(id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    MODULES.forEach((m) => {
      const el = document.getElementById(`module-${m.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex gap-6 min-h-[calc(100vh-200px)]">
      {/* Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-28 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search endpoints..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <ScrollArea className="h-[calc(100vh-260px)]">
            <nav className="space-y-0.5 pr-3">
              {filteredModules.map((m) => (
                <button
                  key={m.id}
                  onClick={() => scrollToModule(m.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors',
                    activeModule === m.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                  )}
                >
                  <m.icon size={13} className="shrink-0" />
                  <span className="truncate">{m.name}</span>
                  <span className="ml-auto text-3xs text-zinc-400 dark:text-zinc-500 font-mono">
                    {m.endpoints.length}
                  </span>
                </button>
              ))}
            </nav>
          </ScrollArea>
        </div>
      </aside>

      {/* Main content */}
      <main ref={mainRef} className="flex-1 min-w-0 space-y-10 pb-20">
        {/* Intro card */}
        <Card className="p-5 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Authentication & Conventions</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Authorization Header</p>
                <CodeBlock
                  label="Header"
                  code={`Authorization: Bearer kdops_live_abc123...
Content-Type: application/json`}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Error Format</p>
                <CodeBlock
                  label="Error Response"
                  code={JSON.stringify({ error: { code: 'not_found', message: 'Employee not found' } }, null, 2)}
                  language="json"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-2xs text-zinc-500 dark:text-zinc-400 pt-1">
              <span><strong className="text-zinc-700 dark:text-zinc-300">Rate Limit:</strong> 100 req/min per key (429 when exceeded)</span>
              <span><strong className="text-zinc-700 dark:text-zinc-300">Pagination:</strong> ?page=1&per_page=25 (default 25, max 100)</span>
              <span><strong className="text-zinc-700 dark:text-zinc-300">Base URL:</strong> <code className="font-mono">https://api.kdops.ng/v1</code></span>
            </div>
          </div>
        </Card>

        {/* Modules */}
        {filteredModules.map((m) => (
          <section key={m.id} id={`module-${m.id}`} className="scroll-mt-24 space-y-3">
            {/* Module header */}
            <div className="flex items-center gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <m.icon size={16} className="text-zinc-600 dark:text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{m.name}</h3>
                  <code className="text-3xs font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                    {m.basePath}
                  </code>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{m.description}</p>
              </div>
            </div>

            {/* Endpoints */}
            <div className="space-y-2">
              {m.endpoints.map((ep, i) => (
                <EndpointCard key={i} endpoint={ep} moduleId={m.id} />
              ))}
            </div>
          </section>
        ))}

        {filteredModules.length === 0 && (
          <div className="text-center py-16">
            <Search size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No endpoints match "{search}"</p>
          </div>
        )}
      </main>
    </div>
  );
}
