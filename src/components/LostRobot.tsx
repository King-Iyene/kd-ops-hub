/**
 * A small animated robot mascot for the 404 page — searching for a
 * signal it can't find, which is exactly the "lost in space" narrative
 * the page already tells. Built from plain shapes (no external assets,
 * no hand-authored path data) so it stays lightweight and themeable via
 * the same --tod-* time-of-day variables the rest of the unauthenticated
 * shell uses — the robot's eyes and antenna glow shift with the current
 * time of day exactly like everything else on the page.
 */
export function LostRobot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 132"
      className={className}
      role="img"
      aria-label="A small robot looking around for a signal"
    >
      <defs>
        <linearGradient id="kd-robot-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--tod-aurora-2) / 0.9)" />
          <stop offset="100%" stopColor="hsl(var(--tod-aurora-1) / 0.9)" />
        </linearGradient>
      </defs>

      <g className="kd-robot-bob">
        {/* Signal rings — searching for a connection, echoes the page's
            "lost in space" copy. */}
        <g className="kd-robot-signal">
          <circle cx="60" cy="10" r="4" fill="none" stroke="hsl(var(--tod-glow) / 0.5)" strokeWidth="1.5" />
        </g>
        <g className="kd-robot-signal kd-robot-signal-delay">
          <circle cx="60" cy="10" r="4" fill="none" stroke="hsl(var(--tod-glow) / 0.5)" strokeWidth="1.5" />
        </g>

        {/* Antenna */}
        <line x1="60" y1="26" x2="60" y2="12" stroke="hsl(var(--tod-glow) / 0.7)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="60" cy="10" r="3.5" fill="hsl(var(--kd-gold))" className="kd-robot-antenna-glow" />

        {/* Head */}
        <rect x="30" y="26" width="60" height="46" rx="16" fill="url(#kd-robot-head)" stroke="hsl(0 0% 100% / 0.25)" />

        {/* Eyes — blink via scaleY, transform-origin set per-eye */}
        <g className="kd-robot-blink" style={{ transformOrigin: '46px 49px' }}>
          <circle cx="46" cy="49" r="6" fill="hsl(0 0% 100% / 0.92)" />
          <circle cx="47.5" cy="47.5" r="2.2" fill="hsl(var(--tod-aurora-1))" />
        </g>
        <g className="kd-robot-blink" style={{ transformOrigin: '74px 49px' }}>
          <circle cx="74" cy="49" r="6" fill="hsl(0 0% 100% / 0.92)" />
          <circle cx="75.5" cy="47.5" r="2.2" fill="hsl(var(--tod-aurora-1))" />
        </g>

        {/* Little seam lines for detail */}
        <path d="M40 64 h40" stroke="hsl(0 0% 100% / 0.2)" strokeWidth="1.5" strokeLinecap="round" />

        {/* Body */}
        <rect x="38" y="76" width="44" height="34" rx="12" fill="hsl(var(--tod-aurora-1) / 0.55)" stroke="hsl(0 0% 100% / 0.18)" />
        <circle cx="60" cy="93" r="5" fill="hsl(var(--kd-gold) / 0.85)" />

        {/* Arms — slight outward angle, static (keeps the shape simple) */}
        <rect x="22" y="80" width="10" height="20" rx="5" fill="hsl(var(--tod-aurora-2) / 0.6)" />
        <rect x="88" y="80" width="10" height="20" rx="5" fill="hsl(var(--tod-aurora-2) / 0.6)" />
      </g>
    </svg>
  );
}
