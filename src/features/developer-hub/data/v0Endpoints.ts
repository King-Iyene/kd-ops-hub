/**
 * The Airtable-compatible `/v0` API, as described in docs/airtable-api-compatibility.md
 * on the branch `feature/airtable-api-v0`.
 *
 * IMPORTANT: that branch is not merged or deployed. Everything here is a
 * preview of the planned contract, hard-coded on purpose (the Developer Hub
 * never fetches it). Update this file when the compatibility document changes.
 */

export type V0Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type V0Status = 'supported' | 'partial' | 'subset' | 'rejected' | 'not-supported';

export interface V0Endpoint {
  /** Stable id, used for search and React keys. */
  id: string;
  group: 'Records' | 'Meta';
  /** Airtable's name for the operation. */
  name: string;
  method: V0Method;
  /** Path under the rest-api function, with `{placeholders}`. */
  path: string;
  description: string;
  status: V0Status;
  notes?: string;
}

export const V0_BRANCH = 'feature/airtable-api-v0';

export const V0_AVAILABILITY_NOTE =
  'Coming soon. This API is built on a separate branch (' +
  V0_BRANCH +
  '), is not deployed and has not been run against the live function or any Airtable client. ' +
  'Use /v1 today.';

export const V0_STATUS_LABELS: Record<V0Status, string> = {
  supported: 'Supported',
  partial: 'Partial',
  subset: 'Subset',
  rejected: 'Rejected',
  'not-supported': 'Not supported',
};

export const V0_ENDPOINTS: V0Endpoint[] = [
  {
    id: 'records-list-get',
    group: 'Records',
    name: 'List records',
    method: 'GET',
    path: '/v0/{base}/{table}',
    description: 'List records in a table.',
    status: 'supported',
    notes: 'See the list options below.',
  },
  {
    id: 'records-list-post',
    group: 'Records',
    name: 'List records (body)',
    method: 'POST',
    path: '/v0/{base}/{table}/listRecords',
    description: 'Same options as the GET form, sent as a JSON body. Useful for long formulas.',
    status: 'supported',
  },
  {
    id: 'records-get',
    group: 'Records',
    name: 'Get record',
    method: 'GET',
    path: '/v0/{base}/{table}/{recordId}',
    description: 'Fetch one record.',
    status: 'supported',
    notes: 'returnFieldsByFieldId is honoured.',
  },
  {
    id: 'records-create',
    group: 'Records',
    name: 'Create records',
    method: 'POST',
    path: '/v0/{base}/{table}',
    description: 'Create one record ({"fields":{}}) or 1 to 10 ({"records":[...]}).',
    status: 'supported',
    notes: 'Supports typecast and returnFieldsByFieldId. The whole request runs in one transaction.',
  },
  {
    id: 'records-update-patch',
    group: 'Records',
    name: 'Update record',
    method: 'PATCH',
    path: '/v0/{base}/{table}/{recordId}',
    description: 'Change only the fields you send.',
    status: 'supported',
  },
  {
    id: 'records-update-put',
    group: 'Records',
    name: 'Replace record',
    method: 'PUT',
    path: '/v0/{base}/{table}/{recordId}',
    description: 'Clears every other writable field and link (except Airtable ID).',
    status: 'supported',
  },
  {
    id: 'records-update-many-patch',
    group: 'Records',
    name: 'Update multiple records',
    method: 'PATCH',
    path: '/v0/{base}/{table}',
    description: 'Update 1 to 10 records ({id, fields}). All or nothing.',
    status: 'supported',
    notes: 'With performUpsert.fieldsToMergeOn this becomes an upsert.',
  },
  {
    id: 'records-update-many-put',
    group: 'Records',
    name: 'Replace multiple records',
    method: 'PUT',
    path: '/v0/{base}/{table}',
    description: 'Replace 1 to 10 records. All or nothing.',
    status: 'supported',
    notes: 'With performUpsert.fieldsToMergeOn this becomes an upsert that clears other fields.',
  },
  {
    id: 'records-delete',
    group: 'Records',
    name: 'Delete record',
    method: 'DELETE',
    path: '/v0/{base}/{table}/{recordId}',
    description: 'Delete one record. Returns {id, deleted: true}.',
    status: 'supported',
  },
  {
    id: 'records-delete-many',
    group: 'Records',
    name: 'Delete multiple records',
    method: 'DELETE',
    path: '/v0/{base}/{table}?records[]={recordId}&records[]={recordId}',
    description: 'Delete 1 to 10 records.',
    status: 'supported',
  },
  {
    id: 'comments-list',
    group: 'Records',
    name: 'List comments',
    method: 'GET',
    path: '/v0/{base}/{table}/{recordId}/comments',
    description: 'Record comments.',
    status: 'not-supported',
  },
  {
    id: 'comments-write',
    group: 'Records',
    name: 'Create, update or delete comments',
    method: 'POST',
    path: '/v0/{base}/{table}/{recordId}/comments',
    description: 'Write record comments.',
    status: 'not-supported',
  },
  {
    id: 'attachments-upload',
    group: 'Records',
    name: 'Upload attachment',
    method: 'POST',
    path: '/v0/{base}/{recordId}/{field}/uploadAttachment',
    description: 'Upload a file into an attachment field.',
    status: 'not-supported',
    notes:
      'Attachment values can be written as [{url, filename}] and are stored as given; the file is not fetched or re-hosted.',
  },
  {
    id: 'sync-csv',
    group: 'Records',
    name: 'Sync CSV data',
    method: 'POST',
    path: '/v0/{base}/{table}/sync/{apiEndpointSyncId}',
    description: 'Sync CSV data into a table.',
    status: 'not-supported',
  },
  {
    id: 'meta-bases',
    group: 'Meta',
    name: 'List bases',
    method: 'GET',
    path: '/v0/meta/bases',
    description: 'Bases the key may use.',
    status: 'supported',
    notes: 'No pagination. permissionLevel is always create.',
  },
  {
    id: 'meta-base-schema',
    group: 'Meta',
    name: 'Get base schema',
    method: 'GET',
    path: '/v0/meta/bases/{base}/tables',
    description: 'Tables and fields with Airtable field type names.',
    status: 'supported',
    notes:
      'Junction (jn_*) tables, system and hidden fields are left out. views is always empty. Select choices have no id.',
  },
  {
    id: 'meta-whoami',
    group: 'Meta',
    name: 'Who am I',
    method: 'GET',
    path: '/v0/meta/whoami',
    description: 'Returns {id: <key id>, scopes}.',
    status: 'partial',
  },
  {
    id: 'meta-create-base',
    group: 'Meta',
    name: 'Create base',
    method: 'POST',
    path: '/v0/meta/bases',
    description: 'Create a base.',
    status: 'not-supported',
    notes: 'Schema writes are not available on /v0. /v1 can create, rename and delete fields (schema:write).',
  },
  {
    id: 'meta-create-table',
    group: 'Meta',
    name: 'Create or update table',
    method: 'POST',
    path: '/v0/meta/bases/{base}/tables',
    description: 'Create or update a table.',
    status: 'not-supported',
  },
  {
    id: 'meta-create-field',
    group: 'Meta',
    name: 'Create or update field',
    method: 'POST',
    path: '/v0/meta/bases/{base}/tables/{table}/fields',
    description: 'Create or update a field.',
    status: 'not-supported',
    notes: 'Use the /v1 fields endpoints for this today.',
  },
  {
    id: 'meta-views',
    group: 'Meta',
    name: 'Views (get, delete)',
    method: 'GET',
    path: '/v0/meta/bases/{base}/views',
    description: 'View metadata.',
    status: 'not-supported',
  },
  {
    id: 'meta-webhooks',
    group: 'Meta',
    name: 'Webhooks API, collaborators, shares, enterprise',
    method: 'GET',
    path: '/v0/bases/{base}/webhooks',
    description: 'Airtable webhooks API and related admin endpoints.',
    status: 'not-supported',
    notes:
      'Outbound webhooks exist in the app and fire on /v0 writes (record.created, record.updated, record.deleted). Manage them in the Webhooks tab.',
  },
];

/* ─── List options ─── */

export interface V0Option {
  name: string;
  status: V0Status;
  notes: string;
}

export const V0_LIST_OPTIONS: V0Option[] = [
  { name: 'pageSize', status: 'supported', notes: '1 to 100 (default 100). Over 100 is 422.' },
  { name: 'offset', status: 'supported', notes: 'Opaque token itr<number> from the previous response. Position based, so rows added or removed between pages can shift.' },
  { name: 'maxRecords', status: 'supported', notes: 'Total across pages.' },
  { name: 'fields[]', status: 'supported', notes: 'Names or fld ids. An unknown field is 422 UNKNOWN_FIELD_NAME.' },
  { name: 'sort[n][field], sort[n][direction]', status: 'supported', notes: 'Not on link fields. Computed columns stored as text sort as text.' },
  { name: 'filterByFormula', status: 'subset', notes: 'AND, OR, NOT, comparisons, FIND, SEARCH, IS_BEFORE, IS_AFTER, IS_SAME, TODAY, NOW, BLANK. Anything else is 422 INVALID_FILTER_BY_FORMULA.' },
  { name: 'returnFieldsByFieldId', status: 'supported', notes: 'Keys the fields object by fld id.' },
  { name: 'view', status: 'rejected', notes: 'Rejected with 422, never silently ignored.' },
  { name: 'cellFormat=string, timeZone, userLocale, recordMetadata', status: 'not-supported', notes: 'cellFormat=json is accepted; timeZone and userLocale are ignored.' },
];

/* ─── Scopes ─── */

export interface V0Scope {
  airtable: string;
  sameAs: string;
  allows: string;
}

export const V0_SCOPES: V0Scope[] = [
  { airtable: 'data.records:read', sameAs: 'records:read', allows: 'list, get' },
  { airtable: 'data.records:write', sameAs: 'records:write', allows: 'create, update, upsert, delete' },
  { airtable: 'schema.bases:read', sameAs: 'schema:read', allows: '/v0/meta/bases, /v0/meta/bases/{id}/tables' },
  { airtable: 'schema.bases:write', sameAs: 'schema:write', allows: '/v1 field create, update and delete only (no /v0 schema writes yet)' },
];

/* ─── Errors ─── */

export interface V0Error {
  status: number;
  type: string;
  when: string;
}

export const V0_ERRORS: V0Error[] = [
  { status: 401, type: 'AUTHENTICATION_REQUIRED', when: 'Missing, malformed, revoked or expired key' },
  { status: 403, type: 'NOT_AUTHORIZED', when: 'Key lacks the scope' },
  { status: 403, type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND', when: 'Unknown base, or a base the key may not use' },
  { status: 404, type: 'TABLE_NOT_FOUND', when: 'Unknown table' },
  { status: 404, type: 'NOT_FOUND', when: 'Unknown record (single-record URLs) or unknown route' },
  { status: 405, type: 'METHOD_NOT_ALLOWED', when: 'Wrong HTTP method' },
  { status: 413, type: 'REQUEST_BODY_TOO_LARGE', when: 'Body over 2 MB' },
  { status: 422, type: 'UNKNOWN_FIELD_NAME', when: 'Field name or id not in the table' },
  { status: 422, type: 'INVALID_VALUE_FOR_COLUMN', when: 'Wrong value type, computed field, missing link target, database constraint' },
  { status: 422, type: 'INVALID_MULTIPLE_CHOICE_OPTIONS', when: 'Select value is not an existing choice' },
  { status: 422, type: 'INVALID_FILTER_BY_FORMULA', when: 'Unsupported or invalid filterByFormula' },
  { status: 422, type: 'INVALID_OFFSET_VALUE', when: 'Bad offset' },
  { status: 422, type: 'ROW_DOES_NOT_EXIST', when: 'Batch update or delete with an unknown record id' },
  { status: 429, type: 'RATE_LIMIT_REACHED', when: 'Over 100 requests per minute per key (Retry-After header, seconds)' },
  { status: 500, type: 'SERVER_ERROR', when: 'Unexpected failure (logged, no detail returned)' },
];

/* ─── Known differences from Airtable ─── */

export const V0_KNOWN_DIFFERENCES: string[] = [
  'Different base URL, kdops_ keys instead of Airtable tokens, longer prefixed ids.',
  'view, cellFormat=string, schema writes, comments, attachment upload, the webhooks API and views are not supported.',
  'filterByFormula is a subset.',
  'Select choices are never created, with or without typecast.',
  'Formula, rollup and lookup values are stored values; they are not recalculated and automations do not run for API writes.',
  'Offsets are positions, not cursors.',
  'Rate limit is per key per instance, not shared.',
  'A link write needs a junction table.',
];

/* ─── Example requests (placeholders only) ─── */

export const V0_EXAMPLE_PLACEHOLDERS = {
  base: '<baseId from GET /v0/meta/bases>',
  table: '<tableId or URL-encoded table name>',
};
