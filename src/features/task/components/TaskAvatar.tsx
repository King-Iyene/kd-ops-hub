import { useState } from 'react';
import { cn } from '@/lib/utils';
import { avatarTintFor } from '../theme/taskTheme';
import { initials } from '../lib/format';

/**
 * Circle avatar for the Task module: photo when available, otherwise
 * initials on a tint chosen by a stable hash of the user id (section 5.6).
 * A thin wrapper around the same photo-or-initials pattern as the app-wide
 * AvatarBubble, kept separate only because that component's fallback uses
 * one fixed brand gradient rather than a per-person tint.
 */
export function TaskAvatar({
  userId,
  name,
  photoUrl,
  size = 24,
  className,
}: {
  userId: string;
  name: string | null | undefined;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const fontSize = Math.max(9, Math.round(size * 0.4));

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className={cn('rounded-full object-cover shrink-0', className)}
        style={{ height: size, width: size }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={cn('rounded-full flex items-center justify-center shrink-0', className)}
      style={{ height: size, width: size, backgroundColor: avatarTintFor(userId) }}
    >
      <span className="font-semibold text-white" style={{ fontSize }}>
        {initials(name)}
      </span>
    </div>
  );
}
