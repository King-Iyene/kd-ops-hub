/**
 * The /v1 REST API reference as data: one entry per endpoint, with the example
 * request and response. Kept out of the component so it can be searched,
 * tested and reused (the docs search reads it too).
 */
import { formatEventCatalogAsText } from '@/features/developer/webhookEvents';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  description: string;
  params?: Param[];
  bodyFields?: Param[];
  exampleRequest: string;
  exampleResponse: string;
  notes?: string;
}

/** Which icon the reference page shows for a module (the page maps this to a component). */
export type ModuleIconKey = 'shield' | 'database' | 'table' | 'rows' | 'columns' | 'webhook';

export interface V1Module {
  id: string;
  name: string;
  iconKey: ModuleIconKey;
  basePath: string;
  description: string;
  endpoints: Endpoint[];
}

export const V1_BASE = 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/rest-api/v1';

const EX_BASE_ID = '4v7SY1Hl7YZtWCGClC5boe';
const EX_TABLE_ID = '7bZUvoXYXFO0EBZu43kFKy';
const EX_RECORD_ID = 'nNYfaOIk6bgZpDNFCSXcf';
const EX_FIELD_ID = '5xWnVe2a1BULyA7Ojyf47Q';

export const V1_MODULES: V1Module[] = [
  {
    id: 'authentication',
    name: 'Authentication',
    iconKey: 'shield',
    basePath: '/v1',
    description: 'All API requests require a Bearer token. Create API keys in the Developer Hub. Each key has scopes that limit access to specific operations.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases',
        description: 'Validate your API key by listing accessible bases. A successful response confirms your key is valid.',
        notes: 'API keys use the kdops_ prefix. Include it in the Authorization header as a Bearer token.',
        exampleRequest: `curl ${V1_BASE}/bases \\
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
    iconKey: 'database',
    basePath: '/v1/bases',
    description: 'Bases are top-level containers (like workspaces or databases). Each base contains tables with their own schema and data.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases',
        description: 'List all bases accessible to your API key.',
        notes: 'Requires the schema:read scope.',
        exampleRequest: `curl ${V1_BASE}/bases \\
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
    iconKey: 'table',
    basePath: '/v1/bases/:baseId/tables',
    description: 'Tables belong to a base and define the schema for your records. You can reference tables by ID or slug.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases/:baseId/tables',
        description: 'List all tables in a base, including their fields.',
        notes: 'Requires the schema:read scope. You can use the base ID or slug.',
        exampleRequest: `curl ${V1_BASE}/bases/${EX_BASE_ID}/tables \\
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
    iconKey: 'rows',
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
        exampleRequest: `curl "${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records?pageSize=25&sort=Name:asc&filter=Department%20eq%20Engineering" \\
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
        exampleRequest: `curl ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records/${EX_RECORD_ID} \\
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
        exampleRequest: `curl -X POST ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records \\
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
        exampleRequest: `curl -X PATCH ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records \\
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
        exampleRequest: `curl -X DELETE ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/records \\
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
    iconKey: 'columns',
    basePath: '/v1/bases/:baseId/tables/:tableId/fields',
    description: 'Manage table schema by listing, creating, updating, and deleting fields (columns). Virtual types like Formula, Rollup, and Lookup are metadata-only and do not create physical columns.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/bases/:baseId/tables/:tableId/fields',
        description: 'List all fields in a table, including system and hidden fields.',
        notes: 'Requires the schema:read scope.',
        exampleRequest: `curl ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields \\
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
        exampleRequest: `curl -X POST ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields \\
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
        exampleRequest: `curl -X PATCH ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields/${EX_FIELD_ID} \\
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
        exampleRequest: `curl -X DELETE ${V1_BASE}/bases/${EX_BASE_ID}/tables/${EX_TABLE_ID}/fields/${EX_FIELD_ID} \\
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
    iconKey: 'webhook',
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
