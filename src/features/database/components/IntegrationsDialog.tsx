import { useState, useCallback, lazy, Suspense } from 'react';
import { Cable, Key, Webhook, Zap, Copy, Check, ChevronRight, ArrowRight, BookOpen, Code2, Plug, Globe, FileJson, Send, Trash2, Pencil, List, Sparkles, ArrowLeft, Shield } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

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
      {copied ? <Check size={size} className="text-emerald-500" /> : <Copy size={size} />}
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
    GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  };
  return <span className={`text-3xs font-bold px-1.5 py-0.5 rounded ${colors[method]}`}>{method}</span>;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-2xs font-medium rounded-lg transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 mt-0.5">
        <Icon size={14} className="text-blue-600 dark:text-blue-400" />
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
          <div className="p-2.5 rounded-xl bg-blue-600/15 dark:bg-blue-500/25">
            <Cable size={22} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-100">Connect Your Tools</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
              KDOps has a full <strong>Airtable-compatible REST API</strong>. Connect n8n, Zapier, Make, or any tool
              that speaks HTTP. Fields are <strong className="text-blue-600 dark:text-blue-400">auto-created</strong> when you send new data — no setup needed.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => onSwitchTab('api-reference')} className="text-2xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Code2 size={12} /> View API Reference
              </button>
              <span className="text-zinc-300 dark:text-zinc-600">|</span>
              <button onClick={() => onSwitchTab('connect')} className="text-2xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
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
            <button key={step} onClick={action} className="w-full flex items-start gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 hover:border-blue-300 dark:hover:border-blue-700 transition-colors text-left group">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-2xs font-bold shrink-0 mt-0.5">{step}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{title}</p>
                <p className="text-2xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
              <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600 group-hover:text-blue-500 transition-colors shrink-0 mt-1" />
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
            <button key={card.id} onClick={() => onSubDialog(card.id)} className="flex flex-col items-center gap-2 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700/60 hover:border-blue-300 dark:hover:border-blue-600/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all group text-center">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${card.color}18` }}>
                <card.icon size={18} style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{card.title}</p>
                <p className="text-3xs text-zinc-400 dark:text-zinc-500 mt-0.5">{card.desc}</p>
              </div>
              <ArrowRight size={11} className="text-zinc-300 dark:text-zinc-600 group-hover:text-blue-500 transition-colors" />
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

  const examples: Record<HttpMethod, { title: string; desc: string; icon: React.ElementType; request: string; response: string; notes?: string }> = {
    GET: {
      title: 'List Records',
      desc: 'Fetch all records from a table. Supports pagination with offset & limit.',
      icon: List,
      request: `GET ${endpoint}
  ?limit=50&offset=0

Headers:
  Authorization: Bearer kdops_YOUR_API_KEY
  Content-Type: application/json`,
      response: `{
  "records": [
    {
      "id": "rec_abc123",
      "fields": {
        "Name": "John Doe",
        "Email": "john@example.com",
        "Amount": 2500,
        "Status": "Active",
        "Created": "2025-09-01"
      }
    },
    {
      "id": "rec_def456",
      "fields": {
        "Name": "Jane Smith",
        "Email": "jane@example.com",
        "Amount": 4800,
        "Status": "Pending",
        "Created": "2025-09-03"
      }
    }
  ],
  "total": 127,
  "offset": 0,
  "limit": 50
}`,
      notes: 'Use limit & offset for pagination. Default limit is 100, max is 1000.',
    },
    POST: {
      title: 'Create Records',
      desc: 'Create one or more records. Unknown fields are auto-created with smart type detection.',
      icon: Send,
      request: `POST ${endpoint}

Headers:
  Authorization: Bearer kdops_YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "records": [
    {
      "fields": {
        "Name": "Alice Johnson",
        "Email": "alice@company.com",
        "Website": "https://alice.dev",
        "Revenue": 15000.50,
        "Joined": "2025-08-15",
        "Active": true,
        "Notes": "Key enterprise client"
      }
    }
  ]
}`,
      response: `{
  "records": [
    {
      "id": "rec_xyz789",
      "fields": {
        "Name": "Alice Johnson",
        "Email": "alice@company.com",
        "Website": "https://alice.dev",
        "Revenue": 15000.50,
        "Joined": "2025-08-15",
        "Active": true,
        "Notes": "Key enterprise client"
      }
    }
  ]
}`,
      notes: 'Auto-detected types: Email → Email field, Website → URL, Revenue → Decimal, Joined → Date, Active → Checkbox. Send multiple objects in the records array for bulk create.',
    },
    PATCH: {
      title: 'Update Records',
      desc: 'Update one or more records by ID. Only specified fields are changed.',
      icon: Pencil,
      request: `PATCH ${endpoint}

Headers:
  Authorization: Bearer kdops_YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "records": [
    {
      "id": "rec_xyz789",
      "fields": {
        "Revenue": 22000,
        "Status": "Upgraded",
        "LastContact": "2025-09-04T14:30:00Z"
      }
    }
  ]
}`,
      response: `{
  "records": [
    {
      "id": "rec_xyz789",
      "fields": {
        "Name": "Alice Johnson",
        "Email": "alice@company.com",
        "Revenue": 22000,
        "Status": "Upgraded",
        "LastContact": "2025-09-04T14:30:00Z"
      }
    }
  ]
}`,
      notes: 'New fields (like "Status", "LastContact") are auto-created. Only fields you include are updated — others stay unchanged.',
    },
    DELETE: {
      title: 'Delete Records',
      desc: 'Delete one or more records by ID.',
      icon: Trash2,
      request: `DELETE ${endpoint}
  ?records=rec_xyz789,rec_abc123

Headers:
  Authorization: Bearer kdops_YOUR_API_KEY`,
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
      <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 p-3 bg-amber-50/50 dark:bg-amber-900/10">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={12} className="text-amber-600 dark:text-amber-400" />
          <span className="text-2xs font-semibold text-amber-700 dark:text-amber-400">Authentication</span>
        </div>
        <p className="text-2xs text-amber-600 dark:text-amber-400/80 leading-relaxed">
          All requests require a <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded text-3xs">Bearer</code> token.
          Pass your API key in the Authorization header: <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded text-3xs">Authorization: Bearer kdops_YOUR_KEY</code>
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
          <div className="rounded-lg border border-blue-200 dark:border-blue-800/40 p-3 bg-blue-50/50 dark:bg-blue-900/10">
            <p className="text-2xs text-blue-700 dark:text-blue-400 leading-relaxed">
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

function ConnectToolsTab({ baseId, tableId }: { baseId: string | null; tableId: string | null }) {
  const [activeTool, setActiveTool] = useState<'n8n' | 'zapier' | 'make' | 'curl'>('n8n');
  const base = baseId || '{baseId}';
  const table = tableId || '{tableId}';
  const endpoint = `${API_BASE}/bases/${base}/tables/${table}/records`;

  const tools: Record<string, { label: string; color: string; steps: { title: string; detail: string | React.ReactNode }[]; code: string; codeLabel: string }> = {
    n8n: {
      label: 'n8n',
      color: '#EA4B71',
      steps: [
        { title: 'Add an HTTP Request node', detail: 'Drag "HTTP Request" from the node palette into your workflow.' },
        { title: 'Set Method & URL', detail: <>Method: <strong>POST</strong> | URL: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">{endpoint}</code></> },
        { title: 'Configure Authentication', detail: <>Go to Authentication → <strong>Header Auth</strong>. Name: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Authorization</code> Value: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Bearer kdops_YOUR_KEY</code></> },
        { title: 'Set Body', detail: <>Send as <strong>JSON</strong>. Set body to the records format below. Map your trigger data into the fields object.</> },
        { title: 'Test & Activate', detail: 'Click "Test step" to verify. New fields will auto-create in KDOps. Activate your workflow.' },
      ],
      code: `// n8n HTTP Request Node — Body (JSON)
{
  "records": [
    {
      "fields": {
        "Name": "{{ $json.name }}",
        "Email": "{{ $json.email }}",
        "Company": "{{ $json.company }}",
        "Amount": {{ $json.amount }},
        "Source": "n8n"
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
        { title: 'Add Headers', detail: <>Add two headers:<br /><code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Authorization: Bearer kdops_YOUR_KEY</code><br /><code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Content-Type: application/json</code></> },
        { title: 'Map Data', detail: 'In the Data section, build the JSON body using Zapier field mappings from your trigger step.' },
        { title: 'Test & Turn On', detail: 'Test the action — check KDOps to see the new record and any auto-created fields.' },
      ],
      code: `// Zapier Custom Request — Data (JSON)
{
  "records": [
    {
      "fields": {
        "Name": "{{name}}",
        "Email": "{{email}}",
        "Phone": "{{phone}}",
        "Deal Value": {{deal_value}},
        "Source": "Zapier"
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
        { title: 'Add Authorization header', detail: <>In Headers, add: <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">Authorization: Bearer kdops_YOUR_KEY</code></> },
        { title: 'Set Request content', detail: 'Paste the JSON template below and map fields from your trigger module.' },
        { title: 'Run once & schedule', detail: 'Use "Run once" to test, then set your schedule (instant, interval, or on-demand).' },
      ],
      code: `// Make (Integromat) — Request Content (JSON)
{
  "records": [
    {
      "fields": {
        "Name": "{{1.name}}",
        "Email": "{{1.email}}",
        "Website": "{{1.website}}",
        "Revenue": {{1.revenue}},
        "Source": "Make"
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
        { title: 'Replace placeholders', detail: <>Replace <code className="text-3xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono">kdops_YOUR_KEY</code> with your actual API key.</> },
        { title: 'Run it', detail: 'Execute from terminal, Postman, or your code. New fields auto-create on first use.' },
      ],
      code: `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {
        "fields": {
          "Name": "John Doe",
          "Email": "john@example.com",
          "Website": "https://johndoe.com",
          "Amount": 2500.00,
          "Joined": "2025-09-04",
          "Active": true
        }
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

      {/* Code template */}
      <CodeBlock label={active.codeLabel} code={active.code} language={activeTool === 'curl' ? 'bash' : 'JSON'} />

      {/* Webhook tip */}
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 p-3 bg-emerald-50/50 dark:bg-emerald-900/10">
        <div className="flex items-center gap-2 mb-1">
          <Webhook size={12} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-2xs font-semibold text-emerald-700 dark:text-emerald-400">Pro Tip: Two-Way Sync</span>
        </div>
        <p className="text-2xs text-emerald-600 dark:text-emerald-400/80 leading-relaxed">
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
              <Cable size={16} className="text-blue-600 dark:text-blue-400" />
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
                    ? 'bg-blue-600 text-white shadow-sm'
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
