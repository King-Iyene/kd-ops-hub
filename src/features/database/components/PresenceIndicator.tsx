import { useAuthStore } from '@/store/authStore';

interface PresenceUser {
  id: string;
  name: string;
  color: string;
  initials: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const PRESENCE_COLORS = ['#166EE1', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'];

export function PresenceIndicator() {
  const profile = useAuthStore((s) => s.profile);

  const users: PresenceUser[] = [];
  if (profile) {
    users.push({
      id: profile.id ?? 'me',
      name: profile.full_name ?? 'You',
      color: PRESENCE_COLORS[0],
      initials: getInitials(profile.full_name ?? 'You'),
    });
  }

  const visible = users.slice(0, 3);
  const overflow = Math.max(0, users.length - 3);

  if (visible.length === 0) return null;

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((u) => (
        <div key={u.id} className="relative group">
          <div
            className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white dark:border-[hsl(200,30%,8%)] cursor-default"
            style={{ backgroundColor: u.color }}
          >
            {u.initials}
          </div>
          {/* Online dot */}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#22C55E] border-2 border-white dark:border-[hsl(200,30%,8%)]" />
          {/* Tooltip */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-[#1F2937] text-white text-[11px] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
            <span className="font-medium">{u.name}</span>
            <span className="text-[#9CA3AF] ml-1">Online now</span>
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div className="h-6 w-6 rounded-full bg-[#E5E7EB] dark:bg-[hsl(200,25%,25%)] flex items-center justify-center text-[9px] font-semibold text-[#6A7184] border-2 border-white dark:border-[hsl(200,30%,8%)]">
          +{overflow}
        </div>
      )}
    </div>
  );
}
