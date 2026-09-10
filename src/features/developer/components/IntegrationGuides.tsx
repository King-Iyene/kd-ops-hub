import { useState, useCallback, useMemo } from 'react';
import {
  Plug, Copy, Check, ChevronRight, ExternalLink, AlertTriangle,
  Lightbulb, Code2, Terminal, Globe, ArrowRight, Zap,
  Users, ListTodo, Calendar, Receipt, Car, FileText, Building2, Database,
  Play, BookOpen, Shield, Hash, Clock, ChevronDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* ─── Constants ─── */

const BASE_URL = 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/platform-api/v1';

/* ─── Types ─── */

type PlatformId = 'n8n' | 'zapier' | 'make' | 'python' | 'nodejs' | 'curl' | 'php';
type ModuleId = 'employees' | 'tasks' | 'leave' | 'expenses' | 'fleet' | 'invoices' | 'clients' | 'database';

interface Platform {
  id: PlatformId;
  name: string;
  color: string;
  bgLight: string;
  bgDark: string;
  icon: React.ElementType;
  description: string;
}

interface ModuleDef {
  id: ModuleId;
  name: string;
  icon: React.ElementType;
  endpoint: string;
  description: string;
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
      title="Copy to clipboard"
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
          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
          {language && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 font-medium">
              {language}
            </span>
          )}
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="px-3 py-2.5 text-[11px] leading-relaxed font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all bg-white dark:bg-zinc-900/60 overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}

function StepNumber({ n, color }: { n: number; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[11px] font-bold shrink-0"
      style={{ backgroundColor: color }}
    >
      {n}
    </span>
  );
}

function Callout({ type, children }: { type: 'tip' | 'warning' | 'info'; children: React.ReactNode }) {
  const styles = {
    tip: {
      border: 'border-emerald-300 dark:border-emerald-800',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      icon: <Lightbulb size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
      label: 'Pro Tip',
      labelColor: 'text-emerald-700 dark:text-emerald-400',
    },
    warning: {
      border: 'border-amber-300 dark:border-amber-800',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      icon: <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
      label: 'Important',
      labelColor: 'text-amber-700 dark:text-amber-400',
    },
    info: {
      border: 'border-blue-300 dark:border-blue-800',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      icon: <Shield size={14} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />,
      label: 'Note',
      labelColor: 'text-blue-700 dark:text-blue-400',
    },
  };
  const s = styles[type];
  return (
    <div className={cn('rounded-lg border px-3 py-2.5 text-xs leading-relaxed', s.border, s.bg)}>
      <div className="flex items-start gap-2">
        {s.icon}
        <div>
          <span className={cn('font-semibold', s.labelColor)}>{s.label}: </span>
          <span className="text-zinc-700 dark:text-zinc-300">{children}</span>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-6 mb-3 flex items-center gap-2">
      <ChevronRight size={14} className="text-zinc-400" />
      {children}
    </h3>
  );
}

/* ─── Data ─── */

const PLATFORMS: Platform[] = [
  { id: 'n8n', name: 'n8n', color: '#EA4B71', bgLight: 'bg-[#EA4B71]/10', bgDark: 'dark:bg-[#EA4B71]/10', icon: Zap, description: 'Open-source workflow automation' },
  { id: 'zapier', name: 'Zapier', color: '#FF4A00', bgLight: 'bg-[#FF4A00]/10', bgDark: 'dark:bg-[#FF4A00]/10', icon: Zap, description: 'No-code automation platform' },
  { id: 'make', name: 'Make', color: '#6D00CC', bgLight: 'bg-[#6D00CC]/10', bgDark: 'dark:bg-[#6D00CC]/10', icon: Globe, description: 'Visual automation (formerly Integromat)' },
  { id: 'python', name: 'Python', color: '#3776AB', bgLight: 'bg-[#3776AB]/10', bgDark: 'dark:bg-[#3776AB]/10', icon: Code2, description: 'Python with requests library' },
  { id: 'nodejs', name: 'Node.js', color: '#339933', bgLight: 'bg-[#339933]/10', bgDark: 'dark:bg-[#339933]/10', icon: Terminal, description: 'JavaScript/TypeScript with fetch' },
  { id: 'curl', name: 'cURL', color: '#374151', bgLight: 'bg-zinc-200/60', bgDark: 'dark:bg-zinc-700/30', icon: Terminal, description: 'Command-line HTTP requests' },
  { id: 'php', name: 'PHP', color: '#777BB4', bgLight: 'bg-[#777BB4]/10', bgDark: 'dark:bg-[#777BB4]/10', icon: Code2, description: 'PHP with cURL extension' },
];

const MODULES: ModuleDef[] = [
  { id: 'employees', name: 'Employees', icon: Users, endpoint: '/employees', description: 'Create, list, update, and remove employee records' },
  { id: 'tasks', name: 'Tasks', icon: ListTodo, endpoint: '/tasks', description: 'Manage tasks, assign them, and track completion' },
  { id: 'leave', name: 'Leave', icon: Calendar, endpoint: '/leave', description: 'Submit leave requests and check balances' },
  { id: 'expenses', name: 'Expenses', icon: Receipt, endpoint: '/expenses', description: 'Submit and approve expense claims' },
  { id: 'fleet', name: 'Fleet / Fuel', icon: Car, endpoint: '/fleet/fuel-requests', description: 'Request fuel disbursements for fleet vehicles' },
  { id: 'invoices', name: 'Invoices', icon: FileText, endpoint: '/invoices', description: 'Generate, send, and track invoices' },
  { id: 'clients', name: 'Clients', icon: Building2, endpoint: '/clients', description: 'Manage your client directory' },
  { id: 'database', name: 'Database', icon: Database, endpoint: '/database', description: 'Direct table queries for advanced use' },
];

/* ─── Module body templates ─── */

function getCreateBody(mod: ModuleId, syntax: 'json' | 'n8n' | 'zapier' | 'make'): string {
  const wrap = (field: string) => {
    if (syntax === 'n8n') return `{{ $json.${field} }}`;
    if (syntax === 'zapier') return `{{${field}}}`;
    if (syntax === 'make') return `{{1.${field}}}`;
    return `<${field}>`;
  };

  switch (mod) {
    case 'employees':
      return JSON.stringify({
        first_name: wrap('firstName'),
        last_name: wrap('lastName'),
        email: wrap('email'),
        department: wrap('department'),
        role: 'field_staff',
        phone: wrap('phone'),
      }, null, 2);
    case 'tasks':
      return JSON.stringify({
        title: wrap('title'),
        description: wrap('description'),
        priority: wrap('priority'),
        due_date: wrap('dueDate'),
        assignee_id: wrap('assigneeId'),
      }, null, 2);
    case 'leave':
      return JSON.stringify({
        employee_id: wrap('employeeId'),
        leave_type: 'annual',
        start_date: wrap('startDate'),
        end_date: wrap('endDate'),
        reason: wrap('reason'),
      }, null, 2);
    case 'expenses':
      return JSON.stringify({
        employee_id: wrap('employeeId'),
        amount: wrap('amount'),
        currency: 'NGN',
        category: wrap('category'),
        description: wrap('description'),
        receipt_url: wrap('receiptUrl'),
      }, null, 2);
    case 'fleet':
      return JSON.stringify({
        vehicle_id: wrap('vehicleId'),
        driver_id: wrap('driverId'),
        amount: wrap('amount'),
        litres: wrap('litres'),
        station: wrap('station'),
      }, null, 2);
    case 'invoices':
      return JSON.stringify({
        client_id: wrap('clientId'),
        items: [
          {
            description: wrap('itemDescription'),
            quantity: wrap('quantity'),
            unit_price: wrap('unitPrice'),
          },
        ],
        due_date: wrap('dueDate'),
        currency: 'NGN',
      }, null, 2);
    case 'clients':
      return JSON.stringify({
        name: wrap('companyName'),
        contact_name: wrap('contactName'),
        email: wrap('email'),
        phone: wrap('phone'),
        address: wrap('address'),
      }, null, 2);
    case 'database':
      return JSON.stringify({
        table: wrap('tableName'),
        select: '*',
        filters: { column: wrap('column'), operator: 'eq', value: wrap('value') },
        limit: 50,
      }, null, 2);
  }
}

function getPythonExample(mod: ModuleDef): string {
  const body = getCreateBody(mod.id, 'json')
    .replace(/<(\w+)>/g, '"example_$1"');
  return `import requests

API_KEY = "kdops_YOUR_KEY"
BASE_URL = "${BASE_URL}"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# ─── List ${mod.name} ───
response = requests.get(f"{BASE_URL}${mod.endpoint}", headers=headers)
if response.status_code == 200:
    data = response.json()
    print(f"Found {len(data.get('data', []))} records")
else:
    print(f"Error {response.status_code}: {response.text}")

# ─── Create ${mod.name.replace(/s$/, '')} ───
payload = ${body.replace(/"example_(\w+)"/g, '"example_$1"')}

response = requests.post(
    f"{BASE_URL}${mod.endpoint}",
    headers=headers,
    json=payload
)

if response.status_code in (200, 201):
    record = response.json()
    print("Created:", record)
elif response.status_code == 401:
    print("Error: Invalid or expired API key")
elif response.status_code == 403:
    print("Error: API key lacks required scope")
elif response.status_code == 422:
    print("Error: Invalid data -", response.json())
elif response.status_code == 429:
    print("Error: Rate limited - wait 60s and retry")
else:
    print(f"Error {response.status_code}: {response.text}")

# ─── Update ${mod.name.replace(/s$/, '')} ───
record_id = "RECORD_ID"
updates = {"status": "active"}  # fields to update
response = requests.patch(
    f"{BASE_URL}${mod.endpoint}/{record_id}",
    headers=headers,
    json=updates
)
print("Updated:" if response.ok else f"Error: {response.text}")

# ─── Delete ${mod.name.replace(/s$/, '')} ───
response = requests.delete(
    f"{BASE_URL}${mod.endpoint}/{record_id}",
    headers=headers
)
print("Deleted" if response.ok else f"Error: {response.text}")

# ─── Pagination ───
# Use ?page=1&per_page=50 query params
response = requests.get(
    f"{BASE_URL}${mod.endpoint}?page=1&per_page=50",
    headers=headers
)`;
}

function getNodeExample(mod: ModuleDef): string {
  const body = getCreateBody(mod.id, 'json')
    .replace(/<(\w+)>/g, '"example_$1"');
  return `const API_KEY = "kdops_YOUR_KEY";
const BASE_URL = "${BASE_URL}";

const headers = {
  "Authorization": \`Bearer \${API_KEY}\`,
  "Content-Type": "application/json",
};

// ─── List ${mod.name} ───
const listRes = await fetch(\`\${BASE_URL}${mod.endpoint}\`, { headers });
if (!listRes.ok) throw new Error(\`\${listRes.status}: \${await listRes.text()}\`);
const { data: records } = await listRes.json();
console.log(\`Found \${records.length} records\`);

// ─── Create ${mod.name.replace(/s$/, '')} ───
const payload = ${body.replace(/"example_(\w+)"/g, '"example_$1"')};

const createRes = await fetch(\`\${BASE_URL}${mod.endpoint}\`, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});

if (!createRes.ok) {
  const err = await createRes.json().catch(() => ({ message: "Unknown error" }));
  if (createRes.status === 401) console.error("Invalid or expired API key");
  else if (createRes.status === 403) console.error("API key lacks required scope");
  else if (createRes.status === 422) console.error("Invalid data:", err);
  else if (createRes.status === 429) console.error("Rate limited - wait 60s");
  else console.error(\`Error \${createRes.status}:\`, err);
} else {
  const created = await createRes.json();
  console.log("Created:", created);
}

// ─── Update ${mod.name.replace(/s$/, '')} ───
const recordId = "RECORD_ID";
const updateRes = await fetch(\`\${BASE_URL}${mod.endpoint}/\${recordId}\`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ status: "active" }),
});
console.log(updateRes.ok ? "Updated" : \`Error: \${await updateRes.text()}\`);

// ─── Delete ${mod.name.replace(/s$/, '')} ───
const deleteRes = await fetch(\`\${BASE_URL}${mod.endpoint}/\${recordId}\`, {
  method: "DELETE",
  headers,
});
console.log(deleteRes.ok ? "Deleted" : \`Error: \${await deleteRes.text()}\`);

// ─── Pagination ───
const page2 = await fetch(\`\${BASE_URL}${mod.endpoint}?page=2&per_page=50\`, { headers })
  .then(r => r.json());`;
}

function getCurlExample(mod: ModuleDef): string {
  const body = getCreateBody(mod.id, 'json')
    .replace(/<(\w+)>/g, 'example_$1')
    .replace(/\n/g, ' \\\n  ');
  return `# ─── List ${mod.name} ───
curl -X GET \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${BASE_URL}${mod.endpoint}"

# ─── Create ${mod.name.replace(/s$/, '')} ───
curl -X POST \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${getCreateBody(mod.id, 'json').replace(/<(\w+)>/g, 'example_$1').replace(/'/g, "\\'")}' \\
  "${BASE_URL}${mod.endpoint}"

# ─── Update ${mod.name.replace(/s$/, '')} ───
curl -X PATCH \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"active"}' \\
  "${BASE_URL}${mod.endpoint}/RECORD_ID"

# ─── Delete ${mod.name.replace(/s$/, '')} ───
curl -X DELETE \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${BASE_URL}${mod.endpoint}/RECORD_ID"

# ─── Pagination ───
curl -X GET \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  "${BASE_URL}${mod.endpoint}?page=1&per_page=50"`;
}

function getPhpExample(mod: ModuleDef): string {
  const indent = (s: string, n: number) => s.split('\n').map((l, i) => i === 0 ? l : ' '.repeat(n) + l).join('\n');
  return `<?php
$apiKey  = "kdops_YOUR_KEY";
$baseUrl = "${BASE_URL}";

/**
 * Helper: make an API request to KDOps
 */
function kdopsRequest(string $method, string $url, ?array $body = null): array {
    global $apiKey;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Bearer $apiKey",
            "Content-Type: application/json",
        ],
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $response = curl_exec($ch);
    $status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [
        "status" => $status,
        "data"   => json_decode($response, true),
    ];
}

// ─── List ${mod.name} ───
$result = kdopsRequest("GET", "$baseUrl${mod.endpoint}");
if ($result["status"] === 200) {
    echo "Found " . count($result["data"]["data"]) . " records\\n";
} else {
    echo "Error {$result['status']}: " . json_encode($result["data"]) . "\\n";
}

// ─── Create ${mod.name.replace(/s$/, '')} ───
$payload = ${indent(getCreateBody(mod.id, 'json').replace(/<(\w+)>/g, '"example_$1"').replace(/\{/g, '[').replace(/\}/g, ']').replace(/:/g, ' =>'), 4)};

$result = kdopsRequest("POST", "$baseUrl${mod.endpoint}", $payload);
if (in_array($result["status"], [200, 201])) {
    echo "Created: " . json_encode($result["data"]) . "\\n";
} elseif ($result["status"] === 401) {
    echo "Error: Invalid or expired API key\\n";
} elseif ($result["status"] === 429) {
    echo "Error: Rate limited - wait 60s and retry\\n";
} else {
    echo "Error {$result['status']}: " . json_encode($result["data"]) . "\\n";
}

// ─── Update ${mod.name.replace(/s$/, '')} ───
$recordId = "RECORD_ID";
$result = kdopsRequest("PATCH", "$baseUrl${mod.endpoint}/$recordId", ["status" => "active"]);
echo $result["status"] === 200 ? "Updated\\n" : "Error: " . json_encode($result["data"]) . "\\n";

// ─── Delete ${mod.name.replace(/s$/, '')} ───
$result = kdopsRequest("DELETE", "$baseUrl${mod.endpoint}/$recordId");
echo $result["status"] === 200 ? "Deleted\\n" : "Error: " . json_encode($result["data"]) . "\\n";
?>`;
}

/* ─── Guide Components per Platform ─── */

function N8nGuide({ mod, color }: { mod: ModuleDef; color: string }) {
  const body = getCreateBody(mod.id, 'n8n');
  return (
    <div className="space-y-4">
      <SectionTitle>Prerequisites</SectionTitle>
      <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 ml-4">
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> An n8n instance running (self-hosted or n8n Cloud)</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A KDOps API key with the <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">{mod.id}:read</code> and <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">{mod.id}:write</code> scopes</li>
      </ul>
      <Callout type="info">
        Don't have an API key yet? Go to the <strong>API Keys</strong> tab in this Developer Hub and click "Create Key." Select the scopes you need for {mod.name.toLowerCase()}.
      </Callout>

      <SectionTitle>Step-by-Step: Create an n8n Workflow for {mod.name}</SectionTitle>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <StepNumber n={1} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Open your n8n instance</strong> and click the <strong>"+ New Workflow"</strong> button in the top-right corner.
            Give it a descriptive name, e.g., <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">KDOps {mod.name} Sync</code>.
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={2} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Add a trigger node.</strong> Click the <strong>"+"</strong> button on the canvas. Choose your trigger:
            <ul className="mt-1.5 ml-4 space-y-1 list-disc text-zinc-500 dark:text-zinc-400">
              <li><strong>Schedule Trigger</strong> &mdash; runs on a timer (e.g., every 5 minutes)</li>
              <li><strong>Webhook</strong> &mdash; runs when KDOps sends an event</li>
              <li><strong>Manual Trigger</strong> &mdash; for testing (click "Test workflow" to run)</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={3} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Add an HTTP Request node.</strong> Click <strong>"+"</strong> after the trigger. Search for <strong>"HTTP Request"</strong> in the node palette and click it to add it.
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={4} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Configure the HTTP Request node:</strong>
            <div className="mt-2 space-y-2">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <table className="w-full text-[11px]">
                  <tbody>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 w-[140px]">Method</td>
                      <td className="px-3 py-2"><code className="font-mono">GET</code> (list) / <code className="font-mono">POST</code> (create) / <code className="font-mono">PATCH</code> (update) / <code className="font-mono">DELETE</code> (remove)</td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">URL</td>
                      <td className="px-3 py-2 font-mono break-all">{BASE_URL}{mod.endpoint}</td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Authentication</td>
                      <td className="px-3 py-2">Select <strong>"Header Auth"</strong> from the dropdown</td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Header Name</td>
                      <td className="px-3 py-2 font-mono">Authorization</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Header Value</td>
                      <td className="px-3 py-2 font-mono">Bearer kdops_YOUR_KEY</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={5} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>For POST/PATCH requests</strong> &mdash; set the body:
            <ul className="mt-1.5 ml-4 space-y-1 list-disc text-zinc-500 dark:text-zinc-400">
              <li>Under <strong>"Body Content Type"</strong>, select <strong>"JSON"</strong></li>
              <li>Toggle to <strong>"JSON"</strong> mode (not "Parameters")</li>
              <li>Paste the template below</li>
            </ul>
          </div>
        </div>
      </div>

      <CodeBlock label={`Create ${mod.name.replace(/s$/, '')} - JSON Body`} code={body} language="json" />

      <div className="flex items-start gap-3">
        <StepNumber n={6} color={color} />
        <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <strong>Test the node.</strong> Click the <strong>"Test step"</strong> button at the top of the HTTP Request node. If configured correctly, you'll see a green checkmark and the API response on the right panel.
        </div>
      </div>

      <div className="flex items-start gap-3">
        <StepNumber n={7} color={color} />
        <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <strong>Activate the workflow.</strong> Toggle the <strong>"Active"</strong> switch in the top-right corner. Your workflow is now live and will run on the schedule or when triggered.
        </div>
      </div>

      <Callout type="tip">
        To map data from a previous node, click the field, then drag a value from the left panel's "Input" data. n8n uses the syntax <code className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 font-mono">{'{{ $json.fieldName }}'}</code> to reference data from the previous node.
      </Callout>

      <SectionTitle>Receiving Webhooks from KDOps in n8n</SectionTitle>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <StepNumber n={1} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            In your n8n workflow, add a <strong>"Webhook"</strong> trigger node (search for "Webhook" in the node palette).
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={2} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Set HTTP Method to <strong>POST</strong>. n8n will display a <strong>webhook URL</strong> &mdash; copy it.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={3} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Go to the KDOps Developer Hub &rarr; <strong>Webhooks</strong> tab &rarr; click <strong>"Add Webhook"</strong>.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={4} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Paste the n8n webhook URL. Select the events you want to receive (e.g., <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">{mod.id.replace(/s$/, '')}.created</code>, <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">{mod.id.replace(/s$/, '')}.updated</code>).
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={5} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Click <strong>"Save"</strong>. Now whenever that event fires in KDOps, n8n receives it instantly.
          </div>
        </div>
      </div>

      <SectionTitle>Common Issues</SectionTitle>
      <CommonIssues platform="n8n" />
    </div>
  );
}

function ZapierGuide({ mod, color }: { mod: ModuleDef; color: string }) {
  const body = getCreateBody(mod.id, 'zapier');
  return (
    <div className="space-y-4">
      <SectionTitle>Prerequisites</SectionTitle>
      <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 ml-4">
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A Zapier account (free or paid)</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A KDOps API key with appropriate scopes</li>
      </ul>

      <Callout type="info">
        Zapier's free plan gives you 100 tasks/month. For production use with KDOps, you'll likely need a paid plan.
      </Callout>

      <SectionTitle>Step-by-Step: Create a Zap for {mod.name}</SectionTitle>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <StepNumber n={1} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Log in to Zapier</strong> and click <strong>"+ Create"</strong> &rarr; <strong>"Zaps"</strong> from the left sidebar.
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={2} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Choose your Trigger.</strong> This is what starts the Zap. Common triggers:
            <ul className="mt-1.5 ml-4 space-y-1 list-disc text-zinc-500 dark:text-zinc-400">
              <li><strong>Google Sheets</strong> &rarr; "New Spreadsheet Row" (sync sheet data to KDOps)</li>
              <li><strong>Gmail</strong> &rarr; "New Email" (create task from email)</li>
              <li><strong>Schedule by Zapier</strong> &rarr; "Every Day" (daily sync)</li>
              <li><strong>Webhooks by Zapier</strong> &rarr; "Catch Hook" (receive KDOps events)</li>
            </ul>
            Configure and test the trigger.
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={3} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Add an Action step.</strong> Click the <strong>"+"</strong> below your trigger. Search for <strong>"Webhooks by Zapier"</strong> and select it. Choose <strong>"Custom Request"</strong> as the action event.
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={4} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Configure the Custom Request:</strong>
            <div className="mt-2 space-y-2">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <table className="w-full text-[11px]">
                  <tbody>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 w-[140px]">Method</td>
                      <td className="px-3 py-2"><code className="font-mono">POST</code></td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">URL</td>
                      <td className="px-3 py-2 font-mono break-all">{BASE_URL}{mod.endpoint}</td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Headers</td>
                      <td className="px-3 py-2">
                        <div className="space-y-1 font-mono">
                          <div>Authorization | Bearer kdops_YOUR_KEY</div>
                          <div>Content-Type | application/json</div>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Data</td>
                      <td className="px-3 py-2">Paste the JSON template (below)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={5} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Paste the JSON body</strong> into the "Data" field. Replace the <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">{'{{field}}'}</code> placeholders by clicking each one and mapping it to your trigger's data from the dropdown.
          </div>
        </div>
      </div>

      <CodeBlock label={`Create ${mod.name.replace(/s$/, '')} - JSON Body`} code={body} language="json" />

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <StepNumber n={6} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Test the action.</strong> Click <strong>"Test step"</strong>. Zapier will make a real API call. Check that you see a success response.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={7} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Publish the Zap.</strong> Click <strong>"Publish"</strong> in the top-right corner. Your Zap is now live.
          </div>
        </div>
      </div>

      <Callout type="tip">
        In Zapier, use the variable picker (click a field, then choose from the dropdown) to map trigger data. Variables look like <code className="text-[10px] px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 font-mono">{'{{firstName}}'}</code> in the JSON.
      </Callout>

      <SectionTitle>Receiving KDOps Webhooks in Zapier</SectionTitle>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <StepNumber n={1} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Create a new Zap. For the trigger, search <strong>"Webhooks by Zapier"</strong> &rarr; <strong>"Catch Hook"</strong>.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={2} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Zapier gives you a <strong>webhook URL</strong> (like <code className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">https://hooks.zapier.com/hooks/catch/...</code>). Copy it.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={3} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            In the KDOps Developer Hub, go to <strong>Webhooks</strong> tab &rarr; <strong>"Add Webhook"</strong> &rarr; paste the Zapier URL &rarr; select your events &rarr; <strong>"Save"</strong>.
          </div>
        </div>
      </div>

      <SectionTitle>Common Issues</SectionTitle>
      <CommonIssues platform="zapier" />
    </div>
  );
}

function MakeGuide({ mod, color }: { mod: ModuleDef; color: string }) {
  const body = getCreateBody(mod.id, 'make');
  return (
    <div className="space-y-4">
      <SectionTitle>Prerequisites</SectionTitle>
      <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 ml-4">
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A Make account (free or paid)</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A KDOps API key with appropriate scopes</li>
      </ul>

      <SectionTitle>Step-by-Step: Create a Scenario for {mod.name}</SectionTitle>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <StepNumber n={1} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Log in to Make</strong> and click <strong>"Create a new scenario"</strong> from the dashboard.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={2} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Add a trigger module.</strong> Click the <strong>"+"</strong> in the center of the canvas. Choose your trigger app (e.g., Google Sheets, Webhook, Schedule). Configure it and click <strong>"OK"</strong>.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={3} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Add an HTTP module.</strong> Click the <strong>"+"</strong> after the trigger. Search for <strong>"HTTP"</strong> &rarr; choose <strong>"Make a request"</strong>.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={4} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Configure the HTTP module:</strong>
            <div className="mt-2 space-y-2">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <table className="w-full text-[11px]">
                  <tbody>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 w-[160px]">URL</td>
                      <td className="px-3 py-2 font-mono break-all">{BASE_URL}{mod.endpoint}</td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Method</td>
                      <td className="px-3 py-2"><code className="font-mono">POST</code> (or GET/PATCH/DELETE)</td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Headers</td>
                      <td className="px-3 py-2">
                        <div className="space-y-1 font-mono text-[10px]">
                          <div>Name: <strong>Authorization</strong> &rarr; Value: <strong>Bearer kdops_YOUR_KEY</strong></div>
                          <div>Name: <strong>Content-Type</strong> &rarr; Value: <strong>application/json</strong></div>
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Body type</td>
                      <td className="px-3 py-2">Select <strong>"Raw"</strong></td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50">Content type</td>
                      <td className="px-3 py-2">Select <strong>"JSON (application/json)"</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={5} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Paste the JSON body</strong> into the "Request content" field. Replace <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">{'{{1.fieldName}}'}</code> placeholders by clicking and choosing from the variable picker. The <code className="font-mono">1</code> refers to module #1 (your trigger).
          </div>
        </div>
      </div>

      <CodeBlock label={`Create ${mod.name.replace(/s$/, '')} - JSON Body`} code={body} language="json" />

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <StepNumber n={6} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Run once to test.</strong> Click <strong>"Run once"</strong> at the bottom-left. Make will execute the scenario and show results on each module.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepNumber n={7} color={color} />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <strong>Set the schedule.</strong> Click the clock icon on the trigger module. Set your schedule (e.g., every 15 minutes, or "Immediately" for webhooks). Then toggle the scenario <strong>ON</strong>.
          </div>
        </div>
      </div>

      <Callout type="tip">
        In Make, variables from other modules use the syntax <code className="text-[10px] px-1 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 font-mono">{'{{N.fieldName}}'}</code> where <strong>N</strong> is the module number. Module 1 is the trigger, module 2 is the next step, etc.
      </Callout>

      <SectionTitle>Common Issues</SectionTitle>
      <CommonIssues platform="make" />
    </div>
  );
}

function PythonGuide({ mod }: { mod: ModuleDef }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Prerequisites</SectionTitle>
      <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 ml-4">
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> Python 3.7 or later installed</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">requests</code> library installed (<code className="font-mono text-[10px]">pip install requests</code>)</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A KDOps API key</li>
      </ul>

      <CodeBlock label="Install requests" code="pip install requests" language="bash" />

      <SectionTitle>Full Example: {mod.name} CRUD Operations</SectionTitle>
      <CodeBlock label={`${mod.name} - Python`} code={getPythonExample(mod)} language="python" />

      <Callout type="tip">
        For production use, store your API key in an environment variable: <code className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 font-mono">API_KEY = os.environ["KDOPS_API_KEY"]</code>. Never hardcode keys in your source code.
      </Callout>

      <SectionTitle>Common Issues</SectionTitle>
      <CommonIssues platform="python" />
    </div>
  );
}

function NodeGuide({ mod }: { mod: ModuleDef }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Prerequisites</SectionTitle>
      <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 ml-4">
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> Node.js 18+ (for built-in <code className="text-[11px] font-mono">fetch</code>)</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A KDOps API key</li>
      </ul>

      <Callout type="info">
        These examples use the built-in <code className="text-[10px] font-mono px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50">fetch</code> API available in Node.js 18+. For older versions, install <code className="text-[10px] font-mono">node-fetch</code>.
      </Callout>

      <SectionTitle>Full Example: {mod.name} CRUD Operations</SectionTitle>
      <CodeBlock label={`${mod.name} - Node.js`} code={getNodeExample(mod)} language="javascript" />

      <Callout type="tip">
        Store your API key in an environment variable: <code className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 font-mono">const API_KEY = process.env.KDOPS_API_KEY;</code>
      </Callout>

      <SectionTitle>Common Issues</SectionTitle>
      <CommonIssues platform="nodejs" />
    </div>
  );
}

function CurlGuide({ mod }: { mod: ModuleDef }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Prerequisites</SectionTitle>
      <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 ml-4">
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> cURL installed (pre-installed on macOS, Linux, and Windows 10+)</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A terminal/command prompt</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A KDOps API key</li>
      </ul>

      <SectionTitle>Full Example: {mod.name} CRUD Operations</SectionTitle>
      <CodeBlock label={`${mod.name} - cURL`} code={getCurlExample(mod)} language="bash" />

      <Callout type="tip">
        Save your API key as a shell variable for convenience: <code className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 font-mono">export KDOPS_KEY="kdops_YOUR_KEY"</code> then use <code className="font-mono text-[10px]">$KDOPS_KEY</code> in your commands.
      </Callout>

      <Callout type="warning">
        On Windows Command Prompt (not PowerShell), use double quotes for JSON and escape inner quotes: <code className="text-[10px] font-mono">-d "{"{"}\"first_name\":\"Emeka\"{"}"}"</code>
      </Callout>

      <SectionTitle>Common Issues</SectionTitle>
      <CommonIssues platform="curl" />
    </div>
  );
}

function PhpGuide({ mod }: { mod: ModuleDef }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Prerequisites</SectionTitle>
      <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 ml-4">
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> PHP 7.4+ with the cURL extension enabled</li>
        <li className="flex items-start gap-2"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> A KDOps API key</li>
      </ul>

      <SectionTitle>Full Example: {mod.name} CRUD Operations</SectionTitle>
      <CodeBlock label={`${mod.name} - PHP`} code={getPhpExample(mod)} language="php" />

      <Callout type="tip">
        In Laravel, use the HTTP facade instead: <code className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 font-mono">Http::withToken($apiKey)-&gt;get($url)</code> for cleaner code.
      </Callout>

      <SectionTitle>Common Issues</SectionTitle>
      <CommonIssues platform="php" />
    </div>
  );
}

function CommonIssues({ platform }: { platform: string }) {
  const issues = [
    {
      code: '401 Unauthorized',
      color: 'text-red-600 dark:text-red-400',
      cause: 'Your API key is invalid, expired, or revoked.',
      fix: 'Go to the API Keys tab and verify your key is active. Generate a new one if needed.',
    },
    {
      code: '403 Forbidden',
      color: 'text-amber-600 dark:text-amber-400',
      cause: 'Your API key doesn\'t have the required scope for this operation.',
      fix: 'Check the key\'s scopes in the API Keys tab. You may need to create a new key with the correct scopes.',
    },
    {
      code: '422 Unprocessable Entity',
      color: 'text-orange-600 dark:text-orange-400',
      cause: 'The request body is missing required fields or has invalid data.',
      fix: 'Check the API Reference tab for required fields. Make sure field names match exactly (snake_case).',
    },
    {
      code: '429 Too Many Requests',
      color: 'text-purple-600 dark:text-purple-400',
      cause: 'You\'ve exceeded the rate limit (100 requests per minute per API key).',
      fix: platform === 'n8n'
        ? 'Add a "Wait" node between requests or reduce the schedule frequency.'
        : platform === 'zapier'
        ? 'Add a "Delay" step between actions or reduce your Zap\'s trigger frequency.'
        : platform === 'make'
        ? 'Add a "Sleep" module between requests or use the built-in "Rate Limiter" in scenario settings.'
        : 'Add a delay between requests (e.g., 1 second) or implement exponential backoff.',
    },
    {
      code: '500 Internal Server Error',
      color: 'text-red-600 dark:text-red-400',
      cause: 'Something went wrong on the KDOps side.',
      fix: 'Wait a minute and retry. If it persists, check the KDOps status page or contact support.',
    },
  ];

  if (platform === 'n8n') {
    issues.push({
      code: 'Empty response body',
      color: 'text-zinc-600 dark:text-zinc-400',
      cause: 'The URL path might be incorrect or the response parsing is misconfigured.',
      fix: 'Double-check the URL ends with the correct endpoint. Make sure "Response Format" is set to "JSON" in the HTTP Request node.',
    });
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={issue.code} className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
          <div className="flex items-start gap-2">
            <code className={cn('text-[11px] font-bold font-mono shrink-0', issue.color)}>{issue.code}</code>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1"><strong>Cause:</strong> {issue.cause}</p>
          <p className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-0.5"><strong>Fix:</strong> {issue.fix}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ─── */

export default function IntegrationGuides() {
  const [platform, setPlatform] = useState<PlatformId>('n8n');
  const [module, setModule] = useState<ModuleId>('employees');

  const currentPlatform = PLATFORMS.find((p) => p.id === platform)!;
  const currentModule = MODULES.find((m) => m.id === module)!;

  const guide = useMemo(() => {
    const mod = MODULES.find((m) => m.id === module)!;
    const color = PLATFORMS.find((p) => p.id === platform)!.color;

    switch (platform) {
      case 'n8n': return <N8nGuide mod={mod} color={color} />;
      case 'zapier': return <ZapierGuide mod={mod} color={color} />;
      case 'make': return <MakeGuide mod={mod} color={color} />;
      case 'python': return <PythonGuide mod={mod} />;
      case 'nodejs': return <NodeGuide mod={mod} />;
      case 'curl': return <CurlGuide mod={mod} />;
      case 'php': return <PhpGuide mod={mod} />;
    }
  }, [platform, module]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Plug size={20} />
          Connect Your Tools
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Step-by-step guides for integrating external tools with the KDOps Platform API. Pick your platform and module below.
        </p>
      </div>

      {/* Always-visible reminders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
            <Shield size={12} className="text-blue-500" />
            Authentication
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
            Every request needs a header:<br />
            <code className="font-mono text-[10px] text-blue-600 dark:text-blue-400">Authorization: Bearer kdops_YOUR_KEY</code>
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
            <Clock size={12} className="text-amber-500" />
            Rate Limit
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
            100 requests per minute per API key.<br />
            HTTP 429 response if exceeded.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
            <Hash size={12} className="text-emerald-500" />
            Base URL
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed font-mono break-all">
            {BASE_URL}
          </p>
        </div>
      </div>

      {/* Platform Selector */}
      <div>
        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 block">
          Choose Platform
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                platform === p.id
                  ? 'text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900',
              )}
              style={platform === p.id ? { backgroundColor: p.color, borderColor: p.color } : undefined}
            >
              <p.icon size={13} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Module Selector */}
      <div>
        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 block">
          Choose Module
        </label>
        <div className="flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => setModule(m.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                module === m.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900',
              )}
            >
              <m.icon size={13} />
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Guide Content */}
      <Card className="border-zinc-200 dark:border-zinc-700/80">
        <CardContent className="p-5">
          {/* Guide header */}
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-zinc-100 dark:border-zinc-800">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: currentPlatform.color + '18' }}
            >
              <currentPlatform.icon size={18} style={{ color: currentPlatform.color }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {currentPlatform.name} + {currentModule.name}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {currentModule.description} using {currentPlatform.name}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto text-[10px] font-mono">
              {currentModule.endpoint}
            </Badge>
          </div>

          {/* Endpoint URL */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 mb-4">
            <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase shrink-0">Endpoint</span>
            <code className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 break-all flex-1">
              {BASE_URL}{currentModule.endpoint}
            </code>
            <CopyButton text={`${BASE_URL}${currentModule.endpoint}`} />
          </div>

          <Callout type="warning">
            Replace <code className="text-[10px] font-mono px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50">kdops_YOUR_KEY</code> with your actual API key from the <strong>API Keys</strong> tab in this Developer Hub.
            {module === 'expenses' || module === 'invoices' ? ' All monetary amounts are in the smallest currency unit (kobo for NGN, e.g., 500000 = 5,000 NGN).' : ''}
            {module === 'fleet' ? ' The employee MUST have bank details on file for fuel disbursement to work.' : ''}
          </Callout>

          {/* The actual guide */}
          <div className="mt-4">
            {guide}
          </div>

          {/* Bulk operations tip */}
          <div className="mt-6">
            <Callout type="tip">
              <strong>Bulk operations:</strong> To process many records, send individual requests with a short delay (600ms) between each to stay within the 100 req/min rate limit. For large imports, consider using the Database module for direct table inserts.
            </Callout>
          </div>

          {/* Pagination tip */}
          <div className="mt-3">
            <Callout type="info">
              <strong>Pagination:</strong> All list endpoints support <code className="text-[10px] font-mono">?page=1&amp;per_page=50</code> query parameters. The response includes <code className="text-[10px] font-mono">total</code>, <code className="text-[10px] font-mono">page</code>, and <code className="text-[10px] font-mono">per_page</code> metadata for iterating through results.
            </Callout>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
