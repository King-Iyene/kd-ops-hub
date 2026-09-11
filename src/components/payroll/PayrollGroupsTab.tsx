import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users, UserPlus, UserMinus, Pencil, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { formatNaira } from '@/lib/format';
import { displayName } from '@/lib/name';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { PENSION_EMPLOYEE_RATE } from '@/lib/tax';

interface Member {
  id: string;
  name: string;
  photo_url: string | null;
  basic_ngn: number;
  housing_ngn: number;
  transport_ngn: number;
  other_allowances_ngn: number;
  salary_ngn: number;
  use_salary_components: boolean;
  pension_enabled: boolean;
}

interface GroupCard {
  id: string;
  name: string;
  description: string | null;
  frequency: string | null;
  anchorDay: number | null;
  members: Member[];
  monthlyCost: number;
  housing: number;
  transport: number;
  other: number;
  pension: number;
}

const PENSION_RATE = PENSION_EMPLOYEE_RATE;

/**
 * Pay groups view — cards per pay_groups row, aggregating real member data
 * from `profiles` (salary/allowance components) rather than any fabricated
 * numbers. Cadence and anchor day come from the group's linked pay_schedule.
 */
export function PayrollGroupsTab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editGroup, setEditGroup] = useState<GroupCard | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [groupsRes, membersRes] = await Promise.all([
        supabase
          .from('pay_groups')
          .select('id, name, description, is_active, pay_schedule:pay_schedules(frequency, anchor_day)')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, photo_url, pay_group_id, salary_ngn, basic_ngn, housing_ngn, transport_ngn, other_allowances_ngn, use_salary_components, pension_enabled')
          .eq('status', 'active')
          .not('pay_group_id', 'is', null),
      ]);
      if (cancelled) return;
      if (groupsRes.error) { setError(groupsRes.error.message); return; }

      const membersByGroup = new Map<string, Member[]>();
      for (const r of (membersRes.data || []) as any[]) {
        const list = membersByGroup.get(r.pay_group_id) || [];
        list.push({
          id: r.id,
          name: displayName(r.first_name, r.last_name, r.full_name || r.email),
          photo_url: r.photo_url || null,
          basic_ngn: Number(r.basic_ngn || 0),
          housing_ngn: Number(r.housing_ngn || 0),
          transport_ngn: Number(r.transport_ngn || 0),
          other_allowances_ngn: Number(r.other_allowances_ngn || 0),
          salary_ngn: Number(r.salary_ngn || 0),
          use_salary_components: !!r.use_salary_components,
          pension_enabled: r.pension_enabled !== false,
        });
        membersByGroup.set(r.pay_group_id, list);
      }

      const cards: GroupCard[] = ((groupsRes.data || []) as any[]).map((g) => {
        const members = membersByGroup.get(g.id) || [];
        const monthlyCost = members.reduce((s, m) => s + (m.use_salary_components
          ? m.basic_ngn + m.housing_ngn + m.transport_ngn + m.other_allowances_ngn
          : m.salary_ngn), 0);
        const housing = members.reduce((s, m) => s + m.housing_ngn, 0);
        const transport = members.reduce((s, m) => s + m.transport_ngn, 0);
        const other = members.reduce((s, m) => s + m.other_allowances_ngn, 0);
        const pension = members.reduce((s, m) => {
          if (!m.pension_enabled) return s;
          const base = m.use_salary_components ? m.basic_ngn + m.housing_ngn + m.transport_ngn : m.salary_ngn;
          return s + base * PENSION_RATE;
        }, 0);
        return {
          id: g.id,
          name: g.name,
          description: g.description ?? null,
          frequency: g.pay_schedule?.frequency ?? null,
          anchorDay: g.pay_schedule?.anchor_day ?? null,
          members,
          monthlyCost,
          housing,
          transport,
          other,
          pension,
        };
      });
      setGroups(cards);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (error) {
    return <EmptyState title="Could not load pay groups" description={error} />;
  }

  if (groups === null) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}><CardContent className="p-5 space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </CardContent></Card>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No pay groups yet"
        description="Pay groups are created and edited from the Setup tab — they let you assign employees to different cadences (e.g. Administrative, Non-administrative) and see cost/allowance breakdowns per group here."
      />
    );
  }

  return (
    <>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{g.name}</p>
                <Badge variant="outline" className="text-3xs capitalize font-medium">
                  {g.frequency ? g.frequency.replace('_', ' ') : 'No schedule'}
                </Badge>
              </div>
              {g.description && (
                <p className="text-2xs text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>
              )}
            </div>

            <div>
              <p className="text-2xl font-bold tabular-nums">{formatNaira(g.monthlyCost)}</p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                per month · {g.members.length} member{g.members.length === 1 ? '' : 's'}
                {g.anchorDay != null && g.anchorDay !== 99 && ` · pays on the ${ordinal(g.anchorDay)}`}
                {g.anchorDay === 99 && ' · pays last working day'}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <AllowanceChip label="Housing" value={g.housing} color="hsl(200,80%,45%)" />
              <AllowanceChip label="Transport" value={g.transport} color="hsl(150,60%,38%)" />
              <AllowanceChip label="Other" value={g.other} color="hsl(35,90%,45%)" />
              <AllowanceChip label="Pension" value={g.pension} color="hsl(270,55%,50%)" />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex -space-x-2">
                {g.members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} className="h-7 w-7 border-2 border-background">
                    {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                    <AvatarFallback className="text-3xs font-semibold bg-[hsl(200,60%,92%)] text-[hsl(200,90%,25%)]">
                      {initials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {g.members.length > 5 && (
                  <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-3xs font-semibold text-muted-foreground">
                    +{g.members.length - 5}
                  </div>
                )}
                {g.members.length === 0 && (
                  <span className="text-2xs text-muted-foreground inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> No members yet
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setEditGroup(g)}
                >
                  <Pencil className="h-3 w-3" /> Edit members
                </Button>
                <button
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                  onClick={() => navigate(`/employees?pay_group_id=${g.id}`)}
                >
                  Manage members <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    {editGroup && (
      <ManageMembersDialog
        group={editGroup}
        onClose={() => setEditGroup(null)}
        onSaved={() => { setEditGroup(null); reload(); }}
        toast={toast}
      />
    )}
    </>
  );
}

/* ─── Manage Members Dialog ─────────────────────────────────────────── */

interface AvailableEmployee {
  id: string;
  name: string;
  photo_url: string | null;
  pay_group_id: string | null;
  current_group_name: string | null;
}

function ManageMembersDialog({
  group,
  onClose,
  onSaved,
  toast,
}: {
  group: GroupCard;
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const [search, setSearch] = useState('');
  const [available, setAvailable] = useState<AvailableEmployee[]>([]);
  const [currentMembers, setCurrentMembers] = useState<Member[]>(group.members);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, photo_url, pay_group_id, pay_groups:pay_group_id(name)')
        .eq('status', 'active')
        .order('full_name');
      const employees: AvailableEmployee[] = ((data || []) as any[]).map((e) => ({
        id: e.id,
        name: displayName(e.first_name, e.last_name, e.full_name || e.email),
        photo_url: e.photo_url || null,
        pay_group_id: e.pay_group_id,
        current_group_name: e.pay_groups?.name || null,
      }));
      setAvailable(employees);
      setLoading(false);
    })();
  }, []);

  const memberIds = new Set(currentMembers.map((m) => m.id));

  const filtered = available.filter((e) => {
    if (memberIds.has(e.id)) return false;
    if (!search.trim()) return true;
    return e.name.toLowerCase().includes(search.toLowerCase());
  });

  const addMember = async (emp: AvailableEmployee) => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ pay_group_id: group.id }).eq('id', emp.id);
    if (error) {
      toast({ title: 'Failed to add member', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    setCurrentMembers((prev) => [...prev, { id: emp.id, name: emp.name, photo_url: emp.photo_url, basic_ngn: 0, housing_ngn: 0, transport_ngn: 0, other_allowances_ngn: 0, salary_ngn: 0, use_salary_components: false, pension_enabled: true }]);
    toast({ title: `${emp.name} added to ${group.name}` });
    setSaving(false);
  };

  const removeMember = async (member: Member) => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ pay_group_id: null }).eq('id', member.id);
    if (error) {
      toast({ title: 'Failed to remove member', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    setCurrentMembers((prev) => prev.filter((m) => m.id !== member.id));
    toast({ title: `${member.name} removed from ${group.name}` });
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) { onSaved(); } }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit members — {group.name}</DialogTitle>
          <DialogDescription>Add or remove employees from this pay group.</DialogDescription>
        </DialogHeader>

        {/* Current members */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Current members ({currentMembers.length})
          </p>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {currentMembers.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No members in this group.</p>
            )}
            {currentMembers.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-6 w-6">
                    {m.photo_url && <AvatarImage src={m.photo_url} alt={m.name} />}
                    <AvatarFallback className="text-3xs">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate">{m.name}</span>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  disabled={saving}
                  onClick={() => removeMember(m)}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Add employees */}
        <div className="space-y-2 flex-1 min-h-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Add employees
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search employees…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {loading ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Loading employees…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {search ? 'No matching employees' : 'All employees are already in a group'}
              </p>
            ) : (
              filtered.slice(0, 50).map((emp) => (
                <div key={emp.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-6 w-6">
                      {emp.photo_url && <AvatarImage src={emp.photo_url} alt={emp.name} />}
                      <AvatarFallback className="text-3xs">{initials(emp.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <span className="text-sm truncate block">{emp.name}</span>
                      {emp.current_group_name && (
                        <span className="text-2xs text-muted-foreground">Currently in {emp.current_group_name}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-primary hover:text-primary hover:bg-primary/10 shrink-0"
                    disabled={saving}
                    onClick={() => addMember(emp)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function AllowanceChip({ label, value, color }: { label: string; value: number; color: string }) {
  if (value <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {label} · {formatNaira(value)}
    </span>
  );
}
