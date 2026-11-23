import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  V0_AVAILABILITY_NOTE,
  V0_ENDPOINTS,
  V0_ERRORS,
  V0_KNOWN_DIFFERENCES,
  V0_LIST_OPTIONS,
  V0_SCOPES,
  V0_STATUS_LABELS,
  type V0Method,
  type V0Status,
} from '../data/v0Endpoints';
import { KEY_PLACEHOLDER, resolveApiRoot } from '../lib/snippets';
import { CodeBlock } from './CodeBlock';

const METHOD_STYLES: Record<V0Method, string> = {
  GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  PATCH: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PUT: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  DELETE: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

const STATUS_STYLES: Record<V0Status, string> = {
  supported: 'bg-success/10 text-success',
  partial: 'bg-warning/10 text-warning',
  subset: 'bg-warning/10 text-warning',
  rejected: 'bg-destructive/10 text-destructive',
  'not-supported': 'bg-zinc-200/70 text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300',
};

function StatusBadge({ status }: { status: V0Status }) {
  return (
    <Badge variant="secondary" className={cn('text-3xs font-medium whitespace-nowrap hover:bg-transparent', STATUS_STYLES[status])}>
      {V0_STATUS_LABELS[status]}
    </Badge>
  );
}

function Heading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-sm font-bold text-zinc-900 dark:text-zinc-100 scroll-mt-24">
      {children}
    </h3>
  );
}

/**
 * Airtable-compatible /v0 API, generated from the typed data file.
 * `compact` shows only the records endpoints and one example, for the Quick start page.
 */
export function V0Preview({ compact = false }: { compact?: boolean }) {
  const apiRoot = resolveApiRoot(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const endpoints = compact ? V0_ENDPOINTS.filter((e) => e.group === 'Records' && e.status === 'supported') : V0_ENDPOINTS;
  const example = `curl "${apiRoot}/v0/<baseId>/<tableIdOrName>?pageSize=10" \\
  -H "Authorization: Bearer ${KEY_PLACEHOLDER}"`;

  return (
    <section aria-labelledby="v0-preview-title" className="space-y-4">
      <div>
        <h2 id="v0-preview-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          /v0 Airtable-compatible
          <Badge variant="secondary" className="ml-2 align-middle text-3xs bg-warning/10 text-warning hover:bg-warning/10">
            coming soon, on a separate branch
          </Badge>
        </h2>
        <div
          role="note"
          className="mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300"
        >
          <Info size={14} className="mt-0.5 shrink-0 text-warning" />
          <p>
            {V0_AVAILABILITY_NOTE} Requests below will not work until it ships. Authentication will be the same KDOps
            key as /v1.
          </p>
        </div>
      </div>

      <CodeBlock label="Planned example (placeholders)" code={example} language="bash" />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Planned /v0 endpoints and their status</caption>
          <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-2xs text-zinc-500 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Method</th>
              <th scope="col" className="px-3 py-2 font-semibold">Path</th>
              <th scope="col" className="px-3 py-2 font-semibold">What it does</th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {endpoints.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="px-3 py-2">
                  <span className={cn('rounded px-2 py-0.5 font-mono text-3xs font-bold', METHOD_STYLES[e.method])}>{e.method}</span>
                </td>
                <td className="px-3 py-2 font-mono text-2xs text-zinc-700 dark:text-zinc-300 break-all">{e.path}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{e.name}.</span> {e.description}
                  {e.notes && <span className="block mt-0.5 text-2xs text-zinc-500 dark:text-zinc-500">{e.notes}</span>}
                </td>
                <td className="px-3 py-2"><StatusBadge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!compact && (
        <>
          <div className="space-y-2">
            <Heading id="v0-list-options">List options</Heading>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Supported list options</caption>
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-2xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Option</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {V0_LIST_OPTIONS.map((o) => (
                    <tr key={o.name} className="align-top">
                      <td className="px-3 py-2 font-mono text-2xs text-zinc-700 dark:text-zinc-300">{o.name}</td>
                      <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{o.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <Heading id="v0-scopes">Scopes</Heading>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Stored KDOps scopes keep working. The Airtable names are accepted as aliases.
            </p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Airtable scope aliases</caption>
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-2xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Airtable scope</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Same as</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Allows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {V0_SCOPES.map((s) => (
                    <tr key={s.airtable}>
                      <td className="px-3 py-2 font-mono text-2xs text-zinc-700 dark:text-zinc-300">{s.airtable}</td>
                      <td className="px-3 py-2 font-mono text-2xs text-zinc-700 dark:text-zinc-300">{s.sameAs}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{s.allows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <Heading id="v0-errors">Errors</Heading>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Planned error types</caption>
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-2xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Type</th>
                    <th scope="col" className="px-3 py-2 font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {V0_ERRORS.map((er) => (
                    <tr key={`${er.status}-${er.type}`}>
                      <td className="px-3 py-2 font-mono text-2xs text-zinc-700 dark:text-zinc-300">{er.status}</td>
                      <td className="px-3 py-2 font-mono text-2xs text-zinc-700 dark:text-zinc-300">{er.type}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{er.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <Heading id="v0-differences">Known differences from Airtable</Heading>
            <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
              {V0_KNOWN_DIFFERENCES.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

export default V0Preview;
