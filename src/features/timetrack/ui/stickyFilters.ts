/**
 * The date / people filter bar of a Time Track page stays in view while the page scrolls, so the day or the person can be
 * changed without scrolling back up. Put it on the bar's outer element. The bar keeps the page colour (a little see-through)
 * so what scrolls under it stays readable; menus opened from it sit above it. It pins just under the page header (3.5rem tall, z-20), which is why it is
 * `top-14 z-10`; the app layout makes the page itself the scrolling thing in Time Track so that it can stick at all.
 */
export const STICKY_FILTERS = 'sticky top-14 z-10 bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60';
