import { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  Plus,
  Loader2,
  AlertTriangle,
  Pencil,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatNaira } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
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
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { cn } from '@/lib/utils';

interface VirtualCard {
  id: string;
  card_name: string;
  last_four: string | null;
  vendor: string | null;
  monthly_limit_ngn: number;
  current_spend_ngn: number;
  status: 'active' | 'paused' | 'deactivated';
  notes: string | null;
  subscription_id: string | null;
}

interface Subscription {
  id: string;
  name: string;
}

const STATUS_BADGE: Record<VirtualCard['status'], string> = {
  active: 'bg-success/10 text-success',
  paused: 'bg-warning/10 text-warning',
  deactivated: 'bg-muted text-muted-foreground',
};

const VirtualCards = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<VirtualCard | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VirtualCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    card_name: '',
    last_four: '',
    vendor: '',
    subscription_id: '',
    monthly_limit_ngn: '',
    current_spend_ngn: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [cardsRes, subsRes] = await Promise.all([
      supabase
        .from('virtual_cards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('subscriptions')
        .select('id, name')
        .eq('status', 'active')
        .order('name'),
    ]);
    setCards((cardsRes.data as VirtualCard[]) || []);
    setSubs((subsRes.data as Subscription[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setForm({
      card_name: '',
      last_four: '',
      vendor: '',
      subscription_id: '',
      monthly_limit_ngn: '',
      current_spend_ngn: '',
      notes: '',
    });
  };

  const openCreate = () => {
    reset();
    setDialog(true);
  };

  const openEdit = (c: VirtualCard) => {
    setEditing(c);
    setForm({
      card_name: c.card_name,
      last_four: c.last_four || '',
      vendor: c.vendor || '',
      subscription_id: c.subscription_id || '',
      monthly_limit_ngn: String(c.monthly_limit_ngn),
      current_spend_ngn: String(c.current_spend_ngn),
      notes: c.notes || '',
    });
    setDialog(true);
  };

  const save = async () => {
    if (!form.card_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        card_name: form.card_name.trim(),
        last_four: form.last_four || null,
        vendor: form.vendor || null,
        subscription_id: form.subscription_id || null,
        monthly_limit_ngn: parseFloat(form.monthly_limit_ngn) || 0,
        current_spend_ngn: parseFloat(form.current_spend_ngn) || 0,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase
          .from('virtual_cards')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        await logAudit(
          'virtual_card_updated',
          `Virtual card "${payload.card_name}" updated`,
          profile,
        );
        toast({ title: 'Card updated' });
      } else {
        const { error } = await supabase.from('virtual_cards').insert({
          ...payload,
          created_by: profile?.id || null,
          status: 'active',
        });
        if (error) throw error;
        await logAudit(
          'virtual_card_created',
          `Virtual card "${payload.card_name}" created`,
          profile,
        );
        toast({ title: 'Card created' });
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

  const toggleStatus = async (
    c: VirtualCard,
    next: VirtualCard['status'],
  ) => {
    const { error } = await supabase
      .from('virtual_cards')
      .update({ status: next })
      .eq('id', c.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      next === 'deactivated' ? 'virtual_card_deactivated' : 'virtual_card_updated',
      `Virtual card "${c.card_name}" → ${next}`,
      profile,
    );
    toast({ title: `Card ${next}` });
    load();
  };

  const remove = (c: VirtualCard) => setPendingDelete(c);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('virtual_cards').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('virtual_card_deactivated', `Card "${pendingDelete.card_name}" record deleted`, profile);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Virtual Cards"
        description="Track per-vendor spend controls. Assign a card to a subscription and monitor usage."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New card record
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : cards.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No virtual cards tracked"
              description="Add a card record per vendor or subscription to monitor monthly limits."
              action={
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> New card record
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Last 4</TableHead>
                  <TableHead className="text-right">Spend / limit</TableHead>
                  <TableHead className="w-[160px]">Utilisation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((c) => {
                  const util =
                    c.monthly_limit_ngn > 0
                      ? Math.min(200, (c.current_spend_ngn / c.monthly_limit_ngn) * 100)
                      : 0;
                  const barColor =
                    util >= 100
                      ? 'bg-destructive'
                      : util >= 80
                      ? 'bg-warning'
                      : 'bg-success';
                  return (
                    <TableRow key={c.id} className="kd-transition">
                      <TableCell className="font-medium">{c.card_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.vendor || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono">
                        {c.last_four ? `•••• ${c.last_four}` : '—'}
                      </TableCell>
                      <TableCell className="text-right currency">
                        {formatNaira(c.current_spend_ngn)} /{' '}
                        {formatNaira(c.monthly_limit_ngn)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn('h-full kd-transition', barColor)}
                              style={{ width: `${Math.min(100, util)}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {util >= 80 && (
                              <AlertTriangle className="h-3 w-3 text-warning" />
                            )}
                            {util.toFixed(0)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_BADGE[c.status]}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleStatus(c, 'paused')}
                              title="Pause"
                              aria-label={`Pause card ${c.card_name}`}
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          ) : c.status === 'paused' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleStatus(c, 'active')}
                              title="Resume"
                              aria-label={`Resume card ${c.card_name}`}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(c)}
                            title="Edit"
                            aria-label={`Edit card ${c.card_name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove(c)}
                            title="Delete"
                            aria-label={`Delete card ${c.card_name}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit card' : 'New card record'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Card name</Label>
              <Input
                value={form.card_name}
                onChange={(e) => setForm({ ...form, card_name: e.target.value })}
                placeholder="e.g. Figma Subscription"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vendor</Label>
                <Input
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  placeholder="e.g. Figma Inc."
                />
              </div>
              <div className="space-y-1">
                <Label>Last 4 digits</Label>
                <Input
                  value={form.last_four}
                  onChange={(e) =>
                    setForm({ ...form, last_four: e.target.value.slice(0, 4) })
                  }
                  maxLength={4}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label>Monthly limit (₦)</Label>
                <Input
                  type="number"
                  value={form.monthly_limit_ngn}
                  onChange={(e) =>
                    setForm({ ...form, monthly_limit_ngn: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Current spend (₦)</Label>
                <Input
                  type="number"
                  value={form.current_spend_ngn}
                  onChange={(e) =>
                    setForm({ ...form, current_spend_ngn: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Linked subscription (optional)</Label>
              <Select
                value={form.subscription_id || 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, subscription_id: v === 'none' ? '' : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {subs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create card record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete card record?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.card_name}" will be permanently removed. This does not cancel the card with the card provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VirtualCards;
