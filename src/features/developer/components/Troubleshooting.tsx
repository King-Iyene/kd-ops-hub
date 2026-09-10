import { useState, useCallback, useMemo } from 'react';
import {
  Search, Copy, Check, ChevronDown, ChevronRight, Shield, Clock, Bug,
  HelpCircle, ExternalLink, CheckCircle2, XCircle, AlertCircle, Code2,
  Terminal, Zap, AlertTriangle, Webhook,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
      <pre className="p-3 text-xs leading-relaxed overflow-x-auto bg-zinc-50 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ─── Status Code Data ─── */

interface StatusCodeEntry {
  code: number;
  meaning: string;
  action: string;
  color: 'green' | 'red' | 'amber' | 'blue';
}

const STATUS_CODES: StatusCodeEntry[] = [
  { code: 200, meaning: 'Success', action: 'Request completed. Parse the response body.', color: 'green' },
  { code: 201, meaning: 'Created', action: 'Resource was created successfully.', color: 'green' },
  { code: 400, meaning: 'Bad Request', action: 'Check your request body — a required field is missing or has the wrong type. The error message tells you which field.', color: 'red' },
  { code: 401, meaning: 'Unauthorized', action: "Your API key is missing, invalid, revoked, or expired. Go to API Keys → create a new one.", color: 'red' },
  { code: 403, meaning: 'Forbidden', action: "Your key doesn't have the required scope. E.g., you need employees:write to create employees. Create a new key with the right scopes.", color: 'red' },
  { code: 404, meaning: 'Not Found', action: "The resource doesn't exist. Check the ID in your URL. For employees, use the UUID, not the name.", color: 'amber' },
  { code: 409, meaning: 'Conflict', action: 'A resource with that unique field already exists (e.g., duplicate email).', color: 'amber' },
  { code: 422, meaning: 'Unprocessable', action: 'Validation failed. The error message lists what\'s wrong — e.g., "email must be a valid email address".', color: 'amber' },
  { code: 429, meaning: 'Too Many Requests', action: 'Rate limited. Wait 60 seconds and retry. Consider adding delays between batch requests.', color: 'red' },
  { code: 500, meaning: 'Server Error', action: 'Something went wrong on our end. Retry after a few seconds. If persistent, check the KDOps status.', color: 'red' },
];

function statusBadgeClasses(color: StatusCodeEntry['color']) {
  switch (color) {
    case 'green': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
    case 'red': return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
    case 'amber': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
    case 'blue': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400';
  }
}

/* ─── Troubleshooting Sections ─── */

type Severity = 'critical' | 'common' | 'tip';

interface TroubleshootingSection {
  id: string;
  title: string;
  icon: React.ElementType;
  severity: Severity;
  items: TroubleshootingItem[];
}

interface TroubleshootingItem {
  question: string;
  answer: React.ReactNode;
}

function severityColor(s: Severity) {
  switch (s) {
    case 'critical': return 'border-red-300 dark:border-red-800/60';
    case 'common': return 'border-amber-300 dark:border-amber-800/60';
    case 'tip': return 'border-blue-300 dark:border-blue-800/60';
  }
}

function severityBadge(s: Severity) {
  switch (s) {
    case 'critical': return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 text-3xs">Critical</Badge>;
    case 'common': return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-3xs">Common</Badge>;
    case 'tip': return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 text-3xs">Tip</Badge>;
  }
}

const SECTIONS: TroubleshootingSection[] = [
  {
    id: 'auth',
    title: 'Authentication Issues',
    icon: Shield,
    severity: 'critical',
    items: [
      {
        question: '"401 Unauthorized" on every request',
        answer: (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><span className="text-red-500 mt-0.5"><XCircle size={14} /></span>Make sure your header is exactly: <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Authorization: Bearer kdops_xxxxxxxxxxxx</code></li>
              <li className="flex gap-2"><span className="text-red-500 mt-0.5"><XCircle size={14} /></span>No extra spaces, no quotes around the key</li>
              <li className="flex gap-2"><span className="text-red-500 mt-0.5"><XCircle size={14} /></span>The key must start with <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">kdops_</code></li>
              <li className="flex gap-2"><span className="text-red-500 mt-0.5"><XCircle size={14} /></span>Check the key isn't revoked (API Keys tab &rarr; look for your key)</li>
              <li className="flex gap-2"><span className="text-red-500 mt-0.5"><XCircle size={14} /></span>Check the key hasn't expired</li>
            </ul>
          </div>
        ),
      },
      {
        question: '"403 Forbidden" — wrong scopes',
        answer: (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Each module requires specific scopes:</p>
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Reading employees &rarr; <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">employees:read</code> or <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">*:read</code></li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Creating tasks &rarr; <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">tasks:write</code> or <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">*:write</code></li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Deleting database records &rarr; <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">data:delete</code> or <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">*:delete</code></li>
            </ul>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">You can't add scopes to an existing key &mdash; create a new key with the right scopes.</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Wildcard scopes (<code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">*:read</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">*:write</code>) give access to ALL modules.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'request-format',
    title: 'Request Format Issues',
    icon: Code2,
    severity: 'common',
    items: [
      {
        question: '"400 Bad Request" — malformed JSON',
        answer: (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Make sure your JSON is valid (no trailing commas, all strings in double quotes)</li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Use a JSON validator: <a href="https://jsonlint.com" target="_blank" rel="noopener" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">jsonlint.com <ExternalLink size={10} /></a></li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Common mistake: sending form-encoded data instead of JSON &mdash; set <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Content-Type: application/json</code></li>
            </ul>
          </div>
        ),
      },
      {
        question: '"422 Unprocessable" — validation errors',
        answer: (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Read the error message carefully &mdash; it tells you exactly what's wrong. Common issues:</p>
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Missing required fields (<code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">first_name</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">last_name</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">email</code> for employees)</li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Invalid email format</li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Date not in <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">YYYY-MM-DD</code> format</li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Role must be one of: <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">super_admin</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">admin</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">finance</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">operations</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">field_staff</code></li>
            </ul>
          </div>
        ),
      },
      {
        question: 'Dates and times format',
        answer: (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><span className="text-blue-500 mt-0.5"><CheckCircle2 size={14} /></span>Always use ISO 8601 format: <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">2026-09-15</code> for dates, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">2026-09-15T14:30:00Z</code> for datetimes</li>
              <li className="flex gap-2"><span className="text-blue-500 mt-0.5"><CheckCircle2 size={14} /></span>All times are UTC unless specified otherwise</li>
              <li className="flex gap-2"><span className="text-blue-500 mt-0.5"><CheckCircle2 size={14} /></span>Nigerian time is UTC+1 (WAT)</li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    id: 'rate-limiting',
    title: 'Rate Limiting',
    icon: Clock,
    severity: 'critical',
    items: [
      {
        question: '"429 Too Many Requests"',
        answer: (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><span className="text-red-500 mt-0.5"><AlertTriangle size={14} /></span>Limit: <strong>100 requests per minute</strong> per API key</li>
              <li className="flex gap-2"><span className="text-red-500 mt-0.5"><AlertTriangle size={14} /></span>The 429 response includes a <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Retry-After</code> header (seconds to wait)</li>
              <li className="flex gap-2"><span className="text-blue-500 mt-0.5"><CheckCircle2 size={14} /></span>For bulk operations: add a <strong>1-second delay</strong> between requests</li>
              <li className="flex gap-2"><span className="text-blue-500 mt-0.5"><CheckCircle2 size={14} /></span>For very large imports: use bulk endpoints where available (database module supports up to 10 records per request)</li>
              <li className="flex gap-2"><span className="text-blue-500 mt-0.5"><CheckCircle2 size={14} /></span>Consider using multiple API keys for parallel workflows (but respect fair use)</li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    id: 'employees',
    title: 'Employees Module',
    icon: Bug,
    severity: 'common',
    items: [
      {
        question: '"Employee already exists"',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Email must be unique across all employees. Check if an employee with the same email already exists (including soft-deleted records).</p>,
      },
      {
        question: "Can't delete an employee",
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Employees are <strong>soft-deleted</strong> &mdash; the status changes but the record stays in the database. This is by design to preserve audit trails.</p>,
      },
      {
        question: 'Missing salary field',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Salary is optional on creation and can be added later via PATCH.</p>,
      },
      {
        question: 'Bank details for payroll',
        answer: (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Required for payroll processing. Fields: <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">bank_name</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">account_number</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">account_name</code>.</p>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Without these, payroll will skip the employee.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'tasks',
    title: 'Tasks Module',
    icon: Bug,
    severity: 'common',
    items: [
      {
        question: 'Task not showing in KDOps',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Check the <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">folder_id</code> &mdash; tasks need to belong to a folder to appear in the UI.</p>,
      },
      {
        question: "Can't assign a task",
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">The <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">assignee_id</code> must be a valid employee UUID.</p>,
      },
      {
        question: 'Valid task status values',
        answer: (
          <div className="flex flex-wrap gap-2">
            {['pending', 'in_progress', 'completed', 'cancelled'].map(s => (
              <code key={s} className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300">{s}</code>
            ))}
          </div>
        ),
      },
    ],
  },
  {
    id: 'leave',
    title: 'Leave Requests',
    icon: Bug,
    severity: 'common',
    items: [
      {
        question: '"Insufficient balance"',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">The employee doesn't have enough leave days of that type remaining.</p>,
      },
      {
        question: 'Valid leave types',
        answer: (
          <div className="flex flex-wrap gap-2">
            {['annual', 'sick', 'casual', 'maternity', 'paternity', 'compassionate', 'unpaid'].map(t => (
              <code key={t} className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300">{t}</code>
            ))}
          </div>
        ),
      },
      {
        question: "Can't approve own leave",
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">The approver must be a different employee from the requester.</p>,
      },
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses Module',
    icon: Bug,
    severity: 'common',
    items: [
      {
        question: 'Amount format',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Amount is in <strong>Naira (NGN), not kobo</strong>. For example, &#x20A6;15,000 is <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">15000</code>, not <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">1500000</code>.</p>,
      },
      {
        question: 'Valid expense categories',
        answer: (
          <div className="flex flex-wrap gap-2">
            {['transport', 'meals', 'supplies', 'accommodation', 'training', 'other'].map(c => (
              <code key={c} className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300">{c}</code>
            ))}
          </div>
        ),
      },
      {
        question: 'Receipt URL',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Optional but recommended for approval. Attach a URL to a hosted receipt image.</p>,
      },
    ],
  },
  {
    id: 'fleet',
    title: 'Fleet & Fuel',
    icon: AlertTriangle,
    severity: 'critical',
    items: [
      {
        question: 'Fuel request payment not processing',
        answer: (
          <div className="space-y-2">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2"><AlertTriangle size={14} /> CRITICAL: Bank details required</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">Fuel request disbursements ONLY work if the requesting employee has valid bank details on file (<code className="text-xs font-mono">bank_name</code>, <code className="text-xs font-mono">account_number</code>, <code className="text-xs font-mono">account_name</code>). Without bank details, the request will be created but payment cannot be processed.</p>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Always remind employees to update their bank details in their profile.</p>
          </div>
        ),
      },
      {
        question: 'Vehicle must exist first',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Create the vehicle record before creating fuel requests against it.</p>,
      },
      {
        question: 'Trip logging requirements',
        answer: (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Required fields: <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">vehicle_id</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">driver_id</code> (must be a valid employee), <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">start_location</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">end_location</code>.
          </p>
        ),
      },
    ],
  },
  {
    id: 'invoices',
    title: 'Invoices Module',
    icon: Bug,
    severity: 'common',
    items: [
      {
        question: 'Client must exist first',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Create the client first via <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">/clients</code> before creating an invoice.</p>,
      },
      {
        question: 'Items array format',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Each item needs <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">description</code> and <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">amount</code>. VAT rate is a percentage (e.g., <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">7.5</code> for 7.5%).</p>,
      },
      {
        question: 'Invoice status flow',
        answer: (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <code className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">draft</code>
            <span>&rarr;</span>
            <code className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">sent</code>
            <span>&rarr;</span>
            <code className="px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-xs font-mono text-emerald-700 dark:text-emerald-400">paid</code>
            <span>/</span>
            <code className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-xs font-mono text-red-700 dark:text-red-400">overdue</code>
          </div>
        ),
      },
    ],
  },
  {
    id: 'database',
    title: 'Database (Custom Tables)',
    icon: Bug,
    severity: 'common',
    items: [
      {
        question: 'Referencing bases and tables',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Base and table can be referenced by UUID or slug.</p>,
      },
      {
        question: 'Record format',
        answer: (
          <CodeBlock
            label="Records format"
            language="JSON"
            code={`{
  "records": [
    {
      "fields": {
        "Name": "value"
      }
    }
  ]
}`}
          />
        ),
      },
      {
        question: 'Max records per request',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Maximum <strong>10 records</strong> per POST request.</p>,
      },
      {
        question: 'Unknown field names',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Unknown field names auto-create new columns. Be careful with typos!</p>,
      },
      {
        question: 'Formula/lookup fields',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Formula and lookup fields are <strong>read-only</strong> &mdash; you can't set them via API.</p>,
      },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhook Issues',
    icon: Webhook,
    severity: 'common',
    items: [
      {
        question: 'Webhook not receiving events',
        answer: (
          <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Is the webhook active? (check the toggle in Webhooks tab)</li>
            <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Is your endpoint publicly accessible? (localhost won't work)</li>
            <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Check the failure count &mdash; if &gt; 5 failures, the webhook may be auto-disabled</li>
            <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Test with the "Test" button first to verify your endpoint responds with 200</li>
            <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>Make sure you selected the right events</li>
          </ul>
        ),
      },
      {
        question: '"Invalid input syntax for type uuid" when creating webhooks or API keys',
        answer: (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">This error occurs when the system tries to store a string value (like <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">'platform'</code>) in a UUID-type column.</p>
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2"><span className="text-emerald-500 mt-0.5"><CheckCircle2 size={14} /></span><strong>Fix:</strong> Use a valid UUID value — the platform sentinel UUID is <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">00000000-0000-0000-0000-000000000000</code></li>
              <li className="flex gap-2"><span className="text-emerald-500 mt-0.5"><CheckCircle2 size={14} /></span>This applies to <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">base_id</code> in webhooks and <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">workspace_id</code> in API keys</li>
              <li className="flex gap-2"><span className="text-amber-500 mt-0.5"><AlertCircle size={14} /></span>If you see 400 errors on Supabase realtime channels, this is likely the same root cause</li>
            </ul>
          </div>
        ),
      },
      {
        question: 'Webhook signature verification',
        answer: (
          <div className="space-y-3">
            <CodeBlock
              label="Signature Verification"
              language="Python"
              code={`import hmac, hashlib

def verify_signature(body: bytes, secret: str, signature: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)

# In your webhook handler:
# signature = request.headers.get("X-KDOps-Signature")
# is_valid = verify_signature(request.body, "your_secret", signature)`}
            />
          </div>
        ),
      },
      {
        question: 'Webhook payload format',
        answer: (
          <CodeBlock
            label="Payload Example"
            language="JSON"
            code={`{
  "event": "employee.created",
  "timestamp": "2026-09-15T10:30:00Z",
  "data": {
    "id": "uuid-here",
    "first_name": "Chioma",
    "last_name": "Okafor",
    "email": "chioma@company.com",
    "department": "Engineering"
  }
}`}
          />
        ),
      },
    ],
  },
  {
    id: 'n8n',
    title: 'n8n Specific Issues',
    icon: Terminal,
    severity: 'tip',
    items: [
      {
        question: '"Connection refused" in n8n',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">n8n needs to reach the KDOps API &mdash; check your firewall/proxy settings.</p>,
      },
      {
        question: '"Invalid JSON" in n8n',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Make sure you're using <strong>JSON body type</strong>, not form data.</p>,
      },
      {
        question: 'Webhook trigger URL',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Use the <strong>"Production" URL</strong>, not "Test" URL for live workflows.</p>,
      },
      {
        question: 'Storing credentials',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Store your API key in n8n Credentials (Header Auth type), not hardcoded in nodes.</p>,
      },
    ],
  },
  {
    id: 'zapier',
    title: 'Zapier Specific Issues',
    icon: Zap,
    severity: 'tip',
    items: [
      {
        question: '"Task Halted" in Zapier',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Usually a 4xx error. Check the Zap history for detailed error info.</p>,
      },
      {
        question: 'Full header control',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Use "Custom Request" instead of "POST" if you need full control over headers.</p>,
      },
      {
        question: 'Zapier rate limits',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Zapier has its own rate limits &mdash; space out Zap runs if you're hitting issues.</p>,
      },
    ],
  },
  {
    id: 'make',
    title: 'Make (Integromat) Specific Issues',
    icon: Terminal,
    severity: 'tip',
    items: [
      {
        question: '"Communication error" in Make',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Check the URL is correct and the API is reachable from Make's servers.</p>,
      },
      {
        question: 'Parse response setting',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Set <strong>"Parse response"</strong> to <strong>Yes</strong> to get structured data back.</p>,
      },
      {
        question: 'Avoiding rate limits',
        answer: <p className="text-sm text-zinc-600 dark:text-zinc-400">Use the <strong>"Sleep" module</strong> between bulk operations to avoid rate limits.</p>,
      },
    ],
  },
];

/* ─── Checklist Items ─── */

const CHECKLIST_ITEMS = [
  { label: 'Is your API key valid? (not revoked, not expired)' },
  { label: <>Does the key have the right scopes? (e.g., <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">employees:read</code> for GET /employees)</> },
  { label: <>Is the URL correct? Base: <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-3xs">https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/platform-api/v1</code></> },
  { label: <>Are you sending the Authorization header? (<code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Bearer kdops_xxxxx</code>)</> },
  { label: <>Is Content-Type set to <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">application/json</code> for POST/PATCH?</> },
  { label: 'Are you within the rate limit? (100 requests/minute per key)' },
];

/* ─── Main Component ─── */

export default function Troubleshooting({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [helpfulSections, setHelpfulSections] = useState<Record<string, boolean | null>>({});

  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleItem = useCallback((key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleChecked = useCallback((idx: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTIONS;
    const q = searchQuery.toLowerCase();
    return SECTIONS.map(section => {
      const titleMatch = section.title.toLowerCase().includes(q);
      const matchedItems = section.items.filter(item =>
        item.question.toLowerCase().includes(q)
      );
      if (titleMatch) return section;
      if (matchedItems.length > 0) return { ...section, items: matchedItems };
      return null;
    }).filter(Boolean) as TroubleshootingSection[];
  }, [searchQuery]);

  // Auto-expand sections matching search
  const effectiveSections = useMemo(() => {
    if (searchQuery.trim()) {
      return new Set(filteredSections.map(s => s.id));
    }
    return openSections;
  }, [searchQuery, filteredSections, openSections]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
        <Input
          placeholder="Search troubleshooting topics..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
        />
      </div>

      {/* Quick Diagnostics Checklist */}
      <Card className="border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={18} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Quick Diagnostics Checklist</h3>
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 text-3xs">Start here</Badge>
          </div>
          <div className="space-y-2.5">
            {CHECKLIST_ITEMS.map((item, idx) => (
              <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={checkedItems.has(idx)}
                    onChange={() => toggleChecked(idx)}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 dark:bg-zinc-800"
                  />
                </div>
                <span className={cn(
                  'text-sm transition-colors',
                  checkedItems.has(idx)
                    ? 'text-zinc-400 dark:text-zinc-500 line-through'
                    : 'text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100'
                )}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* HTTP Status Codes Reference */}
      <Card className="border-zinc-200 dark:border-zinc-700/80">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={18} className="text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">HTTP Status Codes Reference</h3>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700/80">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60">
                  <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400 w-20">Code</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400 w-36">Meaning</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">What to Do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {STATUS_CODES.map(sc => (
                  <tr key={sc.code} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold', statusBadgeClasses(sc.color))}>
                        {sc.code}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-zinc-700 dark:text-zinc-300">{sc.meaning}</td>
                    <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">{sc.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Common Issues - Expandable Sections */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bug size={18} className="text-zinc-500 dark:text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Common Issues</h3>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">({filteredSections.length} {filteredSections.length === 1 ? 'section' : 'sections'})</span>
        </div>

        {filteredSections.length === 0 && (
          <Card className="border-zinc-200 dark:border-zinc-700/80">
            <CardContent className="p-8 text-center">
              <HelpCircle size={32} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No matching issues found. Try a different search term.</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filteredSections.map(section => {
            const Icon = section.icon;
            const isOpen = effectiveSections.has(section.id);
            return (
              <Card key={section.id} className={cn('border transition-colors', severityColor(section.severity))}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  {isOpen
                    ? <ChevronDown size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                    : <ChevronRight size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                  }
                  <Icon size={16} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1">{section.title}</span>
                  {severityBadge(section.severity)}
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{section.items.length} {section.items.length === 1 ? 'issue' : 'issues'}</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-1">
                    {section.items.map((item, idx) => {
                      const itemKey = `${section.id}-${idx}`;
                      const itemOpen = openItems.has(itemKey) || !!searchQuery.trim();
                      return (
                        <div key={idx} className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                          <button
                            onClick={() => toggleItem(itemKey)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                          >
                            {itemOpen
                              ? <ChevronDown size={14} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                              : <ChevronRight size={14} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
                            }
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.question}</span>
                          </button>
                          {itemOpen && (
                            <div className="px-3 pb-3 pl-8">
                              {item.answer}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Was this helpful? */}
                    <div className="flex items-center gap-2 pt-2 pl-1">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Was this helpful?</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn('h-6 px-2 text-xs', helpfulSections[section.id] === true && 'text-emerald-600 dark:text-emerald-400')}
                        onClick={() => setHelpfulSections(prev => ({ ...prev, [section.id]: true }))}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn('h-6 px-2 text-xs', helpfulSections[section.id] === false && 'text-red-600 dark:text-red-400')}
                        onClick={() => setHelpfulSections(prev => ({ ...prev, [section.id]: false }))}
                      >
                        No
                      </Button>
                      {helpfulSections[section.id] !== undefined && helpfulSections[section.id] !== null && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">Thanks for your feedback!</span>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Getting Help */}
      <Card className="border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-800/20">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={18} className="text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Still stuck?</h3>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">Check these resources:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={() => onNavigate?.('reference')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors text-left">
              <Code2 size={14} className="text-blue-500" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">API Reference</span>
              <ExternalLink size={10} className="ml-auto text-zinc-400" />
            </button>
            <button onClick={() => onNavigate?.('explorer')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors text-left">
              <Terminal size={14} className="text-emerald-500" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">API Explorer</span>
              <ExternalLink size={10} className="ml-auto text-zinc-400" />
            </button>
            <button onClick={() => onNavigate?.('guides')} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors text-left">
              <Zap size={14} className="text-amber-500" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Integration Guides</span>
              <ExternalLink size={10} className="ml-auto text-zinc-400" />
            </button>
            <a
              href="mailto:code@kdsquares.com"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <HelpCircle size={14} className="text-purple-500" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Contact code@kdsquares.com</span>
              <ExternalLink size={10} className="ml-auto text-zinc-400" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
