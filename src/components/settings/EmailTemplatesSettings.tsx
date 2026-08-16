// Settings → Email Templates
//
// Super-admin-only editor for the email_templates catalogue. Lists every
// template grouped by category, lets the operator edit subject + bodies,
// preview with the template's example variables, send a test to themselves,
// and reset to the seeded default.

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Save,
  Mail,
  RotateCcw,
  Send,
  Eye,
  Code,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import { useAuthStore } from '@/store/authStore';
import {
  listEmailTemplates,
  updateEmailTemplate,
  resetEmailTemplate,
  createEmailTemplate,
  deleteEmailTemplate,
  renderTemplate,
  wrapEmailHtml,
  sendTemplatedEmail,
  type EmailTemplate,
} from '@/lib/email-templates';
import { supabase } from '@/lib/supabase';

const CATEGORY_LABEL: Record<EmailTemplate['category'], string> = {
  payments: 'Payments',
  hr: 'HR & Payroll',
  ops: 'Operations',
  compliance: 'Compliance',
  security: 'Security',
  custom: 'Custom',
};

const CATEGORY_BADGE: Record<EmailTemplate['category'], string> = {
  payments: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  hr: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30',
  ops: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
  compliance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  security: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  custom: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30',
};

export default function EmailTemplatesSettings() {
  const { toast } = useToast();
  const { user, profile } = useAuthStore();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Editor state
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [textBody, setTextBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [view, setView] = useState<'edit' | 'preview' | 'html'>('edit');
  const [companyName, setCompanyName] = useState('KD Squares');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // "New template" modal state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [deleting, setDeleting] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    setMissingTable(false);
    try {
      const [rows, cs] = await Promise.all([
        listEmailTemplates(),
        supabase
          .from('company_settings')
          .select('company_name, logo_url')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
      setTemplates(rows);
      if (cs.data) {
        setCompanyName((cs.data as any).company_name || 'KD Squares');
        setLogoUrl((cs.data as any).logo_url || null);
      }
      if (rows.length > 0 && !selectedKey) {
        setSelectedKey(rows[0].key);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      if (/email_templates/i.test(msg)) setMissingTable(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  // Sync editor fields when selection changes.
  useEffect(() => {
    if (selected) {
      setSubject(selected.subject);
      setHtmlBody(selected.html_body);
      setTextBody(selected.text_body ?? '');
      setView('edit');
    }
  }, [selected]);

  const grouped = useMemo(() => {
    const m = new Map<EmailTemplate['category'], EmailTemplate[]>();
    for (const t of templates) {
      if (!m.has(t.category)) m.set(t.category, []);
      m.get(t.category)!.push(t);
    }
    return m;
  }, [templates]);

  const exampleVars = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (!selected) return out;
    for (const v of selected.variables ?? []) {
      out[v.name] = v.example ?? '';
    }
    return out;
  }, [selected]);

  const previewHtml = useMemo(() => {
    if (!selected) return '';
    const renderedSubject = renderTemplate(subject, exampleVars);
    const renderedBody = renderTemplate(htmlBody, exampleVars);
    return wrapEmailHtml({
      bodyHtml: renderedBody,
      companyName,
      logoUrl,
      preheader: renderedSubject,
    });
  }, [selected, subject, htmlBody, exampleVars, companyName, logoUrl]);

  const previewSubject = useMemo(
    () => (selected ? renderTemplate(subject, exampleVars) : ''),
    [selected, subject, exampleVars],
  );

  const dirty = useMemo(() => {
    if (!selected) return false;
    return (
      subject !== selected.subject
      || htmlBody !== selected.html_body
      || (textBody || null) !== (selected.text_body || null)
    );
  }, [selected, subject, htmlBody, textBody]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateEmailTemplate(selected.id, {
        subject,
        html_body: htmlBody,
        text_body: textBody || null,
      });
      toast({ title: 'Template saved' });
      await reload();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    if (!(await confirm({ title: 'Reset template?', description: `Reset "${selected.name}" to factory default? Your changes will be lost.` }))) return;
    setResetting(true);
    try {
      await resetEmailTemplate(selected.id);
      toast({ title: 'Reset to default' });
      await reload();
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  const handleSendTest = async () => {
    if (!selected) return;
    const myEmail = (profile as any)?.email || (user as any)?.email;
    if (!myEmail) {
      toast({ title: 'No email on profile', description: 'Set your email in Profile to receive a test.', variant: 'destructive' });
      return;
    }
    setSendingTest(true);
    try {
      // Save first if dirty so the test reflects the editor state.
      if (dirty) {
        await updateEmailTemplate(selected.id, {
          subject,
          html_body: htmlBody,
          text_body: textBody || null,
        });
      }
      const res = await sendTemplatedEmail({
        templateKey: selected.key,
        to: myEmail,
        vars: exampleVars,
      });
      if (res.ok) {
        toast({ title: 'Test sent', description: `Sent to ${myEmail}` });
      } else {
        toast({ title: 'Send failed', description: res.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setSendingTest(false);
      if (dirty) await reload();
    }
  };

  const copyVar = (name: string) => {
    void navigator.clipboard.writeText(`{{${name}}}`);
    toast({ title: `Copied {{${name}}}` });
  };

  const handleCreateTemplate = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const created = await createEmailTemplate({
        name,
        description: newDescription.trim() || null,
      });
      toast({ title: 'Template created', description: `"${created.name}" is ready to edit.` });
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
      await reload();
      setSelectedKey(created.key);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      toast({
        title: 'Create failed',
        description: /duplicate key/i.test(msg)
          ? 'A template with this name already exists. Pick another name.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selected || selected.is_system) return;
    if (!(await confirm({ title: 'Delete template?', description: `Delete custom template "${selected.name}"? This cannot be undone.`, variant: 'destructive' }))) return;
    setDeleting(true);
    try {
      await deleteEmailTemplate(selected.id);
      toast({ title: 'Template deleted' });
      setSelectedKey(null);
      await reload();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Templates
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            One central catalogue for every email KD Ops sends. Edit subject and body using
            <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">{'{{vars}}'}</code> placeholders, preview with the
            template's example values, and send a test to yourself before going live.
          </p>
          <p className="text-xs">Reset reverts to the seeded factory copy.</p>
        </CardContent>
      </Card>

      {missingTable && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Migration not yet applied</p>
            <p className="text-xs">
              Apply <code>20260808000000_email_templates.sql</code> in Supabase Dashboard → SQL Editor to provision the templates table.
            </p>
          </div>
        </div>
      )}

      {error && !missingTable && (
        <p className="text-sm text-rose-600">{error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
        {/* Sidebar list */}
        <Card>
          <CardContent className="p-2 space-y-3">
            <div className="flex items-center justify-between gap-2 px-2 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Templates
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] gap-1"
                onClick={() => setShowCreate(true)}
                disabled={loading || missingTable}
              >
                <Plus className="h-3 w-3" /> New
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : templates.length === 0 && !missingTable ? (
              <p className="text-xs text-muted-foreground italic p-3">No templates yet — click "New" to create your first one.</p>
            ) : (
              [...grouped.entries()].map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 py-1.5">
                    {CATEGORY_LABEL[cat]}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedKey(t.key)}
                        className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/50 ${
                          selectedKey === t.key ? 'bg-primary/10 text-primary font-medium' : ''
                        }`}
                      >
                        <div className="truncate">{t.name}</div>
                        <code className="text-[10px] text-muted-foreground">{t.key}</code>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Editor + preview pane */}
        {selected ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {selected.name}
                    <Badge variant="outline" className={`text-[10px] ${CATEGORY_BADGE[selected.category]}`}>
                      {CATEGORY_LABEL[selected.category]}
                    </Badge>
                    {selected.is_system && (
                      <Badge variant="outline" className="text-[10px] bg-muted/40">System</Badge>
                    )}
                  </CardTitle>
                  {selected.description && (
                    <p className="text-xs text-muted-foreground">{selected.description}</p>
                  )}
                  <code className="text-[10px] text-muted-foreground">{selected.key}</code>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button size="sm" variant="outline" onClick={handleSendTest} disabled={sendingTest}>
                    {sendingTest ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    Test to me
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleReset} disabled={resetting}>
                    {resetting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    Reset
                  </Button>
                  {!selected.is_system && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDeleteTemplate}
                      disabled={deleting}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {deleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                      Delete
                    </Button>
                  )}
                  <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                    {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                <TabsList>
                  <TabsTrigger value="edit"><Code className="h-3 w-3 mr-1" /> Edit</TabsTrigger>
                  <TabsTrigger value="preview"><Eye className="h-3 w-3 mr-1" /> Preview</TabsTrigger>
                  <TabsTrigger value="html">Raw HTML</TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="space-y-3 pt-3">
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Subject</Label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">HTML body</Label>
                        <Textarea
                          value={htmlBody}
                          onChange={(e) => setHtmlBody(e.target.value)}
                          className="font-mono text-xs min-h-[280px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Plain-text body (optional, used as fallback)</Label>
                        <Textarea
                          value={textBody}
                          onChange={(e) => setTextBody(e.target.value)}
                          className="font-mono text-xs min-h-[120px]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Variables</Label>
                      <div className="rounded-md border bg-muted/20 p-2 space-y-1.5 max-h-[480px] overflow-y-auto">
                        {(selected.variables ?? []).length === 0 && (
                          <p className="text-[11px] text-muted-foreground italic">No variables defined.</p>
                        )}
                        {(selected.variables ?? []).map((v) => (
                          <button
                            key={v.name}
                            onClick={() => copyVar(v.name)}
                            className="w-full text-left text-xs rounded hover:bg-background px-2 py-1.5 group"
                            title={`Click to copy {{${v.name}}}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <code className="text-primary font-mono">{`{{${v.name}}}`}</code>
                              <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                            </div>
                            {v.description && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{v.description}</p>
                            )}
                            {v.example && (
                              <p className="text-[10px] text-muted-foreground italic">e.g. {v.example}</p>
                            )}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Click a variable to copy its <code>{'{{name}}'}</code> placeholder.
                      </p>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="preview" className="pt-3">
                  <div className="space-y-2">
                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/40 px-3 py-2 border-b text-xs space-y-0.5">
                        <div><span className="text-muted-foreground">Subject:</span> <strong>{previewSubject}</strong></div>
                      </div>
                      <iframe
                        title="Email preview"
                        srcDoc={previewHtml}
                        className="w-full h-[480px] bg-white"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Rendered with each variable's example value.
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="html" className="pt-3">
                  <Textarea
                    readOnly
                    value={previewHtml}
                    className="font-mono text-[11px] min-h-[480px]"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Pick a template from the list to edit, or click <strong>New</strong> to create one from scratch.
            </CardContent>
          </Card>
        )}
      </div>

      {/* New template dialog — minimal up-front fields; the editor lets
          the operator fill in subject + body once the template exists. */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New email template</DialogTitle>
            <DialogDescription>
              Lands in the Custom category. You can edit subject, body, and variables right after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Welcome onboard"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Internal key will be <code>custom.{newName ? newName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : 'your_name'}</code>
              </p>
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What is this template used for?"
                className="min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
