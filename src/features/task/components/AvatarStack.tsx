import { TaskAvatar } from './TaskAvatar';

export function AvatarStack({
  people,
  size = 20,
  max = 3,
}: {
  people: { user_id: string; full_name: string; photo_url: string | null }[];
  size?: number;
  max?: number;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className="flex items-center -space-x-1.5 shrink-0">
      {shown.map((p) => (
        <TaskAvatar
          key={p.user_id}
          userId={p.user_id}
          name={p.full_name}
          photoUrl={p.photo_url}
          size={size}
          className="ring-2 ring-background"
        />
      ))}
      {overflow > 0 && (
        <div
          className="rounded-full flex items-center justify-center bg-muted text-muted-foreground font-semibold ring-2 ring-background"
          style={{ height: size, width: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
