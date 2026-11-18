const KEY = 'kdops:task:lastListId';

export function getLastUsedListId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastUsedListId(listId: string): void {
  try {
    localStorage.setItem(KEY, listId);
  } catch {
    // Per-viewer convenience only; fine to lose.
  }
}
