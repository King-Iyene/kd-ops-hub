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
      {/* Base gradient floor — uses time-of-day variables so the background
          actually shifts colour with the hour. Without this, only the
          radial overlays were TOD-aware and the morning/evening change was
          easy to miss on mobile where the overlay opacity reads softer. */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(135deg, hsl(var(--tod-aurora-3) / 0.85) 0%, hsl(var(--tod-aurora-1) / 0.55) 50%, hsl(var(--tod-aurora-2) / 0.40) 100%), #0b1220',
          backgroundBlendMode: 'multiply, normal',
        }}
      />

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
