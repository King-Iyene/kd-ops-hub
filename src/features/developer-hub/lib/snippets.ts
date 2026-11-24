/**
 * Pure helpers that build copy-paste snippets for the Developer Hub Quick start.
 *
 * Nothing in here touches the network, the database or the DOM, so it is easy
 * to test. A real API key is never accepted or produced: every snippet uses
 * KEY_PLACEHOLDER.
 */

/** Used when VITE_SUPABASE_URL is not set (the live project's function URL). */
export const FALLBACK_SUPABASE_URL = 'https://mseeurrvdcfxdmvqjjki.supabase.co';

/** What every snippet shows in place of a key. Never replaced with a real key. */
export const KEY_PLACEHOLDER = 'kdops_YOUR_API_KEY';

/** Shown when no base or table has been picked (or none exist yet). */
export const BASE_ID_PLACEHOLDER = '<baseId>';
export const TABLE_ID_PLACEHOLDER = '<tableId>';

export interface SnippetTarget {
  /** Root of the rest-api edge function, no trailing slash and no version. */
  apiRoot: string;
  baseId: string;
  tableId: string;
  /** Name of a column to use in the example create body (optional). */
  sampleFieldName?: string;
}

/** Root URL of the rest-api edge function, from the Supabase project URL. */
export function resolveApiRoot(supabaseUrl?: string | null): string {
  const raw = (supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const root = raw && /^https?:\/\//i.test(raw) ? raw : FALLBACK_SUPABASE_URL;
  return `${root}/functions/v1/rest-api`;
}

/** True when the text contains something that looks like a real kdops_ key. */
export function looksLikeRealKey(text: string): boolean {
  return /kdops_[0-9a-f]{32}\b/i.test(text);
}

export function v1BasesUrl(t: Pick<SnippetTarget, 'apiRoot'>): string {
  return `${t.apiRoot}/v1/bases`;
}

export function v1TablesUrl(t: Pick<SnippetTarget, 'apiRoot' | 'baseId'>): string {
  return `${t.apiRoot}/v1/bases/${t.baseId}/tables`;
}

export function v1RecordsUrl(t: Pick<SnippetTarget, 'apiRoot' | 'baseId' | 'tableId'>): string {
  return `${t.apiRoot}/v1/bases/${t.baseId}/tables/${t.tableId}/records`;
}

/** Example JSON body for creating one record. Keys are real column names when known. */
export function sampleCreateBody(sampleFieldName?: string): { records: { fields: Record<string, string> }[] } {
  const name = sampleFieldName && sampleFieldName.trim() ? sampleFieldName.trim() : 'Name';
  return { records: [{ fields: { [name]: 'Hello from the API' } }] };
}

function sampleCreateBodyJson(t: SnippetTarget, indent: number): string {
  const body = JSON.stringify(sampleCreateBody(t.sampleFieldName), null, 2);
  const pad = ' '.repeat(indent);
  return body
    .split('\n')
    .map((line, i) => (i === 0 ? line : pad + line))
    .join('\n');
}

/** Escape a string for use inside single quotes in a POSIX shell. */
export function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function curlListSnippet(t: SnippetTarget): string {
  return `curl "${v1RecordsUrl(t)}?pageSize=10" \\
  -H "Authorization: Bearer ${KEY_PLACEHOLDER}"`;
}

export function curlCreateSnippet(t: SnippetTarget): string {
  const body = JSON.stringify(sampleCreateBody(t.sampleFieldName));
  return `curl -X POST "${v1RecordsUrl(t)}" \\
  -H "Authorization: Bearer ${KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d ${shellSingleQuote(body)}`;
}

export function fetchSnippet(t: SnippetTarget): string {
  return `// Keep the key out of your source code: read it from an environment variable.
const API_KEY = process.env.KDOPS_API_KEY; // looks like ${KEY_PLACEHOLDER}
const RECORDS_URL = "${v1RecordsUrl(t)}";

// List records
const list = await fetch(\`\${RECORDS_URL}?pageSize=10\`, {
  headers: { Authorization: \`Bearer \${API_KEY}\` },
});
if (!list.ok) throw new Error(\`KDOps API error \${list.status}\`);
const { records, offset } = await list.json(); // offset is set when there is another page

// Create a record
const create = await fetch(RECORDS_URL, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${sampleCreateBodyJson(t, 2)}),
});
if (!create.ok) throw new Error(\`KDOps API error \${create.status}\`);
console.log(await create.json());`;
}

/**
 * An n8n workflow fragment: paste it onto the n8n canvas (Ctrl+V) to get one
 * HTTP Request node. The key is a placeholder; use an n8n credential for the
 * real one.
 */
export function n8nNodeJson(t: SnippetTarget): string {
  const node = {
    nodes: [
      {
        parameters: {
          url: `${v1RecordsUrl(t)}?pageSize=10`,
          sendHeaders: true,
          headerParameters: {
            parameters: [{ name: 'Authorization', value: `Bearer ${KEY_PLACEHOLDER}` }],
          },
          options: {},
        },
        name: 'KDOps list records',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [0, 0],
      },
    ],
    connections: {},
  };
  return JSON.stringify(node, null, 2);
}

export function n8nSteps(t: SnippetTarget): string[] {
  return [
    'In n8n, add an HTTP Request node (or paste the JSON below onto the canvas).',
    `Method GET, URL ${v1RecordsUrl(t)}.`,
    'Under Authentication choose Generic Credential Type, then Header Auth. Create a credential with Name "Authorization" and Value "Bearer " followed by your key. Do not paste the key into the node itself.',
    'To create records, switch the method to POST, turn on Send Body, choose JSON and use the body shown in the cURL tab.',
    'Run the node once. A list of records means the key, base and table are all correct.',
  ];
}

export function makeSteps(t: SnippetTarget): string[] {
  return [
    'In Make, add the HTTP module and choose "Make a request".',
    `URL ${v1RecordsUrl(t)}, Method GET.`,
    `Add a header: Name Authorization, Value Bearer ${KEY_PLACEHOLDER} (replace with your key).`,
    'Set "Parse response" to Yes so the records appear as mappable items.',
    'For POST, set Body type to "Raw", Content type to "JSON (application/json)" and paste the body from the cURL tab.',
    'Run the module once. Each item in "records" can then be mapped into the next step.',
  ];
}

/** Fill the placeholder ids when nothing is selected, so snippets stay readable. */
export function buildTarget(input: {
  apiRoot: string;
  baseId?: string | null;
  tableId?: string | null;
  sampleFieldName?: string | null;
}): SnippetTarget {
  return {
    apiRoot: input.apiRoot,
    baseId: input.baseId || BASE_ID_PLACEHOLDER,
    tableId: input.tableId || TABLE_ID_PLACEHOLDER,
    sampleFieldName: input.sampleFieldName || undefined,
  };
}
