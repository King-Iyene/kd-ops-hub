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
  Info,
  Send,
  FlaskConical,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Pagination } from '@/components/ui-kit/Pagination';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { usePagination } from '@/hooks/usePagination';
import { usePageTitle } from '@/hooks/usePageTitle';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Download } from 'lucide-react';
import { parseNigerianPhone } from '@/lib/phone';

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
  usePageTitle('Contacts');
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
  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, first_name, last_name, email, phone, contact_type, source, tags, notes, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
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

  const deleteContact = async (c: Contact) => {
    const { error } = await supabase.rpc('soft_delete_contact', { p_contact_id: c.id });
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('contact_deleted', `Contact "${c.full_name}" deleted`, profile);
    toast({ title: 'Contact deleted' });
    setConfirmDelete(null);
    load();
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
      formatDate(c.created_at),
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
      <AuroraHero className="p-5 sm:p-6" pattern="constellation">
        <PageHeader
          className="mb-0"
          title="Contacts"
          description="Leads, students, partners — every person KD Squares talks to."
          icon={Users}
          info="Central directory for everyone KD Squares works with — clients, leads, students, partners and vendors. Tag and search by type."
          actions={
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={contacts.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  reset();
                  setDialog(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add contact
              </Button>
            </div>
          }
        />
      </AuroraHero>

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts"><Users className="mr-2 h-4 w-4" /> Contacts</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquare className="mr-2 h-4 w-4" /> WhatsApp Groups</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="test-notify"><FlaskConical className="mr-2 h-4 w-4" /> Test Notifications</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="contacts" className="mt-4 space-y-4">
      <Card className="rounded-xl">
        <div className="p-3 sm:p-4 border-b border-border/50 flex gap-3 items-center flex-wrap">
          <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 h-10 sm:h-9"
              placeholder="Search name, email, phone, tags..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9">
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
              illustration="ghost"
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
              <div className="hidden md:block">
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
                            aria-label={`Add note for ${c.full_name}`}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(c)}
                            title="Edit"
                            aria-label={`Edit ${c.full_name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {c.status !== 'converted' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => convertToContractor(c)}
                              title="Convert to contractor"
                              aria-label={`Convert ${c.full_name} to contractor`}
                            >
                              <ArrowRightCircle className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(evt) => { evt.stopPropagation(); setConfirmDelete(c); }}
                              title="Delete"
                              aria-label={`Delete ${c.full_name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Mobile contacts list */}
              <div className="md:hidden p-3 space-y-2">
                {pagination.slice.map((c) => (
                  <MobileCard
                    key={c.id}
                    onClick={() => navigate(`/contacts/${c.id}`)}
                    accentClassName={c.status === 'converted' ? 'bg-emerald-500' : c.contact_type === 'lead' ? 'bg-amber-500' : 'bg-blue-500'}
                  >
                    <MobileCardHeader>
                      <div className="min-w-0 flex-1">
                        <MobileCardTitle>{displayName(c.first_name, c.last_name, c.full_name)}</MobileCardTitle>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${TYPE_BADGE[c.contact_type]}`}>
                            {c.contact_type}
                          </Badge>
                          <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${STATUS_BADGE[c.status]}`}>
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                    </MobileCardHeader>

                    {c.email && <MobileCardRow label="Email"><span className="truncate">{c.email}</span></MobileCardRow>}
                    {c.phone && <MobileCardRow label="Phone">{c.phone}</MobileCardRow>}
                    <MobileCardRow label="Added">{formatDate(c.created_at)}</MobileCardRow>

                    <MobileCardFooter>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9"
                        onClick={(e) => { e.stopPropagation(); setNoteDialog(c); setNoteText(''); }}
                      >
                        <MessageSquare className="h-4 w-4 mr-1.5" /> Note
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9"
                        onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                      >
                        <Pencil className="h-4 w-4 mr-1.5" /> Edit
                      </Button>
                      {c.status !== 'converted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 px-3 text-success border-success/40"
                          onClick={(e) => { e.stopPropagation(); convertToContractor(c); }}
                          title="Convert to contractor"
                        >
                          <ArrowRightCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 px-3 text-destructive"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </MobileCardFooter>
                  </MobileCard>
                ))}
              </div>

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

        {isAdmin && (
          <TabsContent value="test-notify" className="mt-4">
            <NotifyTestTab contacts={contacts} />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={dialog} onOpenChange={(v) => { setDialog(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit contact' : 'New contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs whitespace-pre-wrap max-h-40 overflow-auto">
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

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete contact</DialogTitle>
            <DialogDescription>
              Delete {confirmDelete?.full_name}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDelete && deleteContact(confirmDelete)}>
              Delete
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
      .select('id, name, description, invite_link, member_count, group_type, status')
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

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {groups.length} group{groups.length !== 1 ? 's' : ''} tracked
          </p>
          <Button size="sm" onClick={() => { reset(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Group
          </Button>
        </div>

        {groups.length === 0 ? (
          <Card className="rounded-xl">
            <CardContent className="p-0">
              <EmptyState
                icon={MessageSquare}
                title="No WhatsApp groups yet"
                description="Add groups to organize your contacts into project, client and department channels."
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                        <Button size="sm" variant="ghost" onClick={() => openEdit(g)} aria-label={`Edit ${g.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <Input type="number" min="0" value={form.member_count} onChange={(e) => setForm({ ...form, member_count: e.target.value })} />
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

// ---------------------------------------------------------------------------
// Notification Test Panel — temporary tool for verifying Termii / Resend
// ---------------------------------------------------------------------------

type TestChannel = 'sms' | 'whatsapp' | 'email';

interface TestResult {
  ok: boolean;
  message: string;
}

function NotifyTestTab({ contacts }: { contacts: Contact[] }) {
  const { toast } = useToast();
  const [contactId, setContactId] = useState('');
  const [channel, setChannel] = useState<TestChannel>('whatsapp');
  const [message, setMessage] = useState('Hi, this is a test message from KD Squares. Please ignore.');
  const [emailSubject, setEmailSubject] = useState('KD Squares — Test Notification');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const selected = contacts.find((c) => c.id === contactId) ?? null;
  const phoneInfo = parseNigerianPhone(selected?.phone);
  const canSendPhone = channel !== 'email' && phoneInfo.ok;
  const canSendEmail = channel === 'email' && !!selected?.email;
  const canSend = selected && (canSendPhone || canSendEmail) && message.trim();

  const handleSend = async () => {
    if (!canSend || !selected) return;
    setSending(true);
    setResult(null);
    try {
      let body: Record<string, string>;
      if (channel === 'email') {
        body = {
          channel: 'email',
          to: selected.email!,
          subject: emailSubject,
          html: `<p>${message.replace(/\n/g, '<br/>')}</p><p style="color:#888;font-size:12px">Test sent via KD Ops — Contacts › Test Notifications</p>`,
        };
      } else {
        body = {
          channel,
          to: phoneInfo.termii!,
          message: message.trim(),
        };
      }

      const { data, error } = await supabase.functions.invoke('send-email', { body });
      if (error) throw new Error(error.message);
      if ((data as any)?.ok === false) {
        const raw = (data as any)?.termii_raw ? `\n\nTermii raw response:\n${(data as any).termii_raw}` : '';
        throw new Error(((data as any)?.error ?? 'Send failed') + raw);
      }

      const devSkip = (data as any)?.dev_skip === true;
      const msgId = (data as any)?.message_id ?? (data as any)?.id ?? null;
      setResult({
        ok: true,
        message: devSkip
          ? 'DEV MODE: secret not configured — no message sent (function returned dev_skip: true). Set TERMII_API_KEY or RESEND_API_KEY in Supabase secrets.'
          : `Sent! ${msgId ? `Provider ID: ${msgId}` : ''}`,
      });
    } catch (err: any) {
      setResult({ ok: false, message: err?.message ?? String(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="kd-card-warning flex items-start gap-2">
        <FlaskConical className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
        <span>This panel is a <strong>temporary test tool</strong>. It calls the live <code>send-email</code> edge function directly and will send real messages. Delete the tab once Termii / Resend are confirmed working.</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Send a test notification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Contact</Label>
            <Select value={contactId || undefined} onValueChange={(v) => { setContactId(v); setResult(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a contact…" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name} {c.phone ? `· ${c.phone}` : ''} {c.email ? `· ${c.email}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs space-y-0.5">
              <div><span className="text-muted-foreground">Phone: </span>
                {selected.phone ? (
                  phoneInfo.ok
                    ? <span className="text-success font-medium">{phoneInfo.termii} ✓ valid Termii number</span>
                    : <span className="text-destructive">{selected.phone} — {phoneInfo.reason}</span>
                ) : <span className="text-muted-foreground">none</span>}
              </div>
              <div><span className="text-muted-foreground">Email: </span>
                {selected.email ?? <span className="text-muted-foreground">none</span>}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => { setChannel(v as TestChannel); setResult(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp (Termii)</SelectItem>
                <SelectItem value="sms">SMS (Termii)</SelectItem>
                <SelectItem value="email">Email (Resend)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {channel === 'email' && (
            <div className="space-y-1">
              <Label>Subject</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>Message body</Label>
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your test message…"
            />
            {(channel === 'sms' || channel === 'whatsapp') && (
              <p className="text-xs text-muted-foreground">{message.length} / 280 chars</p>
            )}
          </div>

          {selected && !canSendPhone && channel !== 'email' && (
            <p className="text-xs text-destructive">
              {!selected.phone
                ? 'This contact has no phone number.'
                : phoneInfo.reason ?? 'Invalid phone number.'}
            </p>
          )}
          {selected && channel === 'email' && !selected.email && (
            <p className="text-xs text-destructive">This contact has no email address.</p>
          )}

          {result && (
            <div className={`rounded-lg border px-3 py-2.5 flex items-start gap-2 text-sm ${
              result.ok
                ? 'kd-card-success'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}>
              {result.ok
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="whitespace-pre-wrap">{result.message}</span>
            </div>
          )}

          <Button onClick={handleSend} disabled={!canSend || sending} className="w-full">
            {sending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
              : <><Send className="mr-2 h-4 w-4" /> Send test {channel === 'email' ? 'email' : channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</>
            }
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
