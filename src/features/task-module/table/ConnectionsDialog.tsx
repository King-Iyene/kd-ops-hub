import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Plug, Plus, Send, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { errorMessage } from '@/lib/db-errors';
import { hasRole, SUPER_ADMIN_ONLY_ROLES } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AgentConnection } from '@/features/ops-agent/agentDb';
import { ToolIcon, presetForConnection } from '@/features/ops-agent/tabs/ToolIcon';
import { useAgentConnections } from '@/queries/useOpsAgent';
import {
  useCreateTableConnection, useDeleteTableConnection, useTableConnectionOutbox, useTableConnections, useTestTableConnection,
  useToggleTableConnection, useUpdateTableConnection,
  type TableConnection, type TableConnectionInput,
} from '@/queries/useTableConnections';
import type { TableField } from '@/queries/useTaskModule';
import {
  BUILT_IN_PLACEHOLDERS, NAME_MAX, TEMPLATE_MAX, channelProblem, defaultRuleName, describeDelivery, insertAtCursor, isCliqApi, placeholder,
} from './tableConnections';

const toolBtn = 'h-8 text-xs gap-1.5';

/** The toolbar button. Only a Super Admin sees it; the dialog (and everything it reads) is not loaded until it is opened. */
export function TableConnectionsButton({ tableId, tableName, fields }: { tableId: string; tableName: string; fields: TableField[] }) {
  const role = useEffectiveRole();
  const [open, setOpen] = useState(false);
  if (!hasRole(role, SUPER_ADMIN_ONLY_ROLES)) return null;
  return (
    <>
      <Button size="sm" variant="ghost" className={toolBtn} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plug className="h-3.5 w-3.5" /> Connections
      </Button>
      {open && <TableConnectionsDialog open onOpenChange={setOpen} tableId={tableId} tableName={tableName} fields={fields} />}
    </>
  );
}

export function TableConnectionsDialog({
  open, onOpenChange, tableId, tableName, fields,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tableId: string;
  tableName: string;
  fields: TableField[];
}) {
  const { toast } = useToast();
  const profileId = useAuthStore((s) => s.profile?.id ?? null);
  const rulesQ = useTableConnections(tableId);
  const toolsQ = useAgentConnections();
  const rules = useMemo(() => rulesQ.data ?? [], [rulesQ.data]);
  const tools = useMemo(() => toolsQ.data ?? [], [toolsQ.data]);
  const outboxQ = useTableConnectionOutbox(tableId, rules.map((r) => r.id));
  const toolById = useMemo(() => new Map(tools.map((t) => [t.id, t])), [tools]);

  const toggle = useToggleTableConnection(tableId);
  const del = useDeleteTableConnection(tableId);
  const test = useTestTableConnection(tableId);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TableConnection | 'new' | null>(null);

  const fail = (title: string) => (e: unknown) => toast({ title, description: errorMessage(e), variant: 'destructive' });

  const runTest = (rule: TableConnection) => {
    setTestingId(rule.id);
    test.mutate(rule.id, {
      onSuccess: (r) => (r.ok
        ? toast({ title: 'Test sent', description: 'The latest entry in this table was sent, marked as a test.' })
        : toast({ title: 'The test failed', description: r.error ?? 'The tool did not accept the message.', variant: 'destructive' })),
      onError: fail('The test failed'),
      onSettled: () => setTestingId(null),
    });
  };
  const remove = async (rule: TableConnection) => {
    if (await confirm({ title: `Delete "${rule.name}"?`, description: 'New entries will no longer be sent there. Entries already sent stay where they are.', confirmLabel: 'Delete', variant: 'destructive' })) {
      del.mutate(rule.id, { onSuccess: () => toast({ title: 'Connection deleted' }), onError: fail('Could not delete the connection') });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-xl p-4 gap-3 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogTitle className="text-sm font-semibold">Send new entries to other tools</DialogTitle>
        {editing ? (
          <RuleForm
            key={editing === 'new' ? 'new' : editing.id}
            tableId={tableId}
            tableName={tableName}
            fields={fields}
            tools={tools}
            rule={editing === 'new' ? undefined : editing}
            createdBy={profileId}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            <DialogDescription className="text-2xs text-muted-foreground">
              When someone adds an entry to this table, KD Ops sends it to the tools you choose, within a few seconds.
            </DialogDescription>
            {rulesQ.isLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" /></div>
            ) : rulesQ.isError ? (
              <p className="text-xs text-destructive py-4 text-center" role="alert">Could not load the connections for this table.</p>
            ) : rules.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center" data-testid="no-table-connections">No connections yet. Add one to send new entries to a tool.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-md border border-border/70" aria-label="Connections for this table">
                {rules.map((rule) => {
                  const tool = toolById.get(rule.connection_id);
                  const note = describeDelivery(rule, outboxQ.data?.[rule.id]);
                  return (
                    <li key={rule.id} className="p-3 space-y-2" data-rule={rule.name}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        {tool ? <ToolIcon preset={presetForConnection(tool)} size="sm" /> : <span aria-hidden className="h-8 w-8 shrink-0 rounded-lg bg-muted inline-flex items-center justify-center"><Plug className="h-4 w-4 text-muted-foreground" /></span>}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{rule.name}</p>
                          <p className="text-2xs text-muted-foreground truncate">{tool ? tool.name : 'This tool was removed from Agent, Connections'}</p>
                        </div>
                        <label className="flex items-center gap-1.5 text-2xs text-muted-foreground shrink-0">
                          <span>{rule.enabled ? 'Enabled' : 'Off'}</span>
                          <Switch
                            checked={rule.enabled}
                            aria-label={`Enabled for ${rule.name}`}
                            onCheckedChange={(enabled) => toggle.mutate({ id: rule.id, enabled }, { onError: fail('Could not change the connection') })}
                          />
                        </label>
                      </div>
                      <p
                        className={cn('text-2xs break-words', note.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}
                        role={note.tone === 'error' ? 'alert' : undefined}
                        data-testid="rule-status"
                      >
                        {note.text}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-2xs gap-1" onClick={() => setEditing(rule)} aria-label={`Edit ${rule.name}`}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-2xs gap-1" onClick={() => runTest(rule)} disabled={testingId === rule.id} aria-label={`Send test for ${rule.name}`}>
                          {testingId === rule.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send test
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-2xs gap-1 text-destructive hover:text-destructive" onClick={() => remove(rule)} aria-label={`Delete ${rule.name}`}>
                          <Trash2 className="h-3 w-3" /> Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end">
              <Button size="sm" className="gap-1" onClick={() => setEditing('new')} disabled={toolsQ.isLoading}>
                <Plus className="h-3.5 w-3.5" /> Add connection
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleForm({ tableId, tableName, fields, tools, rule, createdBy, onDone }: {
  tableId: string;
  tableName: string;
  fields: TableField[];
  tools: AgentConnection[];
  rule?: TableConnection;
  createdBy: string | null;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateTableConnection(tableId, createdBy);
  const update = useUpdateTableConnection(tableId);
  const ids = { name: useId(), message: useId(), channel: useId(), help: useId(), channelHelp: useId() };

  const [toolId, setToolId] = useState<string>(rule?.connection_id ?? '');
  const [name, setName] = useState(rule?.name ?? '');
  const [template, setTemplate] = useState(rule?.template ?? '');
  const [channel, setChannel] = useState(rule?.channel ?? '');
  const [tagPerson, setTagPerson] = useState(rule?.tag_person ?? true);
  const [ccManager, setCcManager] = useState(rule?.cc_manager ?? true);
  const area = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  const tool = tools.find((t) => t.id === toolId);
  const cliqApi = isCliqApi(tool);
  // Until the name is typed, it follows the chosen tool: "Send to <tool>".
  const shownName = name !== '' ? name : tool ? defaultRuleName(tool.name) : '';
  const channelError = cliqApi ? channelProblem(channel) : null;
  const chips = useMemo(() => [
    ...[...fields].sort((a, b) => a.position - b.position).map((f) => ({ key: `f-${f.id}`, label: f.name, token: placeholder(f.name) })),
    ...BUILT_IN_PLACEHOLDERS.map((p) => ({ key: `b-${p.key}`, label: p.label, token: placeholder(p.key) })),
  ], [fields]);

  // Put the cursor back after a chip is inserted.
  useEffect(() => {
    if (caret.current !== null && area.current) {
      area.current.focus();
      area.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [template]);

  const addToken = (token: string) => {
    const el = area.current;
    const r = insertAtCursor(template, el?.selectionStart, el?.selectionEnd, token);
    caret.current = r.caret;
    setTemplate(r.text.slice(0, TEMPLATE_MAX));
  };

  const saving = create.isPending || update.isPending;
  const canSave = !!tool && !channelError && !saving && shownName.trim() !== '';

  const save = () => {
    if (!tool || !canSave) return;
    const input: TableConnectionInput = {
      connection_id: tool.id,
      name: shownName.trim(),
      template: template.trim() === '' ? null : template,
      channel: cliqApi && channel.trim() !== '' ? channel.trim() : null,
      tag_person: tagPerson,
      cc_manager: tagPerson && ccManager,
    };
    const opts = {
      onSuccess: () => { toast({ title: rule ? 'Connection saved' : 'Connection added' }); onDone(); },
      onError: (e: unknown) => toast({ title: 'Could not save the connection', description: errorMessage(e), variant: 'destructive' }),
    };
    if (rule) update.mutate({ id: rule.id, patch: input }, opts);
    else create.mutate(input, opts);
  };

  return (
    <form className="space-y-3 min-w-0" onSubmit={(e) => { e.preventDefault(); save(); }} aria-label={rule ? 'Edit connection' : 'Add connection'}>
      <DialogDescription className="text-2xs text-muted-foreground">
        Choose where new entries in {tableName} go and what the message says.
      </DialogDescription>

      <div role="radiogroup" aria-label="Tool" className="space-y-1.5">
        <p className="text-xs font-medium">Tool</p>
        {tools.length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3" data-testid="no-tools">
            Connect a tool first in <Link to="/agent/connections" className="font-medium text-primary underline underline-offset-2">Agent, Connections</Link>.
          </p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {tools.map((t) => {
              const on = t.id === toolId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setToolId(t.id)}
                  className={cn('flex items-center gap-2 rounded-md border p-2 text-left min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50', on ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}
                >
                  <ToolIcon preset={presetForConnection(t)} size="sm" />
                  <span className="text-xs font-medium truncate">{t.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.name} className="text-xs font-medium">Name</label>
        <Input id={ids.name} value={shownName} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" placeholder="Send to ..." />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={ids.message} className="text-xs font-medium">Message</label>
        <Textarea
          id={ids.message}
          ref={area}
          value={template}
          maxLength={TEMPLATE_MAX}
          onChange={(e) => setTemplate(e.target.value)}
          rows={5}
          className="text-xs"
          aria-describedby={ids.help}
        />
        <p id={ids.help} className="text-2xs text-muted-foreground">Leave empty to send every answer. Click a name below to add it to the message.</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Insert into the message">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => addToken(c.token)}
              title={c.token}
              className="max-w-full truncate rounded-full border border-border bg-muted/40 px-2 py-0.5 text-2xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {cliqApi && (
        <div className="space-y-1">
          <label htmlFor={ids.channel} className="text-xs font-medium">Channel</label>
          <Input
            id={ids.channel}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder={tool?.config.channel ?? 'channel_unique_name'}
            className="h-8 text-xs"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!channelError}
            aria-describedby={ids.channelHelp}
          />
          {channelError
            ? <p id={ids.channelHelp} className="text-2xs text-destructive" role="alert">{channelError}</p>
            : <p id={ids.channelHelp} className="text-2xs text-muted-foreground">Leave empty to post in the channel set on the connection.</p>}
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Tag the person in the entry</span>
          <Switch checked={tagPerson} onCheckedChange={setTagPerson} aria-label="Tag the person in the entry" />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>CC their manager</span>
          <Switch checked={ccManager && tagPerson} disabled={!tagPerson} onCheckedChange={setCcManager} aria-label="CC their manager" />
        </label>
        <p className="text-2xs text-muted-foreground">Uses the Cliq ids saved in Settings, People.</p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!canSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Save
        </Button>
      </div>
    </form>
  );
}
