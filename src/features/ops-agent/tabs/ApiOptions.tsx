import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { AuthType, ContentType } from '../connectionPresets';
import { isValidJson, MAX_EXTRA_HEADERS, renderTemplate, TEMPLATE_VARIABLES, unknownVariables, validHeaderName } from '../connectionTemplate';
import { Field } from '../settings/shared';

export interface HeaderRow { name: string; value: string }
export interface ApiForm {
  method: 'POST' | 'PUT' | 'PATCH' | 'GET';
  auth: AuthType;
  headerName: string;
  queryParam: string;
  contentType: ContentType;
  headers: HeaderRow[];
  body: string;
}

const AUTH_LABEL: Record<AuthType, string> = {
  bearer: 'Bearer token (Authorization header)', header: 'A named header', basic: 'Basic (username:password)', query: 'In the address (query parameter)', none: 'No token',
};
const CONTENT_LABEL: Record<ContentType, string> = { json: 'JSON', form: 'Form (key=value)', text: 'Plain text' };

/** The problem with the extra header rows, or null. Rows with no name are ignored. */
export function headerProblem(rows: HeaderRow[]): string | null {
  const used = rows.filter((r) => r.name.trim() || r.value.trim());
  if (used.length > MAX_EXTRA_HEADERS) return `Use at most ${MAX_EXTRA_HEADERS} extra headers.`;
  const bad = used.find((r) => !validHeaderName(r.name.trim()));
  return bad ? `"${bad.name || '(empty)'}" is not a valid header name. Use letters, digits and hyphens.` : null;
}

/** How the data is sent to an API: method, how the token is proven, content type, extra headers, and the body with a live preview. */
export function ApiOptions({ value, onChange, bodyHint }: { value: ApiForm; onChange: (patch: Partial<ApiForm>) => void; bodyHint?: string }) {
  const preview = renderTemplate(value.body, value.contentType);
  const unknown = unknownVariables(value.body);
  const headerErr = headerProblem(value.headers);
  const setRow = (i: number, patch: Partial<HeaderRow>) => onChange({ headers: value.headers.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const hasBody = value.method !== 'GET';

  return (
    <div className="space-y-4" data-testid="api-options">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Method" htmlFor="api-method">
          <Select value={value.method} onValueChange={(v) => onChange({ method: v as ApiForm['method'] })}>
            <SelectTrigger id="api-method"><SelectValue /></SelectTrigger>
            <SelectContent>{(['POST', 'PUT', 'PATCH', 'GET'] as const).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="How is the token sent?" htmlFor="api-auth">
          <Select value={value.auth} onValueChange={(v) => onChange({ auth: v as AuthType })}>
            <SelectTrigger id="api-auth"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(AUTH_LABEL) as AuthType[]).map((a) => <SelectItem key={a} value={a}>{AUTH_LABEL[a]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      {value.auth === 'header' && (
        <Field label="Header name" htmlFor="api-header-name" hint="For example X-API-Key.">
          <Input id="api-header-name" value={value.headerName} onChange={(e) => onChange({ headerName: e.target.value })} />
        </Field>
      )}
      {value.auth === 'query' && (
        <Field label="Query parameter name" htmlFor="api-query-param" hint="The token is added to the address as ?name=token.">
          <Input id="api-query-param" value={value.queryParam} onChange={(e) => onChange({ queryParam: e.target.value })} />
        </Field>
      )}

      {hasBody && (
        <Field label="Content type" htmlFor="api-content-type">
          <Select value={value.contentType} onValueChange={(v) => onChange({ contentType: v as ContentType })}>
            <SelectTrigger id="api-content-type"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(CONTENT_LABEL) as ContentType[]).map((c) => <SelectItem key={c} value={c}>{CONTENT_LABEL[c]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Extra headers</p>
          <Button type="button" size="sm" variant="ghost" className="h-8" disabled={value.headers.length >= MAX_EXTRA_HEADERS} onClick={() => onChange({ headers: [...value.headers, { name: '', value: '' }] })} data-testid="header-add"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add a header</Button>
        </div>
        <p className="text-xs text-muted-foreground">Some tools need a fixed header, for example a version. Header values are not secret, so do not put a token here.</p>
        {value.headers.map((r, i) => (
          <div key={i} className="flex items-center gap-2" data-testid="header-row">
            <Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Name" aria-label={`Header ${i + 1} name`} className="h-9 flex-1" />
            <Input value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="Value" aria-label={`Header ${i + 1} value`} className="h-9 flex-1" />
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={`Remove header ${i + 1}`} onClick={() => onChange({ headers: value.headers.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        {headerErr && <p className="text-xs text-destructive" role="alert">{headerErr}</p>}
      </div>

      {hasBody && (
        <div className="space-y-2">
          <Field label="Body template" htmlFor="api-body" hint={bodyHint ?? 'What the tool receives. Put a {{variable}} wherever the data should go.'}>
            <Textarea id="api-body" rows={6} value={value.body} onChange={(e) => onChange({ body: e.target.value })} className="font-mono text-xs" spellCheck={false} />
          </Field>
          <details className="rounded-lg border bg-muted/30 p-2.5 text-xs" data-testid="variable-legend">
            <summary className="cursor-pointer font-medium">Variables you can use</summary>
            <ul className="mt-2 space-y-1">
              {TEMPLATE_VARIABLES.map((v) => <li key={v.name}><code className="rounded bg-muted px-1 py-0.5 font-mono">{`{{${v.name}}}`}</code> <span className="text-muted-foreground">{v.help}</span></li>)}
            </ul>
          </details>
          {unknown.length > 0 && <p className="text-xs text-warning" role="status">{unknown.map((n) => `{{${n}}}`).join(', ')} {unknown.length === 1 ? 'is' : 'are'} not a known variable and will be sent as written.</p>}
          <div className="space-y-1" data-testid="body-preview-wrap">
            <p className="text-xs font-medium">Preview with sample values{value.contentType === 'json' && (isValidJson(preview) ? <span className="ml-2 font-normal text-success">Valid JSON</span> : <span className="ml-2 font-normal text-warning">Not valid JSON yet</span>)}</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-2.5 font-mono text-xs" data-testid="body-preview">{preview}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
