import { useEffect, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { startImpersonation } from '@/lib/impersonation';
import { AvatarBubble } from '@/components/AvatarBubble';
import { roleLabel, roleBadgeClass } from '@/lib/roles';
import type { UserRole } from '@/store/authStore';
import { cn } from '@/lib/utils';

interface DirectoryPerson {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  job_title: string | null;
  photo_url: string | null;
}

// Same order the "View As" role switcher uses, so the two features read
// as one consistent hierarchy.
const ROLE_ORDER: UserRole[] = ['super_admin', 'admin', 'finance', 'operations', 'field_staff'];

export function ImpersonateUserDialog({
  open,
  onOpenChange,
  excludeUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeUserId?: string;
}) {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('profiles_directory')
      .select('id, full_name, email, role, job_title, photo_url')
      .eq('status', 'active')
      .order('full_name')
      .limit(500)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          toast({ title: 'Could not load people', description: error.message, variant: 'destructive' });
          return;
        }
        setPeople(((data as DirectoryPerson[]) || []).filter((p) => p.id !== excludeUserId));
      });
  }, [open, excludeUserId, toast]);

  const groups = useMemo(() => {
    const byRole = new Map<UserRole, DirectoryPerson[]>();
    for (const p of people) {
      const list = byRole.get(p.role) || [];
      list.push(p);
      byRole.set(p.role, list);
    }
    return ROLE_ORDER
      .map((role) => ({ role, people: byRole.get(role) || [] }))
      .filter((g) => g.people.length > 0);
  }, [people]);

  const handlePick = async (person: DirectoryPerson) => {
    setStarting(person.id);
    try {
      await startImpersonation(person.id, person.full_name || person.email);
      // Reloads the page on success — nothing more to do here.
    } catch (err) {
      setStarting(null);
      toast({
        title: 'Could not log in as this user',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search people by name or email…" />
      <CommandList>
        <CommandEmpty>{loading ? 'Loading…' : 'No one found.'}</CommandEmpty>
        {groups.map((group, idx) => (
          <div key={group.role}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={roleLabel(group.role)}>
              {group.people.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.full_name} ${p.email}`}
                  onSelect={() => handlePick(p)}
                  disabled={starting !== null}
                  className="flex items-center gap-3 py-2"
                >
                  <AvatarBubble
                    photoUrl={p.photo_url}
                    initials={initialsOf(p.full_name, p.email)}
                    size={30}
                    ringClass={cn('ring-2', roleRingClass(p.role))}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.full_name || p.email}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.job_title || p.email}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('shrink-0 text-[10px] font-semibold', roleBadgeClass(p.role))}>
                    {roleLabel(p.role)}
                  </Badge>
                  {starting === p.id && <span className="text-xs text-muted-foreground shrink-0">Signing in…</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

function roleRingClass(role: UserRole): string {
  switch (role) {
    case 'super_admin': return 'ring-[#D6AC50]/50';
    case 'admin': return 'ring-info/40';
    case 'finance': return 'ring-success/40';
    case 'operations': return 'ring-purple-400/50';
    default: return 'ring-border';
  }
}

function initialsOf(fullName?: string | null, email?: string | null): string {
  const source = fullName?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
