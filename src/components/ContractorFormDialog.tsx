import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { logAudit } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface EditingContractor {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
  tags?: string[] | null;
}

interface ContractorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: EditingContractor | null;
  availableTags: Tag[];
  activeProvider: 'paystack' | 'flutterwave';
  profile: any;
  onSaved: () => void;
}

const EMPTY_BANK: BankAccountValue = {
  bank_name: '',
  account_number: '',
  account_name: '',
  verified: false,
};

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  default_amount_ngn: '',
  linkedin_id: '',
  email: '',
  whatsapp_phone: '',
  linkedin_url: '',
  heyreach_email: '',
  heyreach_password: '',
  onboarded_at: '',
};

export function ContractorFormDialog({
  open, onOpenChange, editing, availableTags, activeProvider, profile, onSaved,
}: ContractorFormDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [bank, setBank] = useState<BankAccountValue>(EMPTY_BANK);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Seed (or reset) internal form state whenever the dialog opens — for
  // "edit", from the contractor being edited; for "add" (editing === null),
  // back to blank. Note edit mode only seeds first/last name + amount + bank
  // + tags — the other fields (email, phone, LinkedIn, onboarded date) are
  // add-only, matching handleSave's `...(!editing ? {...} : {})` payload.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...EMPTY_FORM,
        first_name: editing.first_name || (editing.full_name || '').split(' ')[0] || '',
        last_name: editing.last_name || (editing.full_name || '').split(' ').slice(1).join(' ') || '',
        default_amount_ngn: String(editing.default_amount_ngn),
      });
      setBank({
        bank_name: editing.bank_name,
        account_number: editing.account_number,
        account_name: editing.full_name,
        verified: false,
      });
      setSelectedTagIds(editing.tags || []);
    } else {
      setForm(EMPTY_FORM);
      setBank(EMPTY_BANK);
      setSelectedTagIds([]);
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!bank.verified) {
      toast({
        title: 'Verify the account first',
        description: 'The bank account must be verified via Paystack before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const computedFullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim() || bank.account_name;
    const payload = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      full_name: computedFullName,
      bank_name: bank.bank_name,
      account_number: bank.account_number,
      default_amount_ngn: parseFloat(form.default_amount_ngn) || 0,
      status: 'active',
      tags: selectedTagIds,
      ...(!editing ? {
        account_name: bank.account_name || null,
        email: form.email.trim() || null,
        whatsapp_phone: form.whatsapp_phone.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        heyreach_email: form.heyreach_email.trim() || null,
        heyreach_password_enc: form.heyreach_password.trim() || null,
        onboarded_at: form.onboarded_at || null,
      } : {}),
    };

    try {
      if (editing) {
        const { error } = await supabase.from('contractors').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('contractor_edited', `Contractor "${payload.full_name}" updated`, profile);
        toast({ title: 'Contractor updated' });
      } else {
        const { error } = await supabase.from('contractors').insert(payload);
        if (error) throw error;
        await logAudit('contractor_added', `Contractor "${payload.full_name}" added`, profile);
        toast({ title: 'Contractor added' });
      }
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast({ title: 'Error', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'Add'} Contractor</DialogTitle>
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
          </div>
          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ada@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label>Phone / WhatsApp</Label>
                <Input
                  value={form.whatsapp_phone}
                  onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
                  placeholder="+234 800 000 0000"
                />
              </div>
            </div>
          )}

          {bank.verified &&
            bank.account_name &&
            (form.first_name.trim() || form.last_name.trim()) &&
            `${form.first_name.trim()} ${form.last_name.trim()}`.trim().toLowerCase() !==
              bank.account_name.trim().toLowerCase() && (
              <p className="text-xs text-warning">
                Heads up: entered name differs from verified bank name "{bank.account_name}".
              </p>
            )}

          <BankAccountField value={bank} onChange={setBank} provider={activeProvider} />

          {!editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>LinkedIn Profile URL</Label>
                <Input
                  value={form.linkedin_url}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                  placeholder="https://linkedin.com/in/your-profile"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>LinkedIn Email</Label>
                  <Input
                    type="email"
                    value={form.heyreach_email}
                    onChange={(e) => setForm({ ...form, heyreach_email: e.target.value })}
                    placeholder="LinkedIn login email"
                  />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn Password</Label>
                  <Input
                    type="password"
                    value={form.heyreach_password}
                    onChange={(e) => setForm({ ...form, heyreach_password: e.target.value })}
                    placeholder="LinkedIn login password"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Default Amount (₦)</Label>
              <Input
                type="number"
                value={form.default_amount_ngn}
                onChange={(e) =>
                  setForm({ ...form, default_amount_ngn: e.target.value })
                }
              />
            </div>
          </div>
          {!editing && (
            <div className="space-y-1">
              <Label>Date Onboarded (LinkedIn Outreach)</Label>
              <Input
                type="date"
                value={form.onboarded_at}
                onChange={(e) => setForm({ ...form, onboarded_at: e.target.value })}
              />
            </div>
          )}
          {availableTags.length > 0 && (
            <div className="space-y-1">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        setSelectedTagIds((prev) =>
                          selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                        )
                      }
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all',
                        selected ? 'opacity-100' : 'opacity-40 hover:opacity-75',
                      )}
                      style={
                        tag.color
                          ? {
                              backgroundColor: `${tag.color}25`,
                              color: tag.color,
                              borderColor: `${tag.color}50`,
                              outline: selected ? `2px solid ${tag.color}` : undefined,
                              outlineOffset: '1px',
                            }
                          : undefined
                      }
                    >
                      {selected && <Check className="mr-1 h-3 w-3" />}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting || !form.first_name.trim() || !bank.verified}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
