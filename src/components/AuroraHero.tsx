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
  /** Optional glowing brand badge content (e.g. "KD") rendered top-left. */
  brand?: React.ReactNode;
}

/**
 * Living aurora hero surface — animated radial mesh that shifts colour with
 * the time of day, an optional sci-fi hex grid, drifting particles and scan
 * line. Place page heroes inside this and use `relative z-10` on content.
 *
 * Mirrors the login-screen aesthetic: deep teal/violet gradient floor,
 * brand-coloured radial wash, glowing brand badge if `brand` is set.
 */
export function AuroraHero({
  children,
  className,
  particles = true,
  scanLine = false,
  texture = 'hex',
  brand,
}: Props) {
  return (
    <div className={cn('kd-aurora relative rounded-2xl text-white overflow-hidden border border-white/10', className)}>
      {/* Base gradient floor — deeper, more vivid than before. Mirrors the
          login-screen feel of "deep space with brand wash". */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[hsl(201,100%,8%)] via-[hsl(220,80%,15%)] to-[hsl(186,100%,12%)]" />

      {/* Brand-tinted radial wash on top of the floor — adds depth and pops
          the brand colour through. */}
      <div className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 0% 0%, hsl(var(--tod-aurora-1) / 0.45) 0%, transparent 55%),' +
            'radial-gradient(ellipse 60% 50% at 100% 0%, hsl(var(--tod-aurora-2) / 0.40) 0%, transparent 55%),' +
            'radial-gradient(ellipse 50% 40% at 50% 100%, hsl(var(--tod-aurora-3) / 0.35) 0%, transparent 60%)',
        }}
      />

      {/* Texture overlay */}
      {texture !== 'none' && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay',
            texture === 'hex' ? 'kd-hex-grid' : 'kd-dot-grid',
          )}
        />
      )}

      {/* Particles */}
      {particles && (
        <div className="kd-particles">
          {Array.from({ length: 10 }).map((_, i) => (
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

      {/* Top-edge gradient highlight — that "powered" feel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      {/* Optional glowing brand badge */}
      {brand && (
        <div className="absolute top-5 right-5 z-10">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--tod-glow))] blur-xl opacity-50 kd-icon-glow" />
            <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl">
              <span className="kd-display text-base font-bold text-white tracking-tight">{brand}</span>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
