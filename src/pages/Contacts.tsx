import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayName } from '@/lib/name';
import {
  Plus,
  Search,
  UserPlus,
  Users,
  Loader2,
  Pencil,
  ArrowRightCircle,
  MessageSquare,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Download } from 'lucide-react';

type ContactType = 'lead' | 'student' | 'contact' | 'partner';
type ContactStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

interface Contact {
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

const TYPE_BADGE: Record<ContactType, string> = {
  lead: 'bg-info/10 text-info',
  student: 'bg-accent/15 text-accent-foreground',
  contact: 'bg-muted text-muted-foreground',
  partner: 'bg-success/10 text-success',
};

const STATUS_BADGE: Record<ContactStatus, string> = {
  new: 'bg-warning/10 text-warning',
  contacted: 'bg-info/10 text-info',
  qualified: 'bg-primary/10 text-primary',
  converted: 'bg-success/10 text-success',
  lost: 'bg-destructive/10 text-destructive',
};

const Contacts = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ContactType>('all');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    contact_type: 'lead' as ContactType,
    source: 'manual',
    tags: '',
    notes: '',
  });

  const [noteDialog, setNoteDialog] = useState<Contact | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });
    setContacts((data as Contact[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setForm({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      contact_type: 'lead',
      source: 'manual',
      tags: '',
      notes: '',
    });
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      first_name: c.first_name || (c.full_name || '').split(' ')[0] || '',
      last_name: c.last_name || (c.full_name || '').split(' ').slice(1).join(' ') || '',
      email: c.email || '',
      phone: c.phone || '',
      contact_type: c.contact_type,
      source: c.source || '',
      tags: (c.tags || []).join(', '),
      notes: c.notes || '',
    });
    setDialog(true);
  };

  const save = async () => {
    if (!form.first_name.trim()) {
      toast({ title: 'First name is required', variant: 'destructive' });
      return;
    }
    // Duplicate check by email (skip if editing same contact or no email).
    if (form.email && (!editing || editing.email !== form.email)) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', form.email.trim().toLowerCase())
        .maybeSingle();
      if (existing) {
        toast({
          title: 'A contact with this email already exists',
          description: 'Check the contact list or use a different email.',
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        email: form.email || null,
        phone: form.phone || null,
        contact_type: form.contact_type,
        source: form.source || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase
          .from('contacts')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Contact updated' });
      } else {
        const { error } = await supabase.from('contacts').insert({
          ...payload,
          created_by: profile?.id || null,
        });
        if (error) throw error;
        toast({ title: 'Contact added' });
      }
      setDialog(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!noteDialog || !noteText.trim()) return;
    const existing = noteDialog.notes || '';
    const stamp = new Date().toLocaleString('en-GB');
    const updated = `${existing}\n\n[${stamp}] ${noteText.trim()}`.trim();
    const { error } = await supabase
      .from('contacts')
      .update({ notes: updated })
      .eq('id', noteDialog.id);
    if (error) {
      toast({ title: 'Could not save note', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Note added' });
    setNoteDialog(null);
    setNoteText('');
    load();
  };

  const convertToContractor = async (c: Contact) => {
    if (!c.full_name) return;
    try {
      const { data, error } = await supabase
        .from('contractors')
        .insert({
          full_name: c.full_name,
          bank_name: '',
          account_number: '',
          default_amount_ngn: 0,
          status: 'active',
        })
        .select('id')
        .single();
      if (error) throw error;
      await supabase
        .from('contacts')
        .update({
          status: 'converted',
          converted_to_contractor_id: (data as any).id,
        })
        .eq('id', c.id);
      await logAudit(
        'contractor_added',
        `Contact "${c.full_name}" converted to contractor`,
        profile,
      );
      toast({ title: `${c.full_name} converted to contractor` });
      load();
    } catch (err: any) {
      toast({ title: 'Conversion failed', description: err?.message, variant: 'destructive' });
    }
  };

  const exportCsv = () => {
    const header = ['name', 'email', 'phone', 'type', 'source', 'status', 'tags', 'created_at'];
    const rows = contacts.map((c) => [
      c.full_name,
      c.email || '',
      c.phone || '',
      c.contact_type,
      c.source || '',
      c.status,
      (c.tags || []).join('; '),
      c.created_at,
    ]);
    downloadCsv('kdops-contacts.csv', toCsv(header, rows));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (typeFilter !== 'all' && c.contact_type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.tags || []).join(' ').toLowerCase().includes(q)
      );
    });
  }, [contacts, search, typeFilter]);

  const pagination = usePagination(filtered, 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Leads, students, partners — every person KD Squares talks to."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={contacts.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button
              onClick={() => {
                reset();
                setDialog(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add contact
            </Button>
          </>
        }
      />

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts"><Users className="mr-2 h-4 w-4" /> Contacts</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquare className="mr-2 h-4 w-4" /> WhatsApp Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-4 space-y-4">
      <Card>
        <div className="p-4 border-b flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, phone, tags..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="lead">Leads</SelectItem>
              <SelectItem value="student">Students</SelectItem>
              <SelectItem value="contact">Contacts</SelectItem>
              <SelectItem value="partner">Partners</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              description="Add your first lead, student or partner to start building your pipeline."
              action={
                <Button
                  onClick={() => {
                    reset();
                    setDialog(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add contact
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((c) => (
                    <TableRow key={c.id} className="kd-transition cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                      <TableCell className="font-medium">{displayName(c.first_name, c.last_name, c.full_name)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.email || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.phone || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={TYPE_BADGE[c.contact_type]}>
                          {c.contact_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_BADGE[c.status]}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setNoteDialog(c);
                              setNoteText('');
                            }}
                            title="Add note"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(c)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {c.status !== 'converted' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => convertToContractor(c)}
                              title="Convert to contractor"
                            >
                              <ArrowRightCircle className="h-4 w-4 text-success" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={pagination.pageSize}
                onPrev={pagination.prev}
                onNext={pagination.next}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
              />
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppGroupsTab />
        </TabsContent>
      </Tabs>

      <Dialog open={dialog} onOpenChange={(v) => { setDialog(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit contact' : 'New contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Ada"
                />
              </div>
              <div className="space-y-1">
                <Label>Last name *</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Okonkwo"
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={form.contact_type}
                  onValueChange={(v) => setForm({ ...form, contact_type: v as ContactType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tags (comma separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="e.g. lagos, fintech, Q2-campaign"
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save' : 'Add contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!noteDialog} onOpenChange={(v) => { if (!v) { setNoteDialog(null); setNoteText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add note — {noteDialog?.full_name}</DialogTitle>
          </DialogHeader>
          {noteDialog?.notes && (
            <div className="rounded-md border bg-muted/20 p-3 text-xs whitespace-pre-wrap max-h-40 overflow-auto">
              {noteDialog.notes}
            </div>
          )}
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Type your note..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(null)}>Cancel</Button>
            <Button onClick={addNote} disabled={!noteText.trim()}>
              Add note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contacts;

// ---------------------------------------------------------------------------
// WhatsApp Groups management
// ---------------------------------------------------------------------------

interface WaGroup {
  id: string;
  name: string;
  description: string | null;
  invite_link: string | null;
  member_count: number;
  group_type: string;
  status: string;
  created_at: string;
}

const GROUP_TYPES = ['general', 'project', 'department', 'client', 'vendor'] as const;

const emptyGroupForm = {
  name: '',
  description: '',
  invite_link: '',
  member_count: '',
  group_type: 'general' as string,
};

export function WhatsAppGroupsTab() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WaGroup | null>(null);
  const [form, setForm] = useState(emptyGroupForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_groups')
      .select('*')
      .order('name');
    setGroups((data as WaGroup[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditing(null); setForm(emptyGroupForm); };

  const openEdit = (g: WaGroup) => {
    setEditing(g);
    setForm({
      name: g.name,
      description: g.description || '',
      invite_link: g.invite_link || '',
      member_count: String(g.member_count || 0),
      group_type: g.group_type,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Group name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      invite_link: form.invite_link.trim() || null,
      member_count: parseInt(form.member_count) || 0,
      group_type: form.group_type,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editing) {
        const { error } = await supabase.from('whatsapp_groups').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('whatsapp_group_updated', `WhatsApp group "${payload.name}" updated`, profile);
        toast({ title: 'Group updated' });
      } else {
        const { error } = await supabase.from('whatsapp_groups').insert({ ...payload, created_by: profile?.id, status: 'active' });
        if (error) throw error;
        await logAudit('whatsapp_group_created', `WhatsApp group "${payload.name}" created`, profile);
        toast({ title: 'Group created' });
      }
      setShowForm(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const archive = async (g: WaGroup) => {
    const next = g.status === 'active' ? 'archived' : 'active';
    await supabase.from('whatsapp_groups').update({ status: next }).eq('id', g.id);
    await logAudit('whatsapp_group_updated', `WhatsApp group "${g.name}" ${next}`, profile);
    toast({ title: `Group ${next}` });
    load();
  };

  if (loading) {
    return <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {groups.length} group{groups.length !== 1 ? 's' : ''} tracked
          </p>
          <Button onClick={() => { reset(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Group
          </Button>
        </div>

        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No WhatsApp groups tracked yet. Add groups to organize your contacts.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead>Invite Link</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <TableRow key={g.id} className="kd-transition">
                      <TableCell>
                        <div className="font-medium">{g.name}</div>
                        {g.description && (
                          <div className="text-xs text-muted-foreground">{g.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">{g.group_type}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{g.member_count}</TableCell>
                      <TableCell>
                        {g.invite_link ? (
                          <a
                            href={g.invite_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <LinkIcon className="h-3 w-3" /> Link
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            g.status === 'active'
                              ? 'bg-success/10 text-success cursor-pointer'
                              : 'bg-muted text-muted-foreground cursor-pointer'
                          }
                          onClick={() => archive(g)}
                        >
                          {g.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} WhatsApp Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Group name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. KD Partners Q2" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.group_type} onValueChange={(v) => setForm({ ...form, group_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GROUP_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Member count</Label>
                <Input type="number" value={form.member_count} onChange={(e) => setForm({ ...form, member_count: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Invite link</Label>
              <Input value={form.invite_link} onChange={(e) => setForm({ ...form, invite_link: e.target.value })} placeholder="https://chat.whatsapp.com/..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
