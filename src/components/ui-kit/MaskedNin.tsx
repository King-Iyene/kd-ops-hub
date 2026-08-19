import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface MaskedNinProps {
  /** Profile UUID whose NIN to display / reveal. */
  profileId: string;
  /** Last 4 digits for masked display (from nin_last4 column). */
  last4: string | null | undefined;
  className?: string;
  /** Extra classes on the reveal/hide toggle button. */
  buttonClassName?: string;
  /** Whether the current user has permission to reveal (admin / super_admin). */
  canReveal?: boolean;
}

/**
 * NIN displayed masked by default (last 4 digits only), with an eye-icon
 * toggle that calls get_decrypted_nin to reveal the full value for admins.
 *
 * Unlike MaskedAccountNumber (which has the full value client-side), the
 * plaintext NIN is only fetched on demand via an RPC call — it never sits
 * in the browser unless explicitly requested.
 */
export function MaskedNin({ profileId, last4, className, buttonClassName, canReveal }: MaskedNinProps) {
  const [revealed, setRevealed] = useState(false);
  const [fullNin, setFullNin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (!last4) return <span className={className}>Not set</span>;

  const masked = '•'.repeat(7) + last4; // ••••••• + last 4

  const handleToggle = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }

    // If we already fetched the value, just reveal it.
    if (fullNin) {
      setRevealed(true);
      return;
    }

    // Fetch via RPC.
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_decrypted_nin', {
        p_profile_id: profileId,
      });
      if (error) {
        toast({ title: 'Cannot reveal NIN', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      if (data) {
        setFullNin(data);
        setRevealed(true);
      } else {
        toast({ title: 'NIN not available', description: 'Encrypted value not found.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to decrypt NIN.', variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono tabular-nums', className)}>
      {revealed && fullNin ? fullNin : masked}
      {canReveal && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            'text-muted-foreground hover:text-foreground transition-colors',
            buttonClassName,
          )}
          aria-label={revealed ? 'Hide NIN' : 'Show NIN'}
          title={revealed ? 'Hide NIN' : 'Show NIN'}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : revealed ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </span>
  );
}
