import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, CheckSquare, CalendarDays, Receipt, Banknote,
  Truck, FileText, Building2, UserPlus, Database, CreditCard,
  Copy, Check, ChevronRight, AlertTriangle, Lightbulb, Info,
  ExternalLink, Search, Webhook,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EVENT_GROUPS, eventColor } from '../webhookEvents';
import {
  API_BASE,
  MODULE_GUIDES as modules,
  type HttpMethod,
  type ModuleDef,
  type ModuleGuideIconKey,
} from '@/features/developer-hub/data/moduleGuides';

/** The guide data lives in developer-hub/data; the page maps each icon key to a component. */
const GUIDE_ICONS: Record<ModuleGuideIconKey, React.ElementType> = {
  users: Users,
  userCheck: UserCheck,
  checkSquare: CheckSquare,
  calendarDays: CalendarDays,
  receipt: Receipt,
  banknote: Banknote,
  truck: Truck,
  fileText: FileText,
  building2: Building2,
  userPlus: UserPlus,
  database: Database,
  creditCard: CreditCard,
};

/* ─── Helpers ─── */

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
      className="shrink-0 p-1 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 text-zinc-400 dark:text-zinc-500 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [open, setOpen] = useState(false);
  const isLong = code.split('\n').length > 6;
  const show = !isLong || open;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/80">
        <span className="text-3xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-1">
          {isLong && (
            <button onClick={() => setOpen(!open)} className="text-3xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 px-1.5 py-0.5">
              {open ? 'Collapse' : 'Expand'}
            </button>
          )}
          <CopyButton text={code} />
        </div>
      </div>
      <div className={cn("bg-zinc-950 overflow-x-auto", !show && "max-h-[160px] overflow-hidden relative")}>
        <pre className="p-3 text-xs text-zinc-200 font-mono whitespace-pre leading-relaxed">{code}</pre>
        {!show && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-950 to-transparent" />
        )}
      </div>
    </div>
  );
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

/* ─── Component ─── */

export default function ModuleGuides() {
  const [activeModuleId, setActiveModuleId] = useState(modules[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);

  const activeModule = useMemo(
    () => modules.find(m => m.id === activeModuleId) ?? modules[0],
    [activeModuleId],
  );

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modules;
    const q = searchQuery.toLowerCase();
    return modules.filter(
      m => m.name.toLowerCase().includes(q) || m.basePath.toLowerCase().includes(q) || m.overview.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Scroll to top of main content when module changes
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeModuleId]);

  return (
    <div className="flex min-h-0 flex-col lg:h-full lg:flex-row">
      {/* ─── Left Sidebar ─── */}
      <div className="flex w-full shrink-0 flex-col border-b border-zinc-200 bg-zinc-50/50 dark:border-zinc-700/80 dark:bg-zinc-900/50 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-700/80">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search modules..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <ScrollArea className="h-56 flex-1 lg:h-auto">
          <div className="p-2 space-y-0.5">
            {filteredModules.map(mod => {
              const Icon = GUIDE_ICONS[mod.iconKey];
              const isActive = mod.id === activeModuleId;
              return (
                <button
                  key={mod.id}
                  onClick={() => setActiveModuleId(mod.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60',
                  )}
                >
                  <Icon size={15} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'} />
                  <span className="truncate">{mod.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-auto text-3xs px-1.5 py-0 shrink-0',
                      mod.restAvailable
                        ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'
                        : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
                    )}
                  >
                    {mod.restAvailable ? 'REST' : 'Webhooks only'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ─── Main Content ─── */}
      <div ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="w-full max-w-6xl space-y-8 p-4 sm:p-6">
          <ModuleContent module={activeModule} />
        </div>
      </div>
    </div>
  );
}

/* ─── Module Content Renderer ─── */

function ModuleContent({ module: mod }: { module: ModuleDef }) {
  const Icon = GUIDE_ICONS[mod.iconKey];
  const webhookGroup = mod.webhookModule ? EVENT_GROUPS.find(g => g.module === mod.webhookModule) : undefined;

  return (
    <>
      {/* Overview Card */}
      <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
        <div className="bg-gradient-to-r from-[hsl(200,80%,22%)] to-[hsl(200,65%,28%)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/20">
              <Icon size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{mod.name}</h2>
              {mod.restAvailable ? (
                <code className="text-xs text-blue-100 font-mono">{API_BASE}{mod.basePath}</code>
              ) : (
                <span className="text-xs text-blue-100/90 font-medium">Not available via REST API — see Webhooks below</span>
              )}
            </div>
          </div>
        </div>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{mod.overview}</p>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Access:</span>
            <span>{mod.access}</span>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {mod.warnings?.map((w, i) => (
        <div key={i} className="flex gap-3 p-4 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-warning/10">
          <AlertTriangle size={18} className="shrink-0 text-warning mt-0.5" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 leading-relaxed">{w.text}</p>
        </div>
      ))}

      {mod.restAvailable ? (
        <>
          {/* Endpoints Table */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
              <ExternalLink size={14} />
              Available Endpoints
            </h3>
            <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-200 dark:border-zinc-700/80">
                    <TableHead className="text-xs w-20">Method</TableHead>
                    <TableHead className="text-xs">Path</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mod.endpoints.map((ep, i) => (
                    <TableRow key={i} className="border-zinc-200 dark:border-zinc-700/80">
                      <TableCell>
                        <Badge className={cn('text-3xs font-bold', methodColors[ep.method])}>{ep.method}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{ep.path}</TableCell>
                      <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">{ep.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </Card>
          </section>

          {/* Field Reference */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
              <Info size={14} />
              Field Reference
            </h3>
            <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-200 dark:border-zinc-700/80">
                      <TableHead className="text-xs">Field</TableHead>
                      <TableHead className="text-xs w-28">Type</TableHead>
                      <TableHead className="text-xs w-20">Required</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mod.fields.map((f, i) => (
                      <TableRow key={i} className="border-zinc-200 dark:border-zinc-700/80">
                        <TableCell className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">{f.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-3xs font-mono">{f.type}</Badge>
                        </TableCell>
                        <TableCell>
                          {f.required ? (
                            <Badge className="text-3xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Yes</Badge>
                          ) : (
                            <span className="text-3xs text-zinc-400">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">{f.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </section>

          {/* Examples */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
              <ChevronRight size={14} />
              Full Examples
            </h3>
            <div className="space-y-6">
              {mod.endpoints.map((ep, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className={cn('text-3xs font-bold', methodColors[ep.method])}>{ep.method}</Badge>
                    <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{ep.path}</code>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">— {ep.description}</span>
                  </div>
                  <CodeBlock label="cURL Request" code={ep.curlExample} />
                  <CodeBlock label="Response" code={ep.responseExample} />
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          {/* No REST endpoint callout */}
          <section>
            <Card className="border-amber-200 dark:border-amber-800/60 bg-warning/10">
              <CardContent className="p-4 flex gap-3">
                <Info size={18} className="shrink-0 text-warning mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed space-y-1.5">
                  <p className="font-semibold">No REST endpoint for {mod.name}</p>
                  <p>
                    {mod.name} data isn't exposed through the KDOps REST API today — there's no route to list, create, or
                    update these records by request. The only working REST surface is the generic Database API
                    (<code className="text-xs font-mono">/v1/bases/:baseId/tables/:tableId/records</code>), which
                    operates on custom tables you build yourself, not on this module's built-in data.
                  </p>
                  <p>Manage {mod.name.toLowerCase()} in the KDOps UI, and subscribe to the webhook events below to react to changes in real time.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Webhook Events */}
          {webhookGroup && (
            <section>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                <Webhook size={14} />
                Webhook Events
              </h3>
              <Card className="border-zinc-200 dark:border-zinc-700/80">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {webhookGroup.events.map(e => (
                      <Badge key={e} variant="outline" className={cn('text-2xs font-mono border', eventColor(e))}>
                        {e}
                      </Badge>
                    ))}
                  </div>
                  {mod.webhookExample && (
                    <div className="space-y-1.5">
                      {mod.webhookExample.caption && (
                        <p className="text-2xs text-zinc-500 dark:text-zinc-400">{mod.webhookExample.caption}</p>
                      )}
                      <CodeBlock label={`Delivered payload — ${mod.webhookExample.event}`} code={mod.webhookExample.code} />
                    </div>
                  )}
                  <p className="text-2xs text-zinc-500 dark:text-zinc-400">
                    Configure a webhook for these events from the <strong>Webhooks</strong> tab in this Developer Hub.
                  </p>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Field Reference */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
              <Info size={14} />
              Field Reference
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 leading-relaxed">
              Reference only — there's no REST endpoint to fetch this schema. A webhook payload for this module typically
              includes only a subset of these fields (see the example above).
            </p>
            <Card className="border-zinc-200 dark:border-zinc-700/80 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-200 dark:border-zinc-700/80">
                      <TableHead className="text-xs">Field</TableHead>
                      <TableHead className="text-xs w-28">Type</TableHead>
                      <TableHead className="text-xs w-20">Required</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mod.fields.map((f, i) => (
                      <TableRow key={i} className="border-zinc-200 dark:border-zinc-700/80">
                        <TableCell className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">{f.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-3xs font-mono">{f.type}</Badge>
                        </TableCell>
                        <TableCell>
                          {f.required ? (
                            <Badge className="text-3xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Yes</Badge>
                          ) : (
                            <span className="text-3xs text-zinc-400">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">{f.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </section>
        </>
      )}

      {/* Tips */}
      <section>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Lightbulb size={14} className="text-blue-500" />
          Tips & Best Practices
        </h3>
        <div className="space-y-2">
          {mod.tips.map((t, i) => (
            <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
              <Lightbulb size={14} className="shrink-0 text-blue-500 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Common Mistakes */}
      <section>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500" />
          Common Mistakes
        </h3>
        <div className="space-y-2">
          {mod.mistakes.map((m, i) => (
            <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle size={14} className="shrink-0 text-amber-500 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{m.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
