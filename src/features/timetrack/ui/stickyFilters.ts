/**
 * The date / people filter bar of a Time Track page stays in view while the page scrolls, so the day or the person can be
 * changed without scrolling back up. Put it on the bar's outer element. The bar keeps the page colour (a little see-through)
 * so what scrolls under it stays readable; menus opened from it sit above it.
 */
export const STICKY_FILTERS = 'sticky top-0 z-20 bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60';
