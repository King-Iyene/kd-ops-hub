/**
 * The same bank account can only be paid once in a payment batch (the database refuses a second line with the same account number).
 * Two different contractors can share one account, so the lines are compared by account number: the first line stays, later ones are duplicates.
 */
export function splitDuplicateAccounts<T extends { account_number?: string | null }>(items: T[]): { keep: T[]; duplicates: { item: T; keptWith: T }[] } {
  const first = new Map<string, T>();
  const keep: T[] = [];
  const duplicates: { item: T; keptWith: T }[] = [];
  for (const item of items) {
    const acct = (item.account_number ?? '').replace(/\s+/g, '');
    if (!acct) { keep.push(item); continue; }
    const kept = first.get(acct);
    if (kept) duplicates.push({ item, keptWith: kept });
    else { first.set(acct, item); keep.push(item); }
  }
  return { keep, duplicates };
}
