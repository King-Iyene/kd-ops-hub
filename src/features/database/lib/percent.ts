/**
 * Some Percent fields keep their value as a fraction (0.25 means 25%), the way Airtable stores them, because
 * formulas such as Principal * Interest Rate rely on that. Such a field has `storedAsFraction` set; every screen
 * shows and accepts the percentage (25) and the stored value stays 0.25.
 */

export function storedAsFraction(field: { options?: Record<string, unknown> | null } | null | undefined): boolean {
  return field?.options?.storedAsFraction === true;
}

/** The number to show for a stored value. Rounded so 0.144 reads 14.4, not 14.399999999999999. */
export function toShownPercent(stored: number, fraction: boolean): number {
  return fraction ? Math.round(stored * 1e8) / 1e6 : stored;
}

/** The number to store for what was typed or pasted. */
export function fromShownPercent(shown: number, fraction: boolean): number {
  return fraction ? Math.round(shown * 1e6) / 1e8 : shown;
}
