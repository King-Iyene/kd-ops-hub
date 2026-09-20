import { useState, useCallback, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cable, Key, Webhook, Zap, Copy, Check, ChevronRight, ArrowRight, BookOpen, Code2, Plug, Globe, Send, Trash2, Pencil, List, Sparkles, Shield } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';

const ApiTokensDialog = lazy(() => import('./ApiTokensDialog').then(m => ({ default: m.ApiTokensDialog })));
const WebhooksDialog = lazy(() => import('./WebhooksDialog').then(m => ({ default: m.WebhooksDialog })));
const AutomationsDialog = lazy(() => import('./AutomationsDialog').then(m => ({ default: m.AutomationsDialog })));

type MainTab = 'overview' | 'api-reference' | 'connect';
type SubDialog = null | 'api-keys' | 'webhooks' | 'automations';
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const SUPABASE_REF = 'mseeurrvdcfxdmvqjjki';
const API_BASE = `https://${SUPABASE_REF}.supabase.co/functions/v1/rest-api/v1`;

interface IntegrationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | null;
  baseId: string | null;
}

interface DocField {
  name: string;
  ui_type: string;
}

const VIRTUAL_TYPES = new Set([
  'Links', 'Lookup', 'Rollup', 'Count', 'Formula',
  'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy', 'ID', 'Button',
]);

/** Real, non-system fields for the table the dialog was opened from, used to
 * build API examples that match the user's actual schema instead of generic
 * Airtable-style sample data — so what they see is what they can paste. */
function useDocFields(tableId: string | null) {
  return useQuery({
    queryKey: ['nc', 'doc-fields', tableId],
    enabled: !!tableId,
    staleTime: 30_000,
    queryFn: async (): Promise<DocField[]> => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('name, ui_type, is_system, is_hidden, position')
        .eq('table_id', tableId!)
        .order('position');
      if (error) throw error;
      return (data ?? []).filter((f: any) => !f.is_system && !f.is_hidden && !VIRTUAL_TYPES.has(f.ui_type)) as DocField[];
    },
  });
}

/** A realistic sample value for a field, keyed off its UI type — used both
 * for JSON body examples and for the response echoed back below them. */
function sampleValueForField(field: DocField): unknown {
  switch (field.ui_type) {
    case 'Number': return 42;
    case 'Decimal': return 15000.5;
    case 'Currency': return 2500.0;
    case 'Percent': return 0.25;
    case 'Duration': return 60;
    case 'Rating': return 4;
    case 'Checkbox': return true;
    case 'Date': return '2025-09-04';
    case 'DateTime': return '2025-09-04T14:30:00Z';
    case 'Year': return 2025;
    case 'Time': return '14:30:00';
    case 'Email': return 'jane@example.com';
    case 'PhoneNumber': return '+1 555 0100';
    case 'URL': return 'https://example.com';
    case 'MultiSelect': return ['Option A', 'Option B'];
    case 'JSON': return { key: 'value' };
    default: return `Sample ${field.name}`;
  }
}

/** Builds a `records` array body from real fields, or falls back to the
 * generic Airtable-style example when no table is in context yet. */
function buildSampleFields(fields: DocField[] | undefined): Record<string, unknown> {
  if (!fields || fields.length === 0) {
    return {
      Name: 'Alice Johnson',
      Email: 'alice@company.com',
      Website: 'https://alice.dev',
      Revenue: 15000.5,
      Joined: '2025-08-15',
      Active: true,
      Notes: 'Key enterprise client',
    };
  }
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = sampleValueForField(f);
  return out;
}

/** Template-expression form of a field's sample value, per automation tool's
 * mapping syntax — used in the n8n/Zapier/Make body templates. */
function templateExprFor(field: DocField, style: 'n8n' | 'zapier' | 'make'): string {
  const key = field.name.replace(/\s+/g, '_').toLowerCase();
  switch (style) {
    case 'n8n': return `{{ $json.${key} }}`;
    case 'zapier': return `{{${key}}}`;
    case 'make': return `{{1.${key}}}`;
  }
}

/* ─── Shared Components ─── */

function CopyButton({ text, size = 12 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button onClick={handleCopy} className="shrink-0 p-1 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 text-zinc-400 dark:text-zinc-500 transition-colors" title="Copy">
      {copied ? <Check size={size} className="text-success" /> : <Copy size={size} />}
    </button>
  );
}

function CodeBlock({ label, code, language }: { label: string; code: string; language?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="text-3xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
          {language && <span className="text-3xs px-1.5 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 font-medium">{language}</span>}
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="px-3 py-2.5 text-2xs leading-relaxed font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all bg-white dark:bg-zinc-900/50 overflow-x-auto">{code}</pre>
    </div>
  );
}

function MethodBadge({ method }: { method: HttpMethod }) {
  const colors: Record<HttpMethod, string> = {
    GET: 'bg-success/10 text-success dark:bg-success/10 dark:text-success',
    POST: 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary',
    PATCH: 'bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning',
    DELETE: 'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive',
  };
  return <span className={`text-3xs font-bold px-1.5 py-0.5 rounded ${colors[method]}`}>{method}</span>;
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="p-1.5 rounded-lg bg-primary/5 dark:bg-primary/10 mt-0.5">
        <Icon size={14} className="text-primary" />
      </div>
      <div>
        <h4 className="text-xs-plus font-semibold text-zinc-800 dark:text-zinc-200">{title}</h4>
        {subtitle && <p className="text-2xs text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ─── Tab: Overview ─── */

function OverviewTab({ baseId, onSubDialog, onSwitchTab }: { baseId: string | null; onSubDialog: (d: SubDialog) => void; onSwitchTab: (t: MainTab) => void }) {
  const apiUrl = baseId ? `${API_BASE}/bases/${baseId}` : API_BASE;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-emerald-500/10 dark:from-blue-500/20 dark:via-indigo-500/10 dark:to-emerald-500/20 p-5 border border-blue-200/50 dark:border-blue-800/40">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-primary/10">
            <Cable size={22} className="text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-100">Connect Your Tools</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              KDOps has a full <strong>Airtable-compatible REST API</strong>. Connect n8n, Zapier, Make, or any tool
              that speaks HTTP. Fields are <strong className="text-primary">auto-created</strong> when you send new data — no setup needed.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => onSwitchTab('api-reference')} className="text-2xs font-medium text-primary hover:underline flex items-center gap-1">
                <Code2 size={12} /> View API Reference
              </button>
              <span className="text-zinc-300 dark:text-zinc-600">|</span>
              <button onClick={() => onSwitchTab('connect')} className="text-2xs font-medium text-primary hover:underline flex items-center gap-1">
                <Plug size={12} /> Connect n8n / Zapier
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Start */}
      <div>
        <SectionHeader icon={BookOpen} title="Quick Start" subtitle="Get up and running in 3 steps" />
        <div className="space-y-2">
          {[
            { step: 1, title: 'Create an API Key', desc: <>Generate a <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-3xs font-mono">kdops_</code> key with read/write permissions.</>, action: () => onSubDialog('api-keys') },
            { step: 2, title: 'Send data via HTTP', desc: 'POST records to the API. Unknown fields are auto-created with smart type detection (Email, URL, Date, Number, etc).', action: () => onSwitchTab('api-reference') },
            { step: 3, title: 'Set up webhooks (optional)', desc: 'Get notified in real-time when records change — push data to n8n, Slack, or any URL.', action: () => onSubDialog('webhooks') },
          ].map(({ step, title, desc, action }) => (
            <button key={step} onClick={action} className="w-full flex items-start gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 hover:border-primary/30 dark:hover:border-primary transition-colors text-left group">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-2xs font-bold shrink-0 mt-0.5">{step}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{title}</p>
                <p className="text-2xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
              <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600 group-hover:text-primary transition-colors shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </div>

      {/* API Base URL */}
      <CodeBlock label="Your API Base URL" code={apiUrl} />

      {/* Smart Features */}
      <div>
        <SectionHeader icon={Sparkles} title="Smart Features" subtitle="What makes KDOps special" />
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { title: 'Auto-Create Fields', desc: 'Send unknown field names and they\'re created automatically with the right type.', color: '#2D7FF9' },
            { title: 'Type Detection', desc: 'Email, URL, Date, Number, Checkbox, JSON — all detected from your data.', color: '#10B981' },
            { title: 'Airtable Compatible', desc: 'Same records/fields structure — migrate from Airtable with zero changes.', color: '#8B5CF6' },
            { title: 'HMAC Webhooks', desc: 'Signed webhook payloads so you can verify they came from KDOps.', color: '#F59E0B' },
          ].map((f) => (
            <div key={f.title} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/30">
              <div className="w-1.5 h-1.5 rounded-full mb-2" style={{ backgroundColor: f.color }} />
              <p className="text-2xs font-semibold text-zinc-700 dark:text-zinc-300">{f.title}</p>
              <p className="text-3xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Manage Section */}
      <div>
        <SectionHeader icon={Key} title="Manage" subtitle="API Keys, Webhooks, and Automations" />
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { id: 'api-keys' as SubDialog, icon: Key, title: 'API Keys', desc: 'Create & revoke keys', color: '#2D7FF9' },
            { id: 'webhooks' as SubDialog, icon: Webhook, title: 'Webhooks', desc: 'Push events externally', color: '#10B981' },
            { id: 'automations' as SubDialog, icon: Zap, title: 'Automations', desc: 'Auto-run on triggers', color: '#F59E0B' },
          ].map((card) => (
            <button key={card.id} onClick={() => onSubDialog(card.id)} className="flex flex-col items-center gap-2 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700/60 hover:border-primary/30 dark:hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all group text-center">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${card.color}18` }}>
                <card.icon size={18} style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{card.title}</p>
                <p className="text-3xs text-zinc-400 dark:text-zinc-500 mt-0.5">{card.desc}</p>
              </div>
              <ArrowRight size={11} className="text-zinc-300 dark:text-zinc-600 group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: API Reference ─── */

function ApiReferenceTab({ baseId, tableId }: { baseId: string | null; tableId: string | null }) {
  const [activeMethod, setActiveMethod] = useState<HttpMethod>('GET');
  const base = baseId || '{baseId}';
  const table = tableId || '{tableId}';
  const endpoint = `${API_BASE}/bases/${base}/tables/${table}/records`;

  const { data: docFields } = useDocFields(tableId);
  const usingRealFields = !!docFields && docFields.length > 0;
  const sample = buildSampleFields(docFields);
  const sampleJson = JSON.stringify(sample, null, 8).replace(/\n/g, '\n      ');
  const firstFieldName = docFields?.[0]?.name ?? 'Status';
  const secondFieldValue = docFields?.[1] ? JSON.stringify(sampleValueForField(docFields[1])) : '"Upgraded"';

  const examples: Record<HttpMethod, { title: string; desc: string; icon: React.ElementType; request: string; response: string; notes?: string }> = {
    GET: {
      title: 'List Records',
      desc: 'Fetch all records from a table. Supports pagination with offset & limit.',
      icon: List,
      request: `GET ${endpoint}
  ?limit=50&offset=0

Headers:
  Authorization: Bearer kdops_[YOUR_API_KEY]
  Content-Type: application/json`,
      response: `{
  "records": [
    {
      "id": "rec_abc123",
      "fields": ${sampleJson}
    }
  ],
  "total": 127,
  "offset": 0,
  "limit": 50
}`,
      notes: usingRealFields
        ? `Showing your actual "${table}" fields. Use limit & offset for pagination. Default limit is 100, max is 1000.`
        : 'Open this from a specific table to see your real field names here. Use limit & offset for pagination. Default limit is 100, max is 1000.',
    },
    POST: {
      title: 'Create Records',
      desc: 'Create one or more records. Unknown fields are auto-created with smart type detection.',
      icon: Send,
      request: `POST ${endpoint}

Headers:
  Authorization: Bearer kdops_[YOUR_API_KEY]
  Content-Type: application/json

Body:
{
  "records": [
    {
      "fields": ${sampleJson}
    }
  ]
}`,
      response: `{
  "records": [
    {
      "id": "rec_xyz789",
      "fields": ${sampleJson}
    }
  ]
}`,
      notes: usingRealFields
        ? `Field names and value types match your actual "${table}" schema. Any new field name you send that doesn't exist yet is auto-created. Send multiple objects in the records array for bulk create.`
        : 'Auto-detected types: Email → Email field, Website → URL, Revenue → Decimal, Joined → Date, Active → Checkbox. Send multiple objects in the records array for bulk create.',
    },
    PATCH: {
      title: 'Update Records',
      desc: 'Update one or more records by ID. Only specified fields are changed.',
      icon: Pencil,
      request: `PATCH ${endpoint}

Headers:
  Authorization: Bearer kdops_[YOUR_API_KEY]
  Content-Type: application/json

Body:
{
  "records": [
    {
      "id": "rec_xyz789",
      "fields": {
        "${firstFieldName}": ${secondFieldValue}
      }
    }
  ]
}`,
      response: `{
  "records": [
    {
      "id": "rec_xyz789",
      "fields": ${sampleJson}
    }
  ]
}`,
      notes: 'New fields are auto-created if the name doesn\'t exist yet. Only fields you include are updated — others stay unchanged.',
    },
    DELETE: {
      title: 'Delete Records',
      desc: 'Delete one or more records by ID.',
      icon: Trash2,
      request: `DELETE ${endpoint}
  ?records=rec_xyz789,rec_abc123

Headers:
  Authorization: Bearer kdops_[YOUR_API_KEY]`,
      response: `{
  "deleted": [
    { "id": "rec_xyz789", "deleted": true },
    { "id": "rec_abc123", "deleted": true }
  ]
}`,
      notes: 'Pass record IDs as comma-separated query parameter. Deleted records cannot be recovered.',
    },
  };

  const active = examples[activeMethod];

  return (
    <div className="space-y-4">
      <SectionHeader icon={Code2} title="API Reference" subtitle="Full HTTP examples for every operation" />

      {/* Endpoint */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700/80 p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
        <p className="text-3xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Base Endpoint</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-2xs font-mono text-zinc-700 dark:text-zinc-300 break-all">{endpoint}</code>
          <CopyButton text={endpoint} />
        </div>
      </div>

      {/* Auth info */}
      <div className="rounded-lg border border-warning/20 p-3 bg-warning/5 dark:bg-warning/10">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={12} className="text-warning" />
          <span className="text-2xs font-semibold text-warning">Authentication</span>
        </div>
        <p className="text-2xs text-warning/80 leading-relaxed">
          All requests require a <code className="px-1 py-0.5 bg-warning/10 dark:bg-warning/10 rounded text-3xs">Bearer</code> token.
          Pass your API key in the Authorization header: <code className="px-1 py-0.5 bg-warning/10 dark:bg-warning/10 rounded text-3xs">Authorization: Bearer kdops_[YOUR_API_KEY]</code>
        </p>
      </div>

      {/* Method tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
        {(['GET', 'POST', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
          <button
            key={m}
            onClick={() => setActiveMethod(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-2xs font-bold transition-all ${
              activeMethod === m
                ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <MethodBadge method={m} />
          </button>
        ))}
      </div>

      {/* Active example */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <active.icon size={14} className="text-zinc-500 dark:text-zinc-400" />
          <div>
            <h5 className="text-xs-plus font-semibold text-zinc-800 dark:text-zinc-200">{active.title}</h5>
            <p className="text-2xs text-zinc-500 dark:text-zinc-400">{active.desc}</p>
          </div>
        </div>

        <CodeBlock label="Request" code={active.request} language="HTTP" />
        <CodeBlock label="Response" code={active.response} language="JSON" />

        {active.notes && (
          <div className="rounded-lg border border-primary/20 dark:border-primary/20 p-3 bg-primary/5 dark:bg-primary/10">
            <p className="text-2xs text-primary leading-relaxed">
              <strong>Note:</strong> {active.notes}
            </p>
          </div>
        )}
      </div>

      {/* Type detection table */}
      {activeMethod === 'POST' && (
        <div>
          <SectionHeader icon={Sparkles} title="Auto-Detected Field Types" subtitle="KDOps inspects your data and picks the right type" />
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
            <table className="w-full text-2xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/80">
                  <th className="text-left px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Your Data</th>
                  <th className="text-left px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Detected Type</th>
                  <th className="text-left px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[
                  ['Contains @ and .', 'Email', '"user@mail.com"'],
                  ['Starts with http', 'URL', '"https://example.com"'],
                  ['YYYY-MM-DD', 'Date', '"2025-09-04"'],
                  ['ISO datetime', 'DateTime', '"2025-09-04T14:30:00Z"'],
                  ['Integer', 'Number', '42'],
                  ['Decimal', 'Decimal', '99.95'],
                  ['true / false', 'Checkbox', 'true'],
                  ['Array or object', 'JSON', '[1, 2, 3]'],
                  ['> 255 characters', 'Long Text', '"Lorem ipsum..."'],
                  ['Everything else', 'Single Line Text', '"Hello"'],
                ].map(([data, type, example]) => (
                  <tr key={type} className="text-zinc-600 dark:text-zinc-400">
                    <td className="px-3 py-1.5">{data}</td>
                    <td className="px-3 py-1.5 font-medium text-zinc-800 dark:text-zinc-200">{type}</td>
                    <td className="px-3 py-1.5 font-mono text-3xs text-zinc-500">{example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Connect Tools ─── */

const FALLBACK_DOC_FIELDS: DocField[] = [
  { name: 'Name', ui_type: 'SingleLineText' },
  { name: 'Email', ui_type: 'Email' },
  { name: 'Company', ui_type: 'SingleLineText' },
  { name: 'Amount', ui_type: 'Number' },
];

const NUMERIC_UI_TYPES = new Set(['Number', 'Decimal', 'Currency', 'Percent', 'Duration', 'Rating', 'Year']);

function buildToolFieldsBlock(fields: DocField[] | undefined, style: 'n8n' | 'zapier' | 'make'): string {
  const list = fields && fields.length ? fields : FALLBACK_DOC_FIELDS;
  const lines = list.map((f) => {
    const expr = templateExprFor(f, style);
    const value = NUMERIC_UI_TYPES.has(f.ui_type) ? expr : `"${expr}"`;
    return `        "${f.name}": ${value}`;
  });
  const sourceLabel = { n8n: 'n8n', zapier: 'Zapier', make: 'Make' }[style];
  lines.push(`        "Source": "${sourceLabel}"`);
  return lines.join(',\n');
}

function ConnectToolsTab({ baseId, tableId }: { baseId: string | null; tableId: string | null }) {
  const [activeTool, setActiveTool] = useState<'n8n' | 'zapier' | 'make' | 'curl'>('n8n');
  const base = baseId || '{baseId}';
  const table = tableId || '{tableId}';
  const endpoint = `${API_BASE}/bases/${base}/tables/${table}/records`;

  const { data: docFields } = useDocFields(tableId);
  const usingRealFields = !!docFields && docFields.length > 0;

  const tools: Record<string, { label: string; color: string; steps: { title: string; detail: string | React.ReactNode }[]; code: string; codeLabel: string }> = {
    n8n: {
      label: 'n8n',
      color: '#EA4B71',
      steps: [
        { title: 'Add an HTTP Request node', detail: 'Drag "HTTP Request" from the node palette into your workflow.' },
        { title: 'Set Method & URL', detail: <>Method: <strong>POST</strong> | URL: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">{endpoint}</code></> },
        { title: 'Configure Authentication', detail: <>Go to Authentication → <strong>Header Auth</strong>. Name: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Authorization</code> Value: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Bearer kdops_[YOUR_API_KEY]</code></> },
        { title: 'Set Body', detail: usingRealFields
            ? <>Send as <strong>JSON</strong>. The template below already uses your real field names — just map each one to the right node in your workflow.</>
            : <>Send as <strong>JSON</strong>. Set body to the records format below. Map your trigger data into the fields object.</> },
        { title: 'Test & Activate', detail: 'Click "Test step" to verify. New fields will auto-create in KDOps. Activate your workflow.' },
      ],
      code: `// n8n HTTP Request Node — Body (JSON)
{
  "records": [
    {
      "fields": {
${buildToolFieldsBlock(docFields, 'n8n')}
      }
    }
  ]
}`,
      codeLabel: 'n8n Body Template',
    },
    zapier: {
      label: 'Zapier',
      color: '#FF4A00',
      steps: [
        { title: 'Add "Webhooks by Zapier" action', detail: 'In your Zap, add a new action step and choose "Webhooks by Zapier" → "Custom Request".' },
        { title: 'Set Method & URL', detail: <>Method: <strong>POST</strong> | URL: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">{endpoint}</code></> },
        { title: 'Add Headers', detail: <>Add two headers:<br /><code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Authorization: Bearer kdops_[YOUR_API_KEY]</code><br /><code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Content-Type: application/json</code></> },
        { title: 'Map Data', detail: usingRealFields
            ? 'In the Data section, build the JSON body below using Zapier field mappings — the field names already match your table.'
            : 'In the Data section, build the JSON body using Zapier field mappings from your trigger step.' },
        { title: 'Test & Turn On', detail: 'Test the action — check KDOps to see the new record and any auto-created fields.' },
      ],
      code: `// Zapier Custom Request — Data (JSON)
{
  "records": [
    {
      "fields": {
${buildToolFieldsBlock(docFields, 'zapier')}
      }
    }
  ]
}`,
      codeLabel: 'Zapier Body Template',
    },
    make: {
      label: 'Make',
      color: '#6D00CC',
      steps: [
        { title: 'Add an HTTP module', detail: 'In your scenario, add "HTTP" → "Make a request" module.' },
        { title: 'Configure the request', detail: <>URL: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">{endpoint}</code><br />Method: <strong>POST</strong> | Body type: <strong>Raw</strong> | Content type: <strong>JSON</strong></> },
        { title: 'Add Authorization header', detail: <>In Headers, add: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Authorization: Bearer kdops_[YOUR_API_KEY]</code></> },
        { title: 'Set Request content', detail: usingRealFields
            ? 'Paste the JSON template below — it already uses your real field names — and map values from your trigger module.'
            : 'Paste the JSON template below and map fields from your trigger module.' },
        { title: 'Run once & schedule', detail: 'Use "Run once" to test, then set your schedule (instant, interval, or on-demand).' },
      ],
      code: `// Make (Integromat) — Request Content (JSON)
{
  "records": [
    {
      "fields": {
${buildToolFieldsBlock(docFields, 'make')}
      }
    }
  ]
}`,
      codeLabel: 'Make Body Template',
    },
    curl: {
      label: 'cURL / HTTP',
      color: '#374151',
      steps: [
        { title: 'Copy the command', detail: 'Use the cURL command below or adapt it to any HTTP client (Postman, Insomnia, Python requests, fetch, etc).' },
        { title: 'Replace placeholders', detail: <>Replace <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">kdops_[YOUR_API_KEY]</code> with your actual API key.</> },
        { title: 'Run it', detail: 'Execute from terminal, Postman, or your code. New fields auto-create on first use.' },
      ],
      code: `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer kdops_[YOUR_API_KEY]" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {
        "fields": ${JSON.stringify(buildSampleFields(docFields), null, 8).replace(/\n/g, '\n    ')}
      }
    ]
  }'`,
      codeLabel: 'cURL Command',
    },
  };

  const active = tools[activeTool];

  return (
    <div className="space-y-4">
      <SectionHeader icon={Plug} title="Connect Your Tools" subtitle="Step-by-step setup for popular platforms" />

      {/* Tool selector */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
        {(Object.keys(tools) as Array<keyof typeof tools>).map((key) => (
          <button
            key={key}
            onClick={() => setActiveTool(key as typeof activeTool)}
            className={`flex-1 py-2 rounded-md text-2xs font-bold transition-all ${
              activeTool === key
                ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <span style={{ color: activeTool === key ? tools[key].color : undefined }}>{tools[key].label}</span>
          </button>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        {active.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/40">
            <span className="flex items-center justify-center w-5 h-5 rounded-full text-white text-3xs font-bold shrink-0 mt-0.5" style={{ backgroundColor: active.color }}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{step.title}</p>
              <div className="text-2xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {!usingRealFields && (
        <p className="text-3xs text-zinc-400 dark:text-zinc-500 italic px-0.5">
          Showing generic sample fields — open this from a specific table to see your real field names here instead.
        </p>
      )}

      {/* Code template */}
      <CodeBlock label={active.codeLabel} code={active.code} language={activeTool === 'curl' ? 'bash' : 'JSON'} />

      {/* Webhook tip */}
      <div className="rounded-lg border border-success/20 p-3 bg-success/5 dark:bg-success/10">
        <div className="flex items-center gap-2 mb-1">
          <Webhook size={12} className="text-success" />
          <span className="text-2xs font-semibold text-success">Pro Tip: Two-Way Sync</span>
        </div>
        <p className="text-2xs text-success/80 leading-relaxed">
          Set up a <strong>Webhook</strong> in KDOps to push changes back to your tool. When a record is created/updated/deleted in KDOps,
          your n8n/Zapier workflow gets notified instantly.
        </p>
      </div>
    </div>
  );
}

/* ─── Main Dialog ─── */

const TAB_NAV: { id: MainTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Globe },
  { id: 'api-reference', label: 'API Reference', icon: Code2 },
  { id: 'connect', label: 'Connect Tools', icon: Plug },
];

export function IntegrationsDialog({ open, onOpenChange, tableId, baseId }: IntegrationsDialogProps) {
  const [tab, setTab] = useState<MainTab>('overview');
  const [subDialog, setSubDialog] = useState<SubDialog>(null);

  const handleSubClose = useCallback(() => setSubDialog(null), []);

  return (
    <>
      <Dialog open={open && !subDialog} onOpenChange={(o) => { if (!o) { setTab('overview'); } onOpenChange(o); }}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-700/80">
            <div className="flex items-center gap-2">
              <Cable size={16} className="text-primary" />
              <h2 className="text-base font-bold text-zinc-800 dark:text-zinc-100">Integrations</h2>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 px-5 py-2 border-b border-zinc-200/80 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/30">
            {TAB_NAV.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-medium transition-all ${
                  tab === t.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'
                }`}
              >
                <t.icon size={12} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="overflow-y-auto p-5" style={{ maxHeight: 'calc(88vh - 100px)' }}>
            {tab === 'overview' && <OverviewTab baseId={baseId} onSubDialog={setSubDialog} onSwitchTab={setTab} />}
            {tab === 'api-reference' && <ApiReferenceTab baseId={baseId} tableId={tableId} />}
            {tab === 'connect' && <ConnectToolsTab baseId={baseId} tableId={tableId} />}
          </div>
        </DialogContent>
      </Dialog>

      {subDialog === 'api-keys' && (
        <Suspense fallback={null}>
          <ApiTokensDialog open={true} onOpenChange={handleSubClose} baseId={baseId} />
        </Suspense>
      )}
      {subDialog === 'webhooks' && (
        <Suspense fallback={null}>
          <WebhooksDialog open={true} onOpenChange={handleSubClose} tableId={tableId} baseId={baseId} />
        </Suspense>
      )}
      {subDialog === 'automations' && (
        <Suspense fallback={null}>
          <AutomationsDialog open={true} onOpenChange={handleSubClose} tableId={tableId} baseId={baseId} />
        </Suspense>
      )}
    </>
  );
}
