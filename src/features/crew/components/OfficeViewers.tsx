import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useCrewSettings, useSetOfficeViewers } from '../useCrew';

/**
 * Who can see the AI executives in the Office. By default only you. Tick a person to let them see the executives and ask them questions (they can never
 * approve, order or change anything, and cannot read the briefs). The rule is enforced in the database, so everyone else simply gets an empty office.
 */
export function OfficeViewers() {
  const { toast } = useToast();
  const me = useAuthStore((s) => s.profile?.id ?? null);
  const settings = useCrewSettings();
  const save = useSetOfficeViewers();
  const [q, setQ] = useState('');
  const people = useQuery({
    queryKey: ['crew', 'people'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').eq('status', 'active').order('full_name');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });
  const allowed = useMemo(() => new Set(settings.data?.office_viewers ?? []), [settings.data]);
  const isOwner = !!me && settings.data?.owner_profile_id === me;
  const list = (people.data ?? []).filter((p) => p.id !== settings.data?.owner_profile_id && (p.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id: string) => {
    const next = new Set(allowed);
    if (next.has(id)) next.delete(id); else next.add(id);
    save.mutate([...next], { onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }) });
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Who can see the executives in the Office</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {allowed.size === 0 ? 'Only you, so nobody is distracted.' : `You, and ${allowed.size} ${allowed.size === 1 ? 'person' : 'people'} you chose.`}
          {isOwner ? '' : ' Only the owner can change this.'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          They can see the agents and ask them questions. They can never approve, order or change anything. Agents are told not to share private finance details with them, but treat this as trust: only add people you trust. You can read every conversation in the Crew panel.
        </p>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" className="h-8 text-sm" />
      <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
        {list.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
              <input type="checkbox" checked={allowed.has(p.id)} disabled={!isOwner || save.isPending} onChange={() => toggle(p.id)} />
              <span className="truncate">{p.full_name ?? 'Unnamed'}</span>
            </label>
          </li>
        ))}
        {list.length === 0 ? <li className="px-2 py-2 text-xs text-muted-foreground">No one matches.</li> : null}
      </ul>
    </div>
  );
}
