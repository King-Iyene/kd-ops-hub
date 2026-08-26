import { cn } from '@/lib/utils';

// Reusable avatar bubble. Renders the user's uploaded photo when
// available, otherwise the initials on the brand gradient — same source
// of truth as the Sidebar header so the platform agrees on what the user
// looks like.
export function AvatarBubble({
  photoUrl,
  initials,
  size,
  ringClass = '',
}: {
  photoUrl: string | null;
  initials: string;
  size: number;
  ringClass?: string;
}) {
  const fontSize = Math.max(11, Math.round(size * 0.34));
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className={cn('rounded-full object-cover', ringClass)}
        style={{ height: size, width: size }}
        onError={(e) => {
          // Storage object got revoked / 403 — fall back to initials.
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return (
    <div
      className={cn('rounded-full kd-gradient-brand flex items-center justify-center', ringClass)}
      style={{ height: size, width: size }}
    >
      <span className="font-bold text-white" style={{ fontSize }}>
        {initials}
      </span>
    </div>
  );
}
