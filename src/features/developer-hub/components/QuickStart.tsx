import { useId, useMemo, useState } from 'react';
import { ArrowRight, Info, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Read-only imports from the database module: the real bases, tables and columns.
import { useBases } from '@/features/database/hooks/useBases';
import { useTables } from '@/features/database/hooks/useTables';
import { useFields } from '@/features/database/hooks/useFields';
import { uuidToShort } from '@/features/database/lib/shortId';
import {
  buildTarget,
  curlCreateSnippet,
  curlListSnippet,
  fetchSnippet,
  makeSteps,
  n8nNodeJson,
  n8nSteps,
  resolveApiRoot,
  v1RecordsUrl,
} from '../lib/snippets';
import { pickSampleFieldName } from '../lib/sampleField';
import { CodeBlock } from './CodeBlock';
import { V0Preview } from './V0Preview';

interface QuickStartProps {
  onNavigate?: (target: string) => void;
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}

export default function QuickStart({ onNavigate }: QuickStartProps) {
  const baseLabelId = useId();
  const tableLabelId = useId();
  const [baseChoice, setBaseChoice] = useState<string | null>(null);
  const [tableChoice, setTableChoice] = useState<string | null>(null);

  const { data: bases = [], isLoading: basesLoading } = useBases();
  const base = bases.find((b) => b.id === baseChoice) ?? bases[0];
  const { data: tables = [], isLoading: tablesLoading } = useTables(base?.id);
  const table = tables.find((t) => t.id === tableChoice) ?? tables[0];
  const { data: fields } = useFields(table?.id);

  const apiRoot = resolveApiRoot(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const target = useMemo(
    () =>
      buildTarget({
        apiRoot,
        baseId: base ? uuidToShort(base.id) : null,
        tableId: table ? uuidToShort(table.id) : null,
        sampleFieldName: pickSampleFieldName(fields ?? []),
      }),
    [apiRoot, base, table, fields],
  );

  const usingRealIds = Boolean(base && table);

  return (
    <div className="space-y-10 pb-12">
      <section aria-labelledby="qs-title" className="space-y-6">
        <div>
          <h2 id="qs-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Quick start
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Pick one of your tables and copy a working request. The base and table ids below are your real ones.
          </p>
        </div>

        {/* Step 1: key */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Get an API key</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Create one on the Keys page. It is shown once. These snippets never show a real key: replace{' '}
                <code className="rounded bg-zinc-100 px-1 font-mono text-3xs dark:bg-zinc-800">kdops_YOUR_API_KEY</code>{' '}
                with yours.
              </p>
            </div>
            {onNavigate && (
              <Button variant="outline" size="sm" onClick={() => onNavigate('keys')}>
                <KeyRound size={14} className="mr-1.5" />
                Open Keys
              </Button>
            )}
          </div>
        </div>

        {/* Step 2: pick */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Choose a base and table</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label id={baseLabelId} className="text-xs">Base</Label>
              <Select
                value={base?.id ?? ''}
                onValueChange={(v) => {
                  setBaseChoice(v);
                  setTableChoice(null);
                }}
                disabled={bases.length === 0}
              >
                <SelectTrigger aria-labelledby={baseLabelId} className="h-9 text-sm">
                  <SelectValue placeholder={basesLoading ? 'Loading bases...' : 'No bases found'} />
                </SelectTrigger>
                <SelectContent>
                  {bases.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="font-mono text-3xs text-zinc-500 dark:text-zinc-400 break-all">
                id: {base ? uuidToShort(base.id) : '(none)'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label id={tableLabelId} className="text-xs">Table</Label>
              <Select
                value={table?.id ?? ''}
                onValueChange={setTableChoice}
                disabled={tables.length === 0}
              >
                <SelectTrigger aria-labelledby={tableLabelId} className="h-9 text-sm">
                  <SelectValue placeholder={tablesLoading ? 'Loading tables...' : 'No tables found'} />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="font-mono text-3xs text-zinc-500 dark:text-zinc-400 break-all">
                id: {table ? uuidToShort(table.id) : '(none)'}
              </p>
            </div>
          </div>
          {!usingRealIds && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <Info size={13} className="mt-0.5 shrink-0" />
              {basesLoading || tablesLoading
                ? 'Loading your bases and tables. Placeholders are shown until they arrive.'
                : 'No base or table to pick yet, so the snippets use placeholders. Create a table in Database first.'}
            </p>
          )}
        </div>

        {/* Step 3: snippets */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Copy a request</h3>
              <p className="font-mono text-3xs text-zinc-500 dark:text-zinc-400 break-all">
                {v1RecordsUrl(target)}
              </p>
            </div>
          </div>
          <Tabs defaultValue="curl">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript fetch</TabsTrigger>
              <TabsTrigger value="n8n">n8n</TabsTrigger>
              <TabsTrigger value="make">Make</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3 space-y-3">
              <CodeBlock label="List records" code={curlListSnippet(target)} language="bash" />
              <CodeBlock label="Create a record" code={curlCreateSnippet(target)} language="bash" />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock label="fetch (Node 18+ or browser)" code={fetchSnippet(target)} language="javascript" />
            </TabsContent>
            <TabsContent value="n8n" className="mt-3 space-y-3">
              <StepList steps={n8nSteps(target)} />
              <CodeBlock label="n8n node (paste onto the canvas)" code={n8nNodeJson(target)} language="json" />
            </TabsContent>
            <TabsContent value="make" className="mt-3 space-y-3">
              <StepList steps={makeSteps(target)} />
              <CodeBlock label="URL for the HTTP module" code={`${v1RecordsUrl(target)}?pageSize=10`} />
            </TabsContent>
          </Tabs>
          <p className="mt-3 text-2xs text-zinc-500 dark:text-zinc-400">
            Need every endpoint, filters and error codes? Open the{' '}
            {onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate('reference')}
                className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2"
              >
                API Reference <ArrowRight size={11} />
              </button>
            ) : (
              'API Reference'
            )}
            .
          </p>
        </div>
      </section>

      <V0Preview compact />
    </div>
  );
}
