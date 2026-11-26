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

/** The lines that share an account, grouped by account (the first line of each group is the one that stays). */
export function groupDuplicateAccounts<T extends { account_number?: string | null }>(items: T[]): { account: string; lines: T[] }[] {
  const byAccount = new Map<string, T[]>();
  for (const item of items) {
    const acct = (item.account_number ?? '').replace(/s+/g, '');
    if (!acct) continue;
    byAccount.set(acct, [...(byAccount.get(acct) ?? []), item]);
  }
  return [...byAccount.entries()].filter(([, lines]) => lines.length > 1).map(([account, lines]) => ({ account, lines }));
}

/** The lines are meant to be paid together: each repeat is folded into the first line of its account (their amounts are added). */
export function mergeDuplicateAccounts<T extends { account_number?: string | null; amount_ngn: number }>(items: T[]): T[] {
  const first = new Map<string, T>();
  const out: T[] = [];
  for (const item of items) {
    const acct = (item.account_number ?? '').replace(/s+/g, '');
    if (!acct) { out.push(item); continue; }
    const kept = first.get(acct);
    if (kept) { const i = out.indexOf(kept); const merged = { ...kept, amount_ngn: Number(kept.amount_ngn) + Number(item.amount_ngn) }; out[i] = merged; first.set(acct, merged); }
    else { first.set(acct, item); out.push(item); }
  }
  return out;
}
