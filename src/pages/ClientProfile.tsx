import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, Globe, MapPin, Save, Loader2, Trash2,
  Building2, CalendarDays, DollarSign,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { PageBreadcrumbs } from '@/components/ui-kit/PageBreadcrumbs';
import { logAudit } from '@/lib/audit';
import { MANAGER_ROLES, hasRole } from '@/lib/roles';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';

type ClientStatus = 'active' | 'inactive' | 'prospect';

interface ClientData {
  id: string;
  name: string;
  industry: string | null;
  status: ClientStatus;
  contract_value_ngn: number;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  start_date: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_TONE: Record<ClientStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
  inactive: 'bg-muted text-muted-foreground',
  prospect: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
};

const INDUSTRIES = [
  'Technology', 'Finance & Banking', 'Healthcare', 'Education',
  'Retail & E-commerce', 'Manufacturing', 'Construction', 'Agriculture',
  'Media & Entertainment', 'Logistics & Transport', 'Energy & Utilities',
  'Government & NGO', 'Real Estate', 'Food & Beverage', 'Other',
];

const ClientProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  usePageTitle('Client Profile');

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ClientData>>({});
  const [noteText, setNoteText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);

  const canManage = hasRole(profile?.role, MANAGER_ROLES);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error || !data) {
      const msg = error?.message || '';
      if (/schema cache|does not exist|public\.clients/i.test(msg)) {
        toast({
          title: 'Database not ready',
          description: 'The Clients table has not been deployed. Ask an admin to run "supabase db push".',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Client not found', variant: 'destructive' });
      }
      navigate('/clients');
      return;
    }
    setClient(data as ClientData);
    setForm(data as ClientData);
    setLoading(false);
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!id || !form.name?.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('clients').update({
      name: form.name.trim(),
      industry: form.industry || null,
      status: form.status,
      contract_value_ngn: Number(form.contract_value_ngn) || 0,
      contact_person: form.contact_person?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      website: form.website?.trim() || null,
      address: form.address?.trim() || null,
      start_date: form.start_date || null,
    }).eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('client_updated', `Client "${form.name}" updated`, profile);
      toast({ title: 'Client saved' });
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
      await supabase.from('clients').update({ notes: updated }).eq('id', id);
      await logAudit('client_updated', `Note added to client "${client?.name}"`, profile);
      setForm((prev) => ({ ...prev, notes: updated }));
      setNoteText('');
      toast({ title: 'Note added' });
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async () => {
    if (!id) return;
    await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    await logAudit('client_deleted', `Client "${client?.name}" deleted`, profile);
    toast({ title: 'Client removed' });
    navigate('/clients');
  };

  if (loading || !client) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const patch = (p: Partial<ClientData>) => setForm((prev) => ({ ...prev, ...p }));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageBreadcrumbs trail={[
        { label: 'Clients', href: '/clients' },
        { label: client.name },
      ]} />
      {/* Back + title */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to clients"
          onClick={() => navigate('/clients')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{client.name}</h1>
          <p className="text-muted-foreground text-sm">{client.industry || 'No industry set'}</p>
        </div>
        <Badge className={cn('capitalize', STATUS_TONE[client.status])}>
          {client.status}
        </Badge>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
              <Building2 className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {client.contact_person && (
                <p className="text-sm font-medium">{client.contact_person}</p>
              )}
              {client.email && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {client.email}
                </p>
              )}
              {client.phone && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {client.phone}
                </p>
              )}
              {client.website && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline truncate"
                  >
                    {client.website}
                  </a>
                </p>
              )}
              {client.address && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> {client.address}
                </p>
              )}
              {client.contract_value_ngn > 0 && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5 shrink-0" />
                  Contract value:{' '}
                  <span className="font-medium text-foreground currency">
                    {formatNaira(client.contract_value_ngn)}
                  </span>
                </p>
              )}
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                Added {formatDate(client.created_at)}
                {client.start_date && ` · Contract from ${formatDate(client.start_date)}`}
              </p>
            </div>
            {canManage && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setPendingDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove client
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* Details tab */}
        <TabsContent value="details" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-full space-y-1">
                  <Label>Client name *</Label>
                  <Input
                    value={form.name || ''}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Industry</Label>
                  <Select
                    value={form.industry || ''}
                    onValueChange={(v) => patch({ industry: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((i) => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => patch({ status: v as ClientStatus })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Contract value (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.contract_value_ngn || ''}
                    onChange={(e) => patch({ contract_value_ngn: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    min="2000-01-01"
                    max="2099-12-31"
                    value={form.start_date || ''}
                    onChange={(e) => patch({ start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Contact person</Label>
                  <Input
                    value={form.contact_person || ''}
                    onChange={(e) => patch({ contact_person: e.target.value })}
                    placeholder="Name of main contact"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email || ''}
                    onChange={(e) => patch({ email: e.target.value })}
                    placeholder="contact@company.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone || ''}
                    onChange={(e) => patch({ phone: e.target.value })}
                    placeholder="+234 800 000 0000"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <Label>Website</Label>
                  <Input
                    value={form.website || ''}
                    onChange={(e) => patch({ website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <Label>Address</Label>
                  <Input
                    value={form.address || ''}
                    onChange={(e) => patch({ address: e.target.value })}
                    placeholder="Office address"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !form.name?.trim()}>
                {saving
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Save className="mr-2 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Notes tab */}
        <TabsContent value="notes" className="mt-4 space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type a note about this client…"
                  rows={3}
                />
                <Button
                  size="sm"
                  onClick={addNote}
                  disabled={!noteText.trim() || saving}
                >
                  Add note
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes history</CardTitle>
            </CardHeader>
            <CardContent>
              {form.notes
                ? <pre className="text-sm whitespace-pre-wrap font-sans">{form.notes}</pre>
                : <p className="text-sm text-muted-foreground">No notes yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove client?</AlertDialogTitle>
            <AlertDialogDescription>
              "{client.name}" will be hidden from all screens. The record is kept in the database
              and can be recovered by an admin if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteClient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientProfile;
