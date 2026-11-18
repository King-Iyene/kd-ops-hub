export function StatusDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={className ?? 'h-2 w-2 rounded-full shrink-0 inline-block'}
      style={{ backgroundColor: color }}
    />
  );
}
