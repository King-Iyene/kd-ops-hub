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
import {
  V1_MODULES,
  type Endpoint,
  type HttpMethod,
  type ModuleIconKey,
  type V1Module,
} from '@/features/developer-hub/data/v1Reference';

/* ─── Types ─── */

interface Module extends V1Module {
  icon: React.ElementType;
}

const MODULE_ICONS: Record<ModuleIconKey, React.ElementType> = {
  shield: Shield,
  database: Database,
  table: Table2,
  rows: Rows3,
  columns: Columns3,
  webhook: Webhook,
};

/** The reference data lives in developer-hub/data; the page adds the icon components. */
const MODULES: Module[] = V1_MODULES.map((m) => ({ ...m, icon: MODULE_ICONS[m.iconKey] }));

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


/* ─── Endpoint Card ─── */

function EndpointCard({ endpoint, moduleId }: { endpoint: Endpoint; moduleId: string }) {
  const [open, setOpen] = useState(false);
  const anchorId = `${moduleId}-${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[/:]/g, '-').replace(/^-+|-+$/g, '')}`;
  const fields = endpoint.bodyFields || endpoint.params;

  return (
    <div id={anchorId} className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden scroll-mt-32">
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
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/20">
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
        <div className="sticky top-36 space-y-3">
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
          <section key={m.id} id={`module-${m.id}`} className="scroll-mt-32 space-y-3">
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
