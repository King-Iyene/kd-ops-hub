import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { renderTemplate } from '@/lib/mustache-lite';
import { sanitizeHtml } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { confirm } from '@/hooks/use-confirm';
import {
  Save, Loader2, Eye, EyeOff, FileSignature, Plus, Trash2,
} from 'lucide-react';

/**
 * Admin editor for offer_letter_templates. Super-admin only.
 *
 * Left column — list of templates (system + custom, active + inactive).
 * Right column — edit form with live preview using sample vars.
 *
 * Deletion only allowed for non-system templates. System templates can be
 * deactivated (hidden from the generate dropdown) but not deleted, so we
 * don't accidentally lose the seeded copies.
 */

interface Template {
  id: string;
  code: string;
  name: string;
  description: string | null;
  html_body: string;
  is_system: boolean;
  active: boolean;
  updated_at: string;
}

const SAMPLE_VARS = {
  first_name: 'Ada',
  last_name: 'Okonkwo',
  job_title: 'Field Officer',
  department: 'Operations',
  start_date: '1 August 2026',
  end_date: '31 July 2027',
  monthly_salary: '₦450,000.00',
  reporting_manager: 'Chidinma Umeh',
  location: 'Head office, Lagos',
  company_name: 'KD Squares Ltd',
  issuer_name: 'HR Manager',
  issuer_title: 'Head of People',
};

export const OfferLetterTemplatesAdmin = () => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '', name: '', description: '', html_body: '',
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('offer_letter_templates' as any)
      .select('id, code, name, description, html_body, is_system, active, updated_at')
      .order('is_system', { ascending: false })
      .order('name');
    setTemplates(((data ?? []) as any[]) as Template[]);
    setLoading(false);
  };

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setForm({
        code: selected.code,
        name: selected.name,
        description: selected.description ?? '',
        html_body: selected.html_body,
        active: selected.active,
      });
    } else {
      setForm({ code: '', name: '', description: '', html_body: '', active: true });
    }
  }, [selected]);

  const previewHtml = useMemo(() => renderTemplate(form.html_body, SAMPLE_VARS), [form.html_body]);

  const handleNew = () => {
    setSelectedId(null);
    setForm({
      code: 'custom_' + Date.now().toString(36),
      name: 'New template',
      description: '',
      html_body: `<h2>Offer of Employment — {{job_title}}</h2>
<p>Dear {{first_name}},</p>
<p>Add your offer letter body here — use {{first_name}}, {{monthly_salary}} etc.</p>
<p>Yours,<br/>{{issuer_name}}<br/>{{company_name}}</p>`,
      active: true,
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.html_body.trim()) {
      toast({ title: 'Name, code and body are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        html_body: form.html_body,
        active: form.active,
      };
      let id = selectedId;
      if (id) {
        const { error } = await supabase
          .from('offer_letter_templates' as any)
          .update(payload)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('offer_letter_templates' as any)
          .insert({ ...payload, is_system: false })
          .select('id')
          .single();
        if (error) throw error;
        id = (data as any).id;
        setSelectedId(id);
      }
      await logAudit(
        'offer_template_saved' as any,
        `Offer letter template "${payload.name}" (${payload.code}) saved`,
        profile,
      );
      toast({ title: 'Template saved' });
      load();
    } catch (err: unknown) {
      toast({ title: 'Save failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || selected.is_system) return;
    if (!(await confirm({ title: 'Delete template?', description: `Delete template "${selected.name}"? This cannot be undone.`, variant: 'destructive' }))) return;
    const { error } = await supabase
      .from('offer_letter_templates' as any)
      .delete()
      .eq('id', selected.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'offer_template_deleted' as any,
      `Offer letter template "${selected.name}" deleted`,
      profile,
    );
    toast({ title: 'Template deleted' });
    setSelectedId(null);
    load();
  };

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Only super admins and admins can edit offer letter templates.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" /> Offer letter templates
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowPreview((s) => !s)}>
              {showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              {showPreview ? 'Hide preview' : 'Show preview'}
            </Button>
            <Button size="sm" onClick={handleNew}>
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Edit copy, add company-specific clauses, mark system templates
          inactive to hide them. Variables: {'{{first_name}}, {{job_title}},'}
          {' {{monthly_salary}}, {{start_date}}, {{end_date}}, {{department}},'}
          {' {{reporting_manager}}, {{location}}, {{company_name}}, {{issuer_name}}, {{issuer_title}}'}.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading templates…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
            {/* List */}
            <div className="space-y-1 border rounded-md overflow-hidden">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 transition-colors
                    ${selectedId === t.id ? 'bg-primary/10' : 'hover:bg-muted/50'}
                  `}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{t.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.is_system && <Badge variant="secondary" className="text-[9px]">system</Badge>}
                      {!t.active && <Badge variant="secondary" className="text-[9px] bg-muted">off</Badge>}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{t.code}</p>
                </button>
              ))}
            </div>

            {/* Editor */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Code</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    disabled={!!(selected?.is_system)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short label shown when picking a template"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">HTML body</Label>
                <Textarea
                  className="font-mono text-xs min-h-[240px]"
                  value={form.html_body}
                  onChange={(e) => setForm({ ...form, html_body: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: Boolean(v) })}
                  />
                  Active (appears in the Generate dropdown)
                </label>
                <div className="flex items-center gap-2">
                  {selected && !selected.is_system && (
                    <Button size="sm" variant="ghost" onClick={handleDelete}>
                      <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Delete
                    </Button>
                  )}
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                </div>
              </div>

              {showPreview && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">Live preview (sample vars)</Label>
                  <div
                    className="mt-1 border rounded-md p-4 bg-white text-slate-900 max-h-[300px] overflow-auto"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OfferLetterTemplatesAdmin;
