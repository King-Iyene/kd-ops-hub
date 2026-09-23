import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Search, Copy, Check, ChevronDown, ChevronRight, Lock,
  Database, Webhook, Shield, ArrowRight,
  Table2, Rows3, Columns3,
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
import { formatEventCatalogAsText } from '../webhookEvents';

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
      {copied ? <Check size={size} className="text-success" /> : <Copy size={size} />}
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
      <pre className="px-3 py-2.5 text-xs font-mono overflow-x-auto text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: HttpMethod }) {
  const colors: Record<HttpMethod, string> = {
    GET: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    POST: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    PATCH: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    DELETE: 'bg-red-500/15 text-red-600 dark:text-red-400',
  };
  return (
    <span className={cn('text-3xs font-bold font-mono px-2 py-0.5 rounded', colors[method])}>
      {method}
    </span>
  );
}

/* ─── Data ─── */

const BASE = 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/rest-api/v1';

const EX_BASE_ID = '4v7SY1Hl7YZtWCGClC5boe';
const EX_TABLE_ID = '7bZUvoXYXFO0EBZu43kFKy';
const EX_RECORD_ID = 'nNYfaOIk6bgZpDNFCSXcf';
const EX_FIELD_ID = '5xWnVe2a1BULyA7Ojyf47Q';

const MODULES: Module[] = [
  {
    id: 'authentication',
    name: 'Authentication',
    icon: Shield,
    basePath: '/v1',
    description: 'All API requests require a Bearer token. Create API keys in the Developer Hub. Each key has scopes that limit access to specific operations.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases',
        description: 'Validate your API key by listing accessible bases. A successful response confirms your key is valid.',
        notes: 'API keys use the kdops_ prefix. Include it in the Authorization header as a Bearer token.',
        exampleRequest: `curl ${BASE}/bases \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          bases: [
            {
              id: EX_BASE_ID,
              name: 'Operations Hub',
              slug: 'operations-hub',
              icon: 'building',
              color: '#3B82F6',
              table_count: 5,
            },
          ],
        }, null, 2),
      },
    ],
  },
  {
    id: 'bases',
    name: 'Bases',
    icon: Database,
    basePath: '/v1/bases',
    description: 'Bases are top-level containers (like workspaces or databases). Each base contains tables with their own schema and data.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases',
        description: 'List all bases accessible to your API key.',
        notes: 'Requires the schema:read scope.',
        exampleRequest: `curl ${BASE}/bases \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          bases: [
            {
              id: EX_BASE_ID,
              name: 'Operations Hub',
              slug: 'operations-hub',
              icon: 'building',
              color: '#3B82F6',
              table_count: 5,
            },
            {
              id: '12XAQRQD5A9NNawLJTERl3',
              name: 'CRM',
              slug: 'crm',
              icon: 'users',
              color: '#10B981',
              table_count: 3,
            },
          ],
        }, null, 2),
      },
    ],
  },
  {
    id: 'tables',
    name: 'Tables',
    icon: Table2,
    basePath: '/v1/bases/:baseId/tables',
    description: 'Tables belong to a base and define the schema for your records. You can reference tables by ID or slug.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases/:baseId/tables',
        description: 'List all tables in a base, including their fields.',
        notes: 'Requires the schema:read scope. You can use the base ID or slug.',
        exampleRequest: `curl ${BASE}/bases/${EX_BASE_ID}/tables \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          tables: [
            {
              id: EX_TABLE_ID,
              name: 'Employees',
              slug: 'employees',
              pg_table_name: 'employees',
              fields: [
                { id: EX_FIELD_ID, name: 'Name', type: 'SingleLineText', pg_column_name: 'name', pg_type: 'TEXT', is_system: false, is_hidden: false },
                { id: 'YDhJ7NLa5kGR9m2Cw8xf1', name: 'Email', type: 'Email', pg_column_name: 'email', pg_type: 'TEXT', is_system: false, is_hidden: false },
                { id: '12XAQRQD5A9NNawLJTERl3', name: 'Department', type: 'SingleSelect', pg_column_name: 'department', pg_type: 'TEXT', is_system: false, is_hidden: false },
                { id: '1MvhB5TXIZ8eMwk4aGN9Yn', name: 'Salary', type: 'Currency', pg_column_name: 'salary', pg_type: 'NUMERIC', is_system: false, is_hidden: false },
              ],
            },
          ],
        }, null, 2),
      },
    ],
  },
  {
    id: 'records',
    name: 'Records',
    icon: Rows3,
    basePath: '/v1/bases/:baseId/tables/:tableId/records',
    description: 'CRUD operations on table records. Each record has an auto-generated short ID and a fields object containing the data. Max 10 records per create/update/delete request.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases/:baseId/tables/:tableId/records',
        description: 'List records in a table with optional filtering, sorting, and pagination.',
        params: [
          { name: 'pageSize', type: 'integer', required: false, description: 'Records per page (default: 100, max: 1000)' },
          { name: 'offset', type: 'string', required: false, description: 'Pagination cursor from a previous response' },
          { name: 'sort', type: 'string', required: false, description: 'Sort by field: fieldName:asc or fieldName:desc (repeatable)' },
          { name: 'filter', type: 'string', required: false, description: 'Filter: fieldName op value. Operators: eq, neq, gt, gte, lt, lte, contains (repeatable)' },
        ],
        exampleRequest: `curl "${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records?pageSize=25&sort=Name:asc&filter=Department%20eq%20Engineering" \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          records: [
            {
              id: EX_RECORD_ID,
              createdTime: '2024-06-01T08:00:00Z',
              fields: {
                Name: 'Chioma Okafor',
                Email: 'chioma.okafor@company.ng',
                Department: 'Engineering',
                Salary: 850000,
              },
            },
            {
              id: '1JaE9P559EezTF876atkBN',
              createdTime: '2024-07-15T10:30:00Z',
              fields: {
                Name: 'Emeka Nwosu',
                Email: 'emeka.nwosu@company.ng',
                Department: 'Engineering',
                Salary: 650000,
              },
            },
          ],
          offset: '50',
        }, null, 2),
        notes: 'The offset field is only present when there are more results. Pass it as the offset query param to fetch the next page.',
      },
      {
        method: 'GET',
        path: '/v1/bases/:baseId/tables/:tableId/records/:recordId',
        description: 'Retrieve a single record by its ID.',
        exampleRequest: `curl ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records/${EX_RECORD_ID} \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          id: EX_RECORD_ID,
          createdTime: '2024-06-01T08:00:00Z',
          fields: {
            Name: 'Chioma Okafor',
            Email: 'chioma.okafor@company.ng',
            Department: 'Engineering',
            Salary: 850000,
          },
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/bases/:baseId/tables/:tableId/records',
        description: 'Create one or more records (max 10 per request). Unknown field names are automatically created as SingleLineText columns.',
        bodyFields: [
          { name: 'records', type: 'array', required: true, description: 'Array of {fields: {...}} objects (max 10)' },
        ],
        exampleRequest: `curl -X POST ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {
        "fields": {
          "Name": "Tunde Bakare",
          "Email": "tunde.bakare@company.ng",
          "Department": "Operations",
          "Salary": 720000
        }
      }
    ]
  }'`,
        exampleResponse: JSON.stringify({
          records: [
            {
              id: '1pmtdDjUM3YT5CG5567Krr',
              createdTime: '2026-09-15T15:00:00Z',
              fields: {
                Name: 'Tunde Bakare',
                Email: 'tunde.bakare@company.ng',
                Department: 'Operations',
                Salary: 720000,
              },
            },
          ],
        }, null, 2),
        notes: 'Requires the records:write scope. Returns HTTP 201 on success.',
      },
      {
        method: 'PATCH',
        path: '/v1/bases/:baseId/tables/:tableId/records',
        description: 'Update one or more records. Each record object must include an id field.',
        bodyFields: [
          { name: 'records', type: 'array', required: true, description: 'Array of {id, fields: {...}} objects (max 10). Each must include the record id.' },
        ],
        exampleRequest: `curl -X PATCH ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {
        "id": "${EX_RECORD_ID}",
        "fields": {
          "Salary": 950000,
          "Department": "Engineering Lead"
        }
      }
    ]
  }'`,
        exampleResponse: JSON.stringify({
          records: [
            {
              id: EX_RECORD_ID,
              createdTime: '2024-06-01T08:00:00Z',
              fields: {
                Name: 'Chioma Okafor',
                Email: 'chioma.okafor@company.ng',
                Department: 'Engineering Lead',
                Salary: 950000,
              },
            },
          ],
        }, null, 2),
        notes: 'Requires the records:write scope. Only fields included in the request are updated; others remain unchanged.',
      },
      {
        method: 'DELETE',
        path: '/v1/bases/:baseId/tables/:tableId/records',
        description: 'Delete one or more records by their IDs.',
        bodyFields: [
          { name: 'records', type: 'array', required: true, description: 'Array of record ID strings (max 10)' },
        ],
        exampleRequest: `curl -X DELETE ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": ["${EX_RECORD_ID}"]
  }'`,
        exampleResponse: JSON.stringify({
          records: [
            { id: EX_RECORD_ID, deleted: true },
          ],
        }, null, 2),
        notes: 'Requires the records:write scope. You can also pass record IDs as query params: ?records[]=id1&records[]=id2',
      },
    ],
  },
  {
    id: 'fields',
    name: 'Fields',
    icon: Columns3,
    basePath: '/v1/bases/:baseId/tables/:tableId/fields',
    description: 'Manage table schema by listing, creating, updating, and deleting fields (columns). Virtual types like Formula, Rollup, and Lookup are metadata-only and do not create physical columns.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases/:baseId/tables/:tableId/fields',
        description: 'List all fields in a table, including system and hidden fields.',
        notes: 'Requires the schema:read scope.',
        exampleRequest: `curl ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          fields: [
            {
              id: EX_FIELD_ID,
              name: 'Name',
              pg_column_name: 'name',
              ui_type: 'SingleLineText',
              pg_type: 'TEXT',
              options: {},
              position: 1,
              width: 180,
              is_primary: true,
              is_required: false,
              is_unique: false,
              is_system: false,
              is_hidden: false,
              description: null,
            },
            {
              id: 'YDhJ7NLa5kGR9m2Cw8xf1',
              name: 'Email',
              pg_column_name: 'email',
              ui_type: 'Email',
              pg_type: 'TEXT',
              options: {},
              position: 2,
              width: 180,
              is_primary: false,
              is_required: false,
              is_unique: true,
              is_system: false,
              is_hidden: false,
              description: 'Work email address',
            },
          ],
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/v1/bases/:baseId/tables/:tableId/fields',
        description: 'Create a new field (column) on a table.',
        bodyFields: [
          { name: 'name', type: 'string', required: true, description: 'Display name for the field' },
          { name: 'type', type: 'string', required: true, description: 'Field type: SingleLineText, LongText, Number, Currency, Percent, Email, URL, Phone, SingleSelect, MultiSelect, Checkbox, Date, DateTime, Attachment, Rating, Duration, Formula, Rollup, Lookup, etc.' },
          { name: 'description', type: 'string', required: false, description: 'Field description' },
          { name: 'options', type: 'object', required: false, description: 'Type-specific options (e.g. select choices, formula expression)' },
        ],
        exampleRequest: `curl -X POST ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Start Date",
    "type": "Date",
    "description": "Employee start date"
  }'`,
        exampleResponse: JSON.stringify({
          field: {
            id: '1xIEBnWJdMbiLuF6HcQ7Nz',
            name: 'Start Date',
            pg_column_name: 'start_date',
            ui_type: 'Date',
            pg_type: 'TIMESTAMPTZ',
            options: {},
            position: 5,
            width: 180,
            is_primary: false,
            is_required: false,
            is_unique: false,
            is_system: false,
            is_hidden: false,
            description: 'Employee start date',
          },
        }, null, 2),
        notes: 'Requires the schema:write scope. Returns HTTP 201 on success.',
      },
      {
        method: 'PATCH',
        path: '/v1/bases/:baseId/tables/:tableId/fields/:fieldId',
        description: 'Update a field (rename, change description, or modify options). Cannot change the underlying type.',
        bodyFields: [
          { name: 'name', type: 'string', required: false, description: 'New display name' },
          { name: 'description', type: 'string', required: false, description: 'New description' },
          { name: 'options', type: 'object', required: false, description: 'Updated type-specific options' },
        ],
        exampleRequest: `curl -X PATCH ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields/${EX_FIELD_ID} \\
  -H "Authorization: Bearer kdops_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Full Name", "description": "Employee full name"}'`,
        exampleResponse: JSON.stringify({
          field: {
            id: EX_FIELD_ID,
            name: 'Full Name',
            pg_column_name: 'name',
            ui_type: 'SingleLineText',
            description: 'Employee full name',
          },
        }, null, 2),
        notes: 'Requires the schema:write scope. If renaming, the physical column name (pg_column_name) is also updated.',
      },
      {
        method: 'DELETE',
        path: '/v1/bases/:baseId/tables/:tableId/fields/:fieldId',
        description: 'Delete a field from a table. This drops the physical column and all its data.',
        exampleRequest: `curl -X DELETE ${BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields/${EX_FIELD_ID} \\
  -H "Authorization: Bearer kdops_live_abc123..."`,
        exampleResponse: JSON.stringify({
          field: { id: EX_FIELD_ID, deleted: true },
        }, null, 2),
        notes: 'Requires the schema:write scope. This action is irreversible — the column and all its data are permanently removed.',
      },
    ],
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    icon: Webhook,
    basePath: 'Managed via UI',
    description: 'Webhooks deliver real-time HTTP callbacks when events occur. Create and manage webhooks in the Webhooks tab of the Developer Hub. When an event fires, a signed POST request is sent to your endpoint.',
    endpoints: [
      {
        method: 'POST',
        path: 'Your endpoint',
        description: 'Webhook payload format. This is what KDOps sends to your registered URL when an event fires.',
        notes: 'Webhooks are configured in the Developer Hub UI, not via API. This section documents the payload your endpoint receives.',
        exampleRequest: `# Verify the HMAC-SHA256 signature
# Header: X-KDOps-Signature: sha256=<hex-digest>
# Compute: HMAC-SHA256(your_secret, request_body)

# Example: handling a webhook in Node.js
const crypto = require('crypto');

app.post('/webhooks/kdops', (req, res) => {
  const signature = req.headers['x-kdops-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process the event
  console.log(req.body.event, req.body.payload);
  res.status(200).json({ received: true });
});`,
        exampleResponse: JSON.stringify({
          event: 'record.created',
          timestamp: '2026-09-15T14:30:00.000Z',
          base_id: EX_BASE_ID,
          table_id: EX_TABLE_ID,
          payload: {
            id: EX_RECORD_ID,
            createdTime: '2026-09-15T14:30:00Z',
            fields: {
              Name: 'Ngozi Adeyemi',
              Email: 'ngozi@company.ng',
              Department: 'Design',
            },
          },
          old_payload: null,
        }, null, 2),
      },
      {
        method: 'POST',
        path: 'Platform events',
        description: 'Available webhook event types across all modules.',
        notes: 'Configure these events when creating a webhook in the Developer Hub.',
        exampleRequest: `# Available event types by module:\n\n${formatEventCatalogAsText()}`,
        exampleResponse: JSON.stringify({
          event: 'payroll.run_completed',
          timestamp: '2026-08-28T09:00:00.000Z',
          base_id: '0',
          table_id: '0',
          payload: {
            run_id: '5CAWGxVM8rtY7rPMGg0dSU',
            month: 8,
            year: 2026,
            employee_count: 48,
            total_net: 36200000,
          },
          old_payload: null,
        }, null, 2),
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
        {open ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-4 space-y-4 bg-white dark:bg-zinc-900/30">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{endpoint.description}</p>

          {endpoint.notes && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10/20 border border-warning/20/50">
              <ArrowRight size={14} className="text-warning mt-0.5 shrink-0" />
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
                            <Badge variant="secondary" className="text-3xs bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive hover:bg-destructive/10">
                              Required
                            </Badge>
                          ) : (
                            <span className="text-3xs text-muted-foreground">Optional</span>
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
                      ? 'bg-primary/5 dark:bg-primary/10 text-primary dark:text-primary font-medium'
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
              <Shield size={16} className="text-primary dark:text-primary" />
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
                  code={JSON.stringify({ error: { type: 'NOT_FOUND', message: 'Record not found' } }, null, 2)}
                  language="json"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-2xs text-zinc-500 dark:text-zinc-400 pt-1">
              <span><strong className="text-zinc-700 dark:text-zinc-300">Rate Limit:</strong> 100 req/min per key (429 when exceeded)</span>
              <span><strong className="text-zinc-700 dark:text-zinc-300">Pagination:</strong> ?pageSize=100&offset=cursor (default 100, max 1000)</span>
              <span><strong className="text-zinc-700 dark:text-zinc-300">IDs:</strong> All entity IDs are short IDs (base-62 encoded)</span>
            </div>
            <div className="text-2xs text-zinc-500 dark:text-zinc-400">
              <strong className="text-zinc-700 dark:text-zinc-300">Base URL:</strong>{' '}
              <code className="font-mono text-3xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded break-all">
                https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/rest-api/v1
              </code>
            </div>
            <div className="flex flex-wrap gap-3 text-2xs text-zinc-500 dark:text-zinc-400">
              <span><strong className="text-zinc-700 dark:text-zinc-300">Scopes:</strong></span>
              {['schema:read', 'schema:write', 'records:read', 'records:write', 'data:delete'].map(s => (
                <code key={s} className="font-mono text-3xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{s}</code>
              ))}
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
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No endpoints match &ldquo;{search}&rdquo;</p>
          </div>
        )}
      </main>
    </div>
  );
}
