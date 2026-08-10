/**
 * Shared full-page background shell for unauthenticated screens (Login,
 * 404 — any page rendered before/outside a real session). Consolidates
 * what used to be copy-pasted per-page: the deep-space gradient, the
 * square-grid texture (a nod to "KD Squares", not a generic hex/particle
 * pattern), and the ambient teal/gold glows.
 *
 * Extracting this fixed a real bug that had already silently duplicated
 * itself: `.kd-aurora`'s own CSS sets a *light* gradient background, and
 * each page tried to override it with an absolutely-positioned dark
 * gradient at `-z-10`. Without an explicit stacking context on the
 * wrapper, `position: relative` alone doesn't create one, so the dark
 * override could paint *behind* the parent's own light background
 * instead of replacing it — Login and NotFound both shipped with this
 * exact washed-out look. Fixing it once here, with `isolate` forcing the
 * stacking context, means any future unauthenticated page reuses the
 * correct version instead of copy-pasting the bug a third time.
 */
export function AuthAtmosphere({ children }: { children: React.ReactNode }) {
  return (
    <div className="kd-aurora min-h-screen flex items-center justify-center px-4 relative isolate overflow-hidden">
      {/* Base deep-space gradient — `isolate` above is what makes this
          reliably paint above .kd-aurora's own light-mode background. */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(201,100%,6%)] via-[hsl(200,100%,11%)] to-[hsl(186,100%,9%)] -z-10" />

      {/* Square-grid texture, tinted to the current time-of-day glow. */}
      <div className="pointer-events-none absolute inset-0 kd-square-grid" />

      {/* Primary ambient glow — time-of-day colour, centred behind content. */}
      <div
        className="pointer-events-none absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2 h-[460px] w-[460px] rounded-full blur-[120px] opacity-[0.25]"
        style={{ background: 'hsl(var(--tod-glow))' }}
      />
      {/* Secondary gold accent glow, offset — brings the third brand
          colour into the scene instead of a purely teal/cyan composition. */}
      <div className="pointer-events-none absolute right-[18%] bottom-[22%] h-[220px] w-[220px] rounded-full blur-[100px] opacity-[0.16] bg-[hsl(var(--kd-gold))]" />

      {children}
    </div>
  );
}
