import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Show subtle floating data particles. Default true. */
  particles?: boolean;
  /** Show scan-line accent. Default false. */
  scanLine?: boolean;
  /** Texture overlay — 'hex' (sci-fi) or 'dots' (subtle). Default 'hex'. */
  texture?: 'hex' | 'dots' | 'none';
}

/**
 * Living aurora hero surface — animated radial mesh that shifts colour with
 * the time of day, an optional sci-fi hex grid, drifting particles and scan
 * line. Place page heroes inside this and use `relative z-10` on content.
 */
export function AuroraHero({
  children,
  className,
  particles = true,
  scanLine = false,
  texture = 'hex',
}: Props) {
  return (
    <div className={cn('kd-aurora relative rounded-2xl text-white overflow-hidden', className)}>
      {/* Base gradient floor — brand teal, the canonical KD-Squares colour
          spread (deep teal → ocean → cyan-teal). The time-of-day variant
          is layered on top by the radial overlays inside `.kd-aurora`,
          so the hue still drifts amber→teal→violet→indigo across the day
          without the floor going near-black (which made the hero look
          off-brand on every screen). */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(201,100%,12%)] via-[hsl(200,100%,20%)] to-[hsl(186,100%,18%)] -z-10" />

      {/* Texture overlay */}
      {texture !== 'none' && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay',
            texture === 'hex' ? 'kd-hex-grid' : 'kd-dot-grid',
          )}
        />
      )}

      {/* Particles */}
      {particles && (
        <div className="kd-particles">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="kd-particle"
              style={{
                left: `${(i * 13 + 7) % 95}%`,
                animationDelay: `${i * 1.1}s`,
                animationDuration: `${7 + (i % 4)}s`,
                ['--drift-x' as any]: `${(i % 2 ? 1 : -1) * (10 + i * 3)}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* Scan line */}
      {scanLine && <div className="kd-scan-line" style={{ top: '0%' }} />}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
