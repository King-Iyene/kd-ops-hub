import { useNavigate } from 'react-router-dom';
import {
  User as UserIcon,
  LogOut,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export function ProfileDropdown() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const viewAs = useAuthStore((s) => s.viewAsRole);
  const setViewAsRole = useAuthStore((s) => s.setViewAsRole);
  const signOut = useAuthStore((s) => s.signOut);

  const isSuperAdmin = profile?.role === 'super_admin';
  const initials = initialsOf(profile?.full_name, profile?.email);
  const currentRole = profile?.role || 'field_staff';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full kd-transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Open profile menu"
        >
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center ring-2 ring-transparent hover:ring-primary/20 kd-transition">
            <span className="text-sm font-bold text-primary-foreground">
              {initials}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary-foreground">
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

        {isSuperAdmin && (
          <>
            <div className="px-2 py-2 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1">
                <Eye className="h-3.5 w-3.5" />
                View As
              </div>
              <Select
                value={viewAs || 'super_admin'}
                onValueChange={(v) =>
                  setViewAsRole(v === 'super_admin' ? null : (v as UserRole))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIMULATABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full inline-block',
                            r === 'super_admin' && 'bg-accent',
                            r === 'admin' && 'bg-info',
                            r === 'finance' && 'bg-success',
                            r === 'operations' && 'bg-purple-500',
                            r === 'field_staff' && 'bg-muted-foreground',
                          )}
                        />
                        {roleLabel(r)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground px-1">
                View-only simulation — your real role is unchanged.
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
