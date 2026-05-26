import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  Rocket,
  Users,
  CreditCard,
  Zap,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Step {
  key: string;
  label: string;
  description: string;
  path: string;
  icon: typeof Rocket;
}

const STEPS: Step[] = [
  {
    key: 'add_contractor',
    label: 'Add your first contractor',
    description: 'Import via CSV or add one manually.',
    path: '/contractors',
    icon: Users,
  },
  {
    key: 'create_batch',
    label: 'Create a payment batch',
    description: 'Select contractors, set amounts, submit for approval.',
    path: '/payments/new',
    icon: CreditCard,
  },
  {
    key: 'process_payment',
    label: 'Process a payment',
    description: 'Approve, fund, and process a batch end-to-end.',
    path: '/payments',
    icon: Zap,
  },
];

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [dismissed, setDismissed] = useState(false);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!profile?.id) return;
    // Check if the user has completed onboarding.
    if (profile.onboarding_complete) {
      setDismissed(true);
      return;
    }
    const steps = (profile as any).onboarding_steps || {};
    setCompleted(steps);
  }, [profile]);

  useEffect(() => {
    if (!profile?.id || dismissed) return;
    // Auto-detect completions by checking data existence.
    const check = async () => {
      const [{ count: contractors }, { count: batches }, { count: processed }] =
        await Promise.all([
          supabase.from('contractors').select('id', { count: 'exact', head: true }).neq('status', 'deleted').neq('is_anonymised', true),
          supabase.from('payment_batches').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase
            .from('payment_batches')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'processed')
            .is('deleted_at', null),
        ]);
      const next: Record<string, boolean> = {
        add_contractor: (contractors || 0) > 0,
        create_batch: (batches || 0) > 0,
        process_payment: (processed || 0) > 0,
      };
      setCompleted(next);
      // Persist to profile.
      await supabase
        .from('profiles')
        .update({
          onboarding_steps: next,
          onboarding_complete: Object.values(next).every(Boolean),
        })
        .eq('id', profile.id);
    };
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, dismissed]);

  const dismiss = async () => {
    setDismissed(true);
    if (profile?.id) {
      await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', profile.id);
    }
  };

  if (dismissed) return null;
  const allDone = STEPS.every((s) => completed[s.key]);
  if (allDone) return null;

  const doneCount = STEPS.filter((s) => completed[s.key]).length;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          Complete your setup ({doneCount}/{STEPS.length})
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={dismiss} title="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {STEPS.map((step) => {
          const done = !!completed[step.key];
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => navigate(step.path)}
              className={cn(
                'w-full flex items-start gap-3 rounded-lg p-3 text-left kd-transition',
                done
                  ? 'bg-success/10 cursor-default'
                  : 'hover:bg-primary/10 cursor-pointer',
              )}
            >
              {done ? (
                <CheckCircle2 className="h-5 w-5 text-success mt-0.5 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-medium',
                    done && 'line-through text-muted-foreground',
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
