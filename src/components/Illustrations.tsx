/**
 * Animated SVG illustrations for empty states. Each is ~140×140, uses
 * the active TOD glow colour via hsl(var(--tod-glow)), and degrades
 * gracefully under prefers-reduced-motion (animations stop).
 */

const TOD = 'hsl(var(--tod-glow))';
const MUTED = 'hsl(var(--muted-foreground) / 0.5)';

export function SatelliteFloat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="No data">
      {/* orbit ring */}
      <ellipse cx="70" cy="80" rx="55" ry="14" stroke={MUTED} strokeWidth="1" strokeDasharray="2 4" />
      {/* halo */}
      <circle cx="70" cy="65" r="40" fill={TOD} opacity="0.08" className="kd-animate-float" />
      {/* satellite body */}
      <g className="kd-animate-float">
        <rect x="58" y="56" width="24" height="20" rx="3" fill={TOD} opacity="0.9" />
        <rect x="60" y="60" width="20" height="4" rx="1" fill="white" opacity="0.4" />
        <rect x="60" y="68" width="14" height="3" rx="1" fill="white" opacity="0.3" />
        {/* solar wings */}
        <rect x="38" y="60" width="18" height="12" rx="1.5" fill="hsl(var(--tod-aurora-1))" opacity="0.7" />
        <rect x="84" y="60" width="18" height="12" rx="1.5" fill="hsl(var(--tod-aurora-1))" opacity="0.7" />
        <line x1="42" y1="60" x2="42" y2="72" stroke="white" strokeOpacity="0.3" />
        <line x1="48" y1="60" x2="48" y2="72" stroke="white" strokeOpacity="0.3" />
        <line x1="92" y1="60" x2="92" y2="72" stroke="white" strokeOpacity="0.3" />
        <line x1="98" y1="60" x2="98" y2="72" stroke="white" strokeOpacity="0.3" />
        {/* dish */}
        <path d="M70 56 L66 48 L74 48 Z" fill={TOD} opacity="0.95" />
        <circle cx="70" cy="46" r="2" fill="white" />
      </g>
      {/* signal arcs */}
      <path d="M76 42 Q82 36 90 38" stroke={TOD} strokeWidth="1.5" fill="none" opacity="0.6">
        <animate attributeName="opacity" values="0.2;0.8;0.2" dur="2s" repeatCount="indefinite" />
      </path>
      <path d="M76 38 Q88 28 102 32" stroke={TOD} strokeWidth="1.5" fill="none" opacity="0.4">
        <animate attributeName="opacity" values="0.1;0.6;0.1" dur="2s" begin="0.4s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

export function CoinDrift({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="No transactions">
      {/* halo */}
      <circle cx="70" cy="70" r="44" fill={TOD} opacity="0.08" />
      {/* back coins */}
      <g opacity="0.5">
        <ellipse cx="46" cy="52" rx="14" ry="6" fill="hsl(var(--accent))" className="kd-animate-float" />
        <ellipse cx="98" cy="92" rx="14" ry="6" fill="hsl(var(--accent))" />
      </g>
      {/* main coin */}
      <g className="kd-animate-float">
        <ellipse cx="70" cy="72" rx="28" ry="28" fill="hsl(var(--accent))" />
        <ellipse cx="70" cy="68" rx="28" ry="28" fill="hsl(41 80% 65%)" />
        <text x="70" y="75" textAnchor="middle" fontFamily="Cabin Condensed, Cabin" fontWeight="800" fontSize="22" fill="hsl(41 60% 30%)">₦</text>
      </g>
      {/* sparkle */}
      <g>
        <circle cx="98" cy="44" r="1.5" fill={TOD}>
          <animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <circle cx="34" cy="92" r="1.5" fill={TOD}>
          <animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="0.8s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

export function GhostTerminal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="No users">
      <circle cx="70" cy="70" r="44" fill={TOD} opacity="0.08" />
      {/* ghost */}
      <g className="kd-animate-float">
        <path d="M48 60 Q48 38 70 38 Q92 38 92 60 V92 L84 86 L78 92 L70 86 L62 92 L56 86 L48 92 Z"
          fill="white" stroke={MUTED} strokeWidth="1.2" />
        {/* eyes */}
        <ellipse cx="62" cy="60" rx="2.5" ry="3.5" fill={TOD} />
        <ellipse cx="78" cy="60" rx="2.5" ry="3.5" fill={TOD} />
        {/* mouth */}
        <path d="M64 72 Q70 76 76 72" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </g>
      {/* "no users" hint dots */}
      <circle cx="34" cy="48" r="2" fill={MUTED} opacity="0.4" />
      <circle cx="106" cy="48" r="2" fill={MUTED} opacity="0.4" />
    </svg>
  );
}

export function PaperPlanes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nothing pending">
      <circle cx="70" cy="70" r="44" fill={TOD} opacity="0.08" />
      {/* trail */}
      <path d="M22 100 Q44 70 70 60" stroke={TOD} strokeWidth="1.2" strokeDasharray="3 3" fill="none" opacity="0.6" />
      {/* plane */}
      <g className="kd-animate-float">
        <path d="M52 84 L96 56 L80 86 L72 76 Z" fill={TOD} opacity="0.95" />
        <path d="M72 76 L96 56 L80 86 Z" fill="hsl(var(--tod-aurora-1))" opacity="0.7" />
      </g>
      {/* small back plane */}
      <path d="M30 96 L48 84 L42 100 L38 95 Z" fill={MUTED} opacity="0.4" />
    </svg>
  );
}

export function RadarSweep({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="No approvals">
      <circle cx="70" cy="70" r="48" fill={TOD} opacity="0.06" />
      {/* radar rings */}
      <circle cx="70" cy="70" r="40" stroke={MUTED} strokeWidth="1" opacity="0.4" />
      <circle cx="70" cy="70" r="28" stroke={MUTED} strokeWidth="1" opacity="0.5" />
      <circle cx="70" cy="70" r="16" stroke={MUTED} strokeWidth="1" opacity="0.6" />
      <circle cx="70" cy="70" r="3" fill={TOD} />
      {/* sweep wedge */}
      <g style={{ transformOrigin: '70px 70px' }}>
        <path d="M70 70 L70 30 A40 40 0 0 1 105 50 Z" fill={TOD} opacity="0.25">
          <animateTransform attributeName="transform" type="rotate" from="0 70 70" to="360 70 70" dur="3.6s" repeatCount="indefinite" />
        </path>
      </g>
      {/* one stray blip */}
      <circle cx="92" cy="58" r="2" fill={TOD}>
        <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export type IllustrationKind = 'satellite' | 'coin' | 'ghost' | 'plane' | 'radar';

export function Illustration({ kind, className }: { kind: IllustrationKind; className?: string }) {
  switch (kind) {
    case 'satellite': return <SatelliteFloat className={className} />;
    case 'coin':      return <CoinDrift className={className} />;
    case 'ghost':     return <GhostTerminal className={className} />;
    case 'plane':     return <PaperPlanes className={className} />;
    case 'radar':     return <RadarSweep className={className} />;
  }
}
