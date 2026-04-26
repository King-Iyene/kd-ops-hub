import { useNavigate } from 'react-router-dom';
import {
  User as UserIcon,
  LogOut,
  Eye,
  ChevronDown,
  Sun,
  Sunrise,
  Sunset,
  Moon,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTimeOfDay, greetingFor, type TimeOfDay } from '@/hooks/useTimeOfDay';
import {
  roleBadgeClass,
  roleLabel,
  SIMULATABLE_ROLES,
} from '@/lib/roles';
import type { UserRole } from '@/store/authStore';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** First-letter initials from a full name, up to 2 characters. */
const initialsOf = (name?: string | null, email?: string | null): string => {
  const source = (name || email || '').trim();
  if (!source) return 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return source.charAt(0).toUpperCase();
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase() || 'U';
};

const ROLE_DOT: Record<string, string> = {
  super_admin: 'bg-[#D6AC50]',
  admin: 'bg-info',
  finance: 'bg-success',
  operations: 'bg-purple-500',
  field_staff: 'bg-muted-foreground',
};

const TOD_ICON: Record<TimeOfDay, typeof Sun> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
};

export function ProfileDropdown() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const viewAs = useAuthStore((s) => s.viewAsRole);
  const setViewAsRole = useAuthStore((s) => s.setViewAsRole);
  const signOut = useAuthStore((s) => s.signOut);
  const tod = useTimeOfDay();
  const TodIcon = TOD_ICON[tod];
  const firstName = profile?.full_name?.split(' ')[0] || '';

  const isSuperAdmin = profile?.role === 'super_admin';
  const initials = initialsOf(profile?.full_name, profile?.email);
  const currentRole = profile?.role || 'field_staff';
  // Active simulation defaults to the user's own role when nothing is set.
  const activeSim: UserRole =
    (viewAs as UserRole) || (currentRole as UserRole);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const pickRole = (role: UserRole) => {
    if (role === 'super_admin') setViewAsRole(null);
    else setViewAsRole(role);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full kd-transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Open profile menu"
        >
          <div className="h-8 w-8 rounded-full kd-gradient-brand flex items-center justify-center ring-2 ring-transparent hover:ring-primary/20 kd-transition shadow-sm">
            <span className="text-sm font-bold text-white">
              {initials}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* Header: name, email, role badge */}
        <DropdownMenuLabel className="py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full kd-gradient-brand flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-sm font-bold text-white">
                {initials}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {profile?.full_name || '—'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.email || ''}
              </p>
            </div>
          </div>
          {/* Time-of-day greeting strip */}
          <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
            <TodIcon className="h-3.5 w-3.5 kd-tod-text" />
            <span className="text-[11px] text-muted-foreground">
              {greetingFor(tod)}{firstName ? `, ${firstName}` : ''}.
            </span>
          </div>
          <div className="mt-3">
            <Badge
              variant="outline"
              className={cn('font-medium', roleBadgeClass(currentRole))}
            >
              {roleLabel(currentRole)}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Role Switcher: Super Admin only — five clickable buttons */}
        {isSuperAdmin && (
          <>
            <div className="px-2 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground px-1 mb-2">
                <Eye className="h-3.5 w-3.5" />
                View As
              </div>
              <div className="grid grid-cols-1 gap-1">
                {SIMULATABLE_ROLES.map((r) => {
                  const active = activeSim === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => pickRole(r)}
                      className={cn(
                        'group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm kd-transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                        active
                          ? 'bg-[#D6AC50]/15 text-[#3a2e12] font-semibold ring-1 ring-[#D6AC50]/40'
                          : 'hover:bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full inline-block shrink-0',
                          ROLE_DOT[r] || 'bg-muted-foreground',
                        )}
                      />
                      <span className="flex-1 text-left">{roleLabel(r)}</span>
                      {active && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#3a2e12]/80">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground px-1 mt-2">
                View-only simulation — your real role is never changed.
              </p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem
          onClick={() => navigate('/profile')}
          className="cursor-pointer"
        >
          <UserIcon className="mr-2 h-4 w-4" /> My Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
