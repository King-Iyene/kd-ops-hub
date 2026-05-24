// Derives a single display status for a contractor by combining the team's
// manual lifecycle status with the read-only HeyReach signal synced by the
// `heyreach-sync` edge function.
//
// Precedence (manual decisions always win over the synced signal):
//   ⏸️ Inactive     — contractors.status = 'inactive' (team deactivated)
//   ⚠️ Disconnected — heyreach_status = 'disconnected' (authIsValid = false)
//   ✅ Active       — heyreach_status = 'active'        (authIsValid = true)
//   🆕 Pending      — no LinkedIn Email match / not yet synced

export type HeyReachDisplayKey = 'active' | 'disconnected' | 'inactive' | 'pending';

export interface HeyReachContractorFields {
  status?: string | null;                 // manual: 'active' | 'inactive'
  heyreach_email?: string | null;
  linkedin_url?: string | null;
  heyreach_status?: string | null;         // 'active' | 'disconnected' | 'unmatched' | null
  heyreach_active_campaigns?: number | null;
  heyreach_synced_at?: string | null;
}

export interface HeyReachDisplayStatus {
  key: HeyReachDisplayKey;
  label: string;
  emoji: string;
  /** Tailwind classes for a Badge. */
  className: string;
  /** Tailwind background class for the small status dot. */
  dotClass: string;
  /** Human explanation, shown in a tooltip / as the exclusion reason. */
  reason: string;
  /** Whether this contractor may be selected for a batch payment. */
  payable: boolean;
}

const ACTIVE: HeyReachDisplayStatus = {
  key: 'active', label: 'Active', emoji: '✅',
  className: 'bg-success/10 text-success',
  dotClass: 'bg-success',
  reason: 'Connected to HeyReach.',
  payable: true,
};

const DISCONNECTED: HeyReachDisplayStatus = {
  key: 'disconnected', label: 'Disconnected', emoji: '⚠️',
  className: 'bg-amber-500/10 text-amber-600',
  dotClass: 'bg-amber-500',
  reason: 'HeyReach can no longer connect to this account (login invalid).',
  payable: false,
};

const INACTIVE: HeyReachDisplayStatus = {
  key: 'inactive', label: 'Inactive', emoji: '⏸️',
  className: 'bg-muted text-muted-foreground',
  dotClass: 'bg-muted-foreground',
  reason: 'Manually deactivated by the team.',
  payable: false,
};

const PENDING = (reason: string): HeyReachDisplayStatus => ({
  key: 'pending', label: 'Pending', emoji: '🆕',
  className: 'bg-sky-500/10 text-sky-600',
  dotClass: 'bg-sky-500',
  reason,
  payable: true,
});

export function heyreachDisplayStatus(c: HeyReachContractorFields): HeyReachDisplayStatus {
  // Manual deactivation always wins.
  if (c.status === 'inactive') return INACTIVE;

  switch (c.heyreach_status) {
    case 'active':
      return ACTIVE;
    case 'disconnected':
      return DISCONNECTED;
    case 'unmatched':
      return PENDING(
        c.heyreach_email || c.linkedin_url
          ? 'No matching HeyReach account found — check the LinkedIn Email / URL on file.'
          : 'No LinkedIn Email or URL on file to match against HeyReach.',
      );
    default:
      // Synced result not recorded yet (sync not run, or no email/URL on file).
      return PENDING(
        c.heyreach_email || c.linkedin_url
          ? 'Not yet synced with HeyReach.'
          : 'No LinkedIn Email or URL on file yet.',
      );
  }
}

/** "Today 6:02am" style label for a last-sync timestamp. */
export function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` ${time}`;
}
