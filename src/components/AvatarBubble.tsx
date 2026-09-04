import { useState } from 'react';
import { cn } from '@/lib/utils';

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
  const [imgFailed, setImgFailed] = useState(false);
  const fontSize = Math.max(11, Math.round(size * 0.34));

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className={cn('rounded-full object-cover', ringClass)}
        style={{ height: size, width: size }}
        onError={() => setImgFailed(true)}
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
