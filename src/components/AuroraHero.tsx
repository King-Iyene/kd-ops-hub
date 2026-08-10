import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
  particles?: boolean;
  scanLine?: boolean;
  texture?: 'hex' | 'dots' | 'none';
  /** Subtle, theme-aware background motif — decorative chrome only, sized
   *  and masked to stay behind the hero's own text/stats, never a full
   *  loud background. Pick per-module, not the same one everywhere:
   *  'grid' (ledger squares — ops/finance hubs), 'route' (dotted travel
   *  paths — Fleet), 'pulse' (a single live signal line — Approvals,
   *  anything "here's what's active right now"), 'constellation' (nodes
   *  + connections — CRM/people pages). Omit for a plain hero. */
  pattern?: 'grid' | 'route' | 'pulse' | 'constellation' | 'none';
}

export function AuroraHero({
  children,
  className,
  // kept for API compat, ignored
  particles: _p,
  scanLine: _s,
  texture: _t,
  pattern = 'none',
}: Props) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-border/60 bg-card p-5 sm:p-6 overflow-hidden',
        className,
      )}
    >
      {pattern !== 'none' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90 dark:opacity-80"
          style={{
            maskImage: 'radial-gradient(ellipse 95% 130% at 100% 0%, black 30%, transparent 90%)',
            WebkitMaskImage: 'radial-gradient(ellipse 95% 130% at 100% 0%, black 30%, transparent 90%)',
          }}
        >
          {pattern === 'grid' && <HeroGrid />}
          {pattern === 'route' && <HeroRoute />}
          {pattern === 'pulse' && <HeroPulse />}
          {pattern === 'constellation' && <HeroConstellation />}
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

function HeroGrid() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(hsl(var(--primary) / 0.32) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.32) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
      }}
    />
  );
}

function HeroRoute() {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <path
        d="M-10,170 C90,150 110,60 190,50 C270,40 290,120 410,100"
        fill="none"
        stroke="hsl(var(--primary) / 0.5)"
        strokeWidth="2"
        strokeDasharray="1 9"
        strokeLinecap="round"
      />
      <path
        d="M-10,40 C70,60 150,20 230,70 C310,120 350,90 410,130"
        fill="none"
        stroke="hsl(var(--accent) / 0.4)"
        strokeWidth="2"
        strokeDasharray="1 9"
        strokeLinecap="round"
      />
      <circle cx="190" cy="50" r="4" fill="hsl(var(--primary) / 0.6)" />
      <circle cx="410" cy="100" r="4" fill="hsl(var(--accent) / 0.6)" />
    </svg>
  );
}

function HeroPulse() {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <path
        d="M0,100 L70,100 L92,55 L114,145 L136,100 L410,100"
        fill="none"
        stroke="hsl(var(--accent) / 0.5)"
        strokeWidth="2"
      />
      <path d="M0,60 L410,60" stroke="hsl(var(--primary) / 0.14)" strokeWidth="1" strokeDasharray="4 6" />
      <path d="M0,140 L410,140" stroke="hsl(var(--primary) / 0.14)" strokeWidth="1" strokeDasharray="4 6" />
    </svg>
  );
}

function HeroConstellation() {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <g stroke="hsl(var(--primary) / 0.3)" strokeWidth="1">
        <line x1="70" y1="50" x2="150" y2="90" />
        <line x1="150" y1="90" x2="130" y2="150" />
        <line x1="150" y1="90" x2="230" y2="65" />
        <line x1="230" y1="65" x2="300" y2="105" />
        <line x1="230" y1="65" x2="270" y2="150" />
      </g>
      <g fill="hsl(var(--primary) / 0.55)">
        <circle cx="70" cy="50" r="3" />
        <circle cx="150" cy="90" r="4" />
        <circle cx="130" cy="150" r="2.5" />
        <circle cx="230" cy="65" r="3.5" />
        <circle cx="300" cy="105" r="2.5" />
      </g>
      <circle cx="270" cy="150" r="3" fill="hsl(var(--accent) / 0.6)" />
    </svg>
  );
}
