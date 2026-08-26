import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { formatNaira } from '@/lib/format';
import { displayName } from '@/lib/name';
import { EmptyState } from '@/components/ui-kit/EmptyState';
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
  const [groups, setGroups] = useState<GroupCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{g.name}</p>
                <Badge variant="outline" className="text-[10px] capitalize font-medium">
                  {g.frequency ? g.frequency.replace('_', ' ') : 'No schedule'}
                </Badge>
              </div>
              {g.description && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>
              )}
            </div>

            <div>
              <p className="text-2xl font-bold tabular-nums">{formatNaira(g.monthlyCost)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
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
                    <AvatarFallback className="text-[9.5px] font-semibold bg-[hsl(200,60%,92%)] text-[hsl(200,90%,25%)]">
                      {initials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {g.members.length > 5 && (
                  <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[9.5px] font-semibold text-muted-foreground">
                    +{g.members.length - 5}
                  </div>
                )}
                {g.members.length === 0 && (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> No members yet
                  </span>
                )}
              </div>
              <button
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                onClick={() => navigate(`/employees?pay_group_id=${g.id}`)}
              >
                Manage members <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
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
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {label} · {formatNaira(value)}
    </span>
  );
}
