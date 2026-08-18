import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, Save, Loader2, Trash2, ArrowRightCircle, CalendarDays,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime } from '@/lib/format';
import { displayName, initialsOf } from '@/lib/name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ContactType = 'lead' | 'student' | 'contact' | 'partner';
type ContactStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

interface ContactData {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: ContactType;
  source: string | null;
  tags: string[] | null;
  notes: string | null;
  status: ContactStatus;
  converted_to_contractor_id: string | null;
  created_at: string;
}

interface Activity {
  id: string;
  action: string;
  detail: string | null;
  performed_by_name: string | null;
  created_at: string;
}

const TYPE_BADGE: Record<string, string> = {
  lead: 'bg-info/10 text-info', student: 'bg-accent/15 text-accent-foreground',
  contact: 'bg-muted text-muted-foreground', partner: 'bg-success/10 text-success',
};
const STATUS_BADGE: Record<string, string> = {
  new: 'bg-warning/10 text-warning', contacted: 'bg-info/10 text-info',
  qualified: 'bg-primary/10 text-primary', converted: 'bg-success/10 text-success',
  lost: 'bg-destructive/10 text-destructive',
};

const ContactProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [contact, setContact] = useState<ContactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ContactData>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [noteText, setNoteText] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('contacts').select('full_name, first_name, last_name, email, phone, contact_type, source, tags, notes, status, created_at').eq('id', id).single();
    if (error || !data) {
      toast({ title: 'Contact not found', variant: 'destructive' });
      navigate('/contacts');
      return;
    }
    const c = data as ContactData;
    setContact(c);
    setForm(c);

    const { data: acts } = await supabase
      .from('contact_activities')
      .select('id, action, detail, performed_by_name, created_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    setActivities((acts as Activity[]) || []);
    setLoading(false);
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!id || !form) return;
    setSaving(true);
    const fullName = displayName(form.first_name, form.last_name, form.full_name);
    const { error } = await supabase.from('contacts').update({
      first_name: form.first_name,
      last_name: form.last_name,
      full_name: fullName,
      email: form.email || null,
      phone: form.phone || null,
      contact_type: form.contact_type,
      source: form.source || null,
      tags: form.tags,
      notes: form.notes || null,
      status: form.status,
    }).eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('contact_updated', `Contact "${fullName}" updated`, profile);
      await supabase.from('contact_activities').insert({
        contact_id: id, action: 'updated', detail: 'Contact details updated',
        performed_by: profile?.id, performed_by_name: profile?.full_name,
      });
      toast({ title: 'Contact saved' });
      load();
    }
    setSaving(false);
  };

  const addNote = async () => {
    if (!id || !noteText.trim() || saving) return;
    setSaving(true);
    try {
      const stamp = new Date().toLocaleString('en-GB');
      const updated = `${form.notes || ''}\n\n[${stamp}] ${noteText.trim()}`.trim();
      await supabase.from('contacts').update({ notes: updated }).eq('id', id);
      await supabase.from('contact_activities').insert({
        contact_id: id, action: 'note_added', detail: noteText.trim(),
        performed_by: profile?.id, performed_by_name: profile?.full_name,
      });
      setForm((prev) => ({ ...prev, notes: updated }));
      setNoteText('');
      toast({ title: 'Note added' });
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async () => {
    if (deleteConfirm !== 'DELETE') return;
    await supabase.from('contacts').delete().eq('id', id);
    await logAudit('contact_deleted', `Contact "${contact?.full_name}" deleted`, profile);
    toast({ title: 'Contact deleted' });
    navigate('/contacts');
  };

  const convertToContractor = async () => {
    if (!contact) return;
    const cName = displayName(contact.first_name, contact.last_name, contact.full_name);
    const { data, error } = await supabase.from('contractors').insert({
      full_name: cName, first_name: contact.first_name, last_name: contact.last_name,
      bank_name: '', account_number: '', default_amount_ngn: 0, status: 'active',
    }).select('id').single();
    if (error) { toast({ title: 'Conversion failed', description: error.message, variant: 'destructive' }); return; }
    await supabase.from('contacts').update({ status: 'converted', converted_to_contractor_id: (data as any).id }).eq('id', id);
    await supabase.from('contact_activities').insert({
      contact_id: id, action: 'converted_to_contractor', detail: `Converted to contractor`,
      performed_by: profile?.id, performed_by_name: profile?.full_name,
    });
    await logAudit('contractor_added', `Contact "${cName}" converted to contractor`, profile);
    toast({ title: `${cName} converted to contractor` });
    load();
  };

  if (loading || !contact) {
    return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const patch = (p: Partial<ContactData>) => setForm((prev) => ({ ...prev, ...p }));
  const cName = displayName(contact.first_name, contact.last_name, contact.full_name);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" aria-label="Back to contacts" onClick={() => navigate('/contacts')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{cName}</h1>
          <p className="text-muted-foreground text-sm">{contact.email || '—'}</p>
        </div>
        <Badge variant="secondary" className={cn('capitalize', TYPE_BADGE[contact.contact_type])}>{contact.contact_type}</Badge>
        <Badge variant="secondary" className={cn('capitalize', STATUS_BADGE[contact.status])}>{contact.status}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
              <span className="text-2xl font-bold text-primary-foreground">{initialsOf(contact.first_name, contact.last_name, contact.full_name)}</span>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {contact.email && <p className="text-sm flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {contact.email}</p>}
              {contact.phone && <p className="text-sm flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {contact.phone}</p>}
              <p className="text-sm flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Added {formatDate(contact.created_at)}</p>
              {contact.source && <p className="text-sm text-muted-foreground">Source: {contact.source}</p>}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">{contact.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>
              )}
            </div>
            <div className="flex gap-2">
              {contact.status !== 'converted' && (
                <Button variant="outline" size="sm" onClick={convertToContractor}><ArrowRightCircle className="mr-2 h-4 w-4" /> Convert to contractor</Button>
              )}
              <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activity">Activity ({activities.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Contact details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>First name</Label><Input value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Last name</Label><Input value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Email</Label><Input value={form.email || ''} onChange={(e) => patch({ email: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>Type</Label>
                  <Select value={form.contact_type} onValueChange={(v) => patch({ contact_type: v as ContactType })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(['lead','student','contact','partner'] as const).map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => patch({ status: v as ContactStatus })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(['new','contacted','qualified','converted','lost'] as const).map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Source</Label><Input value={form.source || ''} onChange={(e) => patch({ source: e.target.value })} /></div>
                <div className="space-y-1"><Label>Tags (comma-separated)</Label><Input value={(form.tags || []).join(', ')} onChange={(e) => patch({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save changes</Button>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity timeline</CardTitle></CardHeader>
            <CardContent>
              {activities.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : (
                <div className="space-y-3">{activities.map((a) => (
                  <div key={a.id} className="border-l-2 border-primary/20 pl-4 py-1">
                    <p className="text-sm font-medium capitalize">{a.action.replace(/_/g, ' ')}</p>
                    {a.detail && <p className="text-sm text-muted-foreground">{a.detail}</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)} · {a.performed_by_name || 'System'}</p>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add note</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type a note..." rows={3} />
              <Button size="sm" onClick={addNote} disabled={!noteText.trim() || saving}>Add note</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Notes history</CardTitle></CardHeader>
            <CardContent>
              {form.notes ? <pre className="text-sm whitespace-pre-wrap font-sans">{form.notes}</pre> : <p className="text-sm text-muted-foreground">No notes yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete contact</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone. Type <strong>DELETE</strong> to confirm.</p>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type DELETE" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteContact} disabled={deleteConfirm !== 'DELETE'}>Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactProfile;
