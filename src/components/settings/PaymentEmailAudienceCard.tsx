/**
 * Settings → Notifications → Payment notification audience.
 *
 * Picks who receives the "Payment received from KD Squares" email after a
 * successful Paystack transfer. Stored on company_settings.payment_email_audience
 * and read by the paystack-webhook function on every transfer.success event.
 * Hot-toggleable from the UI — no redeploy.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Users, Briefcase, BellOff, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanySettings, useInvalidate, queryKeys } from '@/queries';
import { cn } from '@/lib/utils';

type Audience = 'all' | 'employees_only' | 'contractors_only' | 'none';

interface OptionDef {
  value: Audience;
  label: string;
  desc: string;
  icon: typeof Mail;
}

const OPTIONS: OptionDef[] = [
  {
    value: 'all',
    label: 'Everyone',
    desc: 'Email every recipient — employees and contractors. Most email volume; original behaviour.',
    icon: Mail,
  },
  {
    value: 'employees_only',
    label: 'Employees only',
    desc: 'Email only payouts that land in a staff profile (payslips, salary advances, bonuses). Saves credits on a free-plan SMTP.',
    icon: Users,
  },
  {
    value: 'contractors_only',
    label: 'Contractors only',
    desc: 'Email only payouts to partners / freelancers. Useful if employee payslips are already delivered elsewhere.',
    icon: Briefcase,
  },
  {
    value: 'none',
    label: 'No emails',
    desc: 'Disable the payment-received email entirely. Audit trail and in-app notifications are unaffected.',
    icon: BellOff,
  },
];

export function PaymentEmailAudienceCard() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const { data: companySettingsData, isLoading: loading } = useCompanySettings();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);
  const [audience, setAudience] = useState<Audience>('all');

  useEffect(() => {
    const v = (companySettingsData as any)?.payment_email_audience;
    if (v === 'all' || v === 'employees_only' || v === 'contractors_only' || v === 'none') {
      setAudience(v);
    }
  }, [companySettingsData]);

  const choose = async (next: Audience) => {
    if (!isAdmin || saving || next === audience) return;
    setSaving(true);
    const previous = audience;
    setAudience(next); // optimistic
    const { error } = await supabase
      .from('company_settings')
      .update({ payment_email_audience: next })
      .eq('id', '00000000-0000-0000-0000-000000000001');
    setSaving(false);
    if (error) {
      setAudience(previous);
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    invalidate(queryKeys.companySettings.current());
    toast({
      title: 'Payment-email audience updated',
      description: OPTIONS.find((o) => o.value === next)?.label,
    });
  };

  const current = useMemo(() => OPTIONS.find((o) => o.value === audience), [audience]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Payment-received emails
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          When a Paystack transfer settles, KDOps can send the recipient a "Payment received" email.
          Pick who actually receives it — useful to stay under a free email-provider quota without
          touching code.
          {current && (
            <span className="block mt-1.5">
              Current: <span className="font-semibold text-foreground">{current.label}</span>
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OPTIONS.map((opt) => {
              const selected = audience === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => choose(opt.value)}
                  disabled={!isAdmin || saving}
                  className={cn(
                    'group text-left rounded-lg border p-3 transition-all relative',
                    selected
                      ? 'border-primary/60 bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border/60 hover:border-border hover:bg-muted/40',
                    (!isAdmin || saving) && 'opacity-60 cursor-not-allowed',
                  )}
                  aria-pressed={selected}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={cn(
                      'shrink-0 rounded-md p-1.5',
                      selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-foreground')}>
                          {opt.label}
                        </p>
                        {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!isAdmin && (
          <p className="text-[11px] text-muted-foreground">
            Only admins and super admins can change this setting.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
