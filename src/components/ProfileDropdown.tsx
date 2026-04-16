import { useNavigate } from 'react-router-dom';
import { User as UserIcon, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

/**
 * Minimal profile menu — full name, email, My Profile and Sign Out.
 * Role simulation and role badge were removed along with RoleGuard.
 */
export function ProfileDropdown() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const initials = initialsOf(profile?.full_name, profile?.email);

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
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

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
