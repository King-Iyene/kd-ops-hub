import { useState, useCallback, lazy, Suspense } from 'react';
import { Cable, Key, Webhook, Zap, Copy, Check, ExternalLink, ChevronRight, ArrowRight, BookOpen } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ApiTokensDialog = lazy(() => import('./ApiTokensDialog').then(m => ({ default: m.ApiTokensDialog })));
const WebhooksDialog = lazy(() => import('./WebhooksDialog').then(m => ({ default: m.WebhooksDialog })));
const AutomationsDialog = lazy(() => import('./AutomationsDialog').then(m => ({ default: m.AutomationsDialog })));

type Tab = 'overview' | 'api-keys' | 'webhooks' | 'automations';

const SUPABASE_REF = 'mseeurrvdcfxdmvqjjki';
const API_BASE = `https://${SUPABASE_REF}.supabase.co/functions/v1/rest-api/v1`;

interface IntegrationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | null;
  baseId: string | null;
}

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
      className="shrink-0 p-1 rounded hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,18%)] text-[#6A7184] dark:text-[hsl(200,20%,55%)] transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F4F4F5] dark:bg-[hsl(200,25%,14%)]">
        <span className="text-[10px] font-medium text-[#6A7184] dark:text-[hsl(200,20%,55%)] uppercase tracking-wider">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="px-3 py-2.5 text-[11px] font-mono text-[#374151] dark:text-[hsl(200,25%,88%)] whitespace-pre-wrap break-all bg-white dark:bg-[hsl(200,30%,10%)] overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}

const INTEGRATION_CARDS = [
  {
    id: 'api-keys' as Tab,
    icon: Key,
    title: 'API Keys',
    description: 'Create keys for REST API access. Use with n8n, Zapier, or any HTTP client.',
    color: '#2D7FF9',
  },
  {
    id: 'webhooks' as Tab,
    icon: Webhook,
    title: 'Webhooks',
    description: 'Push real-time data to external services when records change.',
    color: '#10B981',
  },
  {
    id: 'automations' as Tab,
    icon: Zap,
    title: 'Automations',
    description: 'Auto-run actions (email, webhook, create records) on triggers.',
    color: '#F59E0B',
  },
];

function OverviewTab({ baseId, onNavigate }: { baseId: string | null; onNavigate: (tab: Tab) => void }) {
  const apiUrl = baseId ? `${API_BASE}/bases/${baseId}` : API_BASE;

  return (
    <div className="space-y-5">
      {/* Hero section */}
      <div className="rounded-xl bg-gradient-to-br from-[#2D7FF9]/10 to-[#10B981]/10 dark:from-[#2D7FF9]/20 dark:to-[#10B981]/20 p-5 border border-[#2D7FF9]/20 dark:border-[#2D7FF9]/30">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[#2D7FF9]/15 dark:bg-[#2D7FF9]/25">
            <Cable size={20} className="text-[#2D7FF9]" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Connect Your Tools</h3>
            <p className="text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-1 leading-relaxed">
              KDOps has a full Airtable-compatible REST API. Connect n8n, Zapier, Make, or any tool
              that speaks HTTP. Fields are <strong>auto-created</strong> when you send new data — no setup needed.
            </p>
          </div>
        </div>
      </div>

      {/* Quick start */}
      <div>
        <h4 className="text-[12px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] mb-2.5 flex items-center gap-1.5">
          <BookOpen size={13} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]" />
          Quick Start
        </h4>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[#F9F9FA] dark:bg-[hsl(200,25%,12%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#2D7FF9] text-white text-[10px] font-bold shrink-0 mt-0.5">1</span>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Create an API Key</p>
              <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-0.5">Generate a <code className="px-1 py-0.5 bg-[#E5E5E5] dark:bg-[hsl(200,25%,18%)] rounded text-[10px]">kdops_</code> key with read/write permissions.</p>
            </div>
            <button onClick={() => onNavigate('api-keys')} className="shrink-0 text-[#2D7FF9] hover:text-[#1a6ae0] transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[#F9F9FA] dark:bg-[hsl(200,25%,12%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#2D7FF9] text-white text-[10px] font-bold shrink-0 mt-0.5">2</span>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Send data via HTTP</p>
              <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-0.5">POST records to the API. Unknown fields are auto-created with smart type detection.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[#F9F9FA] dark:bg-[hsl(200,25%,12%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#2D7FF9] text-white text-[10px] font-bold shrink-0 mt-0.5">3</span>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Set up webhooks (optional)</p>
              <p className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-0.5">Get notified when records change — push data to n8n, Slack, or any URL.</p>
            </div>
            <button onClick={() => onNavigate('webhooks')} className="shrink-0 text-[#2D7FF9] hover:text-[#1a6ae0] transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* API endpoint */}
      <CodeBlock label="API Base URL" code={apiUrl} />

      {/* Example */}
      <CodeBlock
        label="Example: Create a record (curl)"
        code={`curl -X POST "${API_BASE}/bases/{baseId}/tables/{tableId}/records" \\
  -H "Authorization: Bearer kdops_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"records": [{"fields": {"Name": "John", "Email": "john@example.com", "Amount": 100}}]}'`}
      />

      {/* n8n / Zapier tips */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded bg-[#EA4B71]/10 dark:bg-[#EA4B71]/20 flex items-center justify-center">
              <span className="text-[11px] font-bold text-[#EA4B71]">n8n</span>
            </div>
            <span className="text-[12px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">n8n Setup</span>
          </div>
          <ol className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] space-y-1 list-decimal list-inside">
            <li>Add an <strong>HTTP Request</strong> node</li>
            <li>Method: POST, URL: the API endpoint above</li>
            <li>Auth: Header Auth → <code className="text-[10px]">Authorization: Bearer kdops_...</code></li>
            <li>Body: JSON with <code className="text-[10px]">{`{records: [{fields: {...}}]}`}</code></li>
          </ol>
        </div>
        <div className="rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded bg-[#FF4A00]/10 dark:bg-[#FF4A00]/20 flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#FF4A00]">Z</span>
            </div>
            <span className="text-[12px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Zapier / Make</span>
          </div>
          <ol className="text-[11px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] space-y-1 list-decimal list-inside">
            <li>Add a <strong>Webhooks by Zapier</strong> action</li>
            <li>Method: POST, URL: the API endpoint</li>
            <li>Headers: <code className="text-[10px]">Authorization: Bearer kdops_...</code></li>
            <li>Data: map your fields into the records body</li>
          </ol>
        </div>
      </div>

      {/* Integration cards */}
      <div>
        <h4 className="text-[12px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] mb-2.5">Manage</h4>
        <div className="grid grid-cols-3 gap-2.5">
          {INTEGRATION_CARDS.map((card) => (
            <button
              key={card.id}
              onClick={() => onNavigate(card.id)}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] hover:border-[#2D7FF9]/40 dark:hover:border-[#2D7FF9]/40 hover:bg-[#F9F9FA] dark:hover:bg-[hsl(200,25%,12%)] transition-all group text-center"
            >
              <div className="p-2 rounded-lg transition-colors" style={{ backgroundColor: `${card.color}15` }}>
                <card.icon size={18} style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">{card.title}</p>
                <p className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] mt-0.5 leading-snug">{card.description}</p>
              </div>
              <ArrowRight size={12} className="text-[#D1D5DB] dark:text-[hsl(200,25%,30%)] group-hover:text-[#2D7FF9] transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IntegrationsDialog({ open, onOpenChange, tableId, baseId }: IntegrationsDialogProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [subDialogOpen, setSubDialogOpen] = useState(false);

  const handleNavigate = useCallback((t: Tab) => {
    if (t === 'overview') {
      setTab('overview');
    } else {
      setTab(t);
      setSubDialogOpen(true);
    }
  }, []);

  const handleSubClose = useCallback(() => {
    setSubDialogOpen(false);
    setTab('overview');
  }, []);

  return (
    <>
      <Dialog open={open && !subDialogOpen} onOpenChange={(o) => { if (!o) { setTab('overview'); } onOpenChange(o); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[85vh] p-0 gap-0 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
            <Cable size={16} className="text-[#2D7FF9]" />
            <h2 className="text-[15px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Integrations</h2>
          </div>
          <div className="overflow-y-auto p-5" style={{ maxHeight: 'calc(85vh - 56px)' }}>
            <OverviewTab baseId={baseId} onNavigate={handleNavigate} />
          </div>
        </DialogContent>
      </Dialog>

      {subDialogOpen && tab === 'api-keys' && (
        <Suspense fallback={null}>
          <ApiTokensDialog open={true} onOpenChange={handleSubClose} baseId={baseId} />
        </Suspense>
      )}
      {subDialogOpen && tab === 'webhooks' && (
        <Suspense fallback={null}>
          <WebhooksDialog open={true} onOpenChange={handleSubClose} tableId={tableId} baseId={baseId} />
        </Suspense>
      )}
      {subDialogOpen && tab === 'automations' && (
        <Suspense fallback={null}>
          <AutomationsDialog open={true} onOpenChange={handleSubClose} tableId={tableId} baseId={baseId} />
        </Suspense>
      )}
    </>
  );
}
