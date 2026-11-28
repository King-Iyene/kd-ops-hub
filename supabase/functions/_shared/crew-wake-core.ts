// The pure parts of waking an executive: what text the shared Crew runner receives, and what to do with Anthropic's answer.

export const FIRE_VERSION = '2023-06-01';
export const FIRE_BETA = 'experimental-cc-routine-2026-04-01';

export interface WakeRow { id: string; slug: string; reason: string; depth: number; source: string }

/** The freeform text the runner routine gets (it is wrapped as untrusted data on their side): who to be, why, how deep this wake chain is. */
export function wakeText(row: WakeRow): string {
  // eslint-disable-next-line no-control-regex
  const clean = row.reason.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, 1500);
  return `AGENT=${row.slug}\nDEPTH=${row.depth}\nSOURCE=${row.source}\nREASON=${clean}`;
}

/**
 * One start of the CFO's routine carries every waiting task, so a burst of events costs one session, not one per person. The CFO reads the list and
 * runs each task as the named executive (each with its own key), then writes ONE briefing. Owner messages come first.
 */
export function batchText(rows: WakeRow[]): string {
  const ordered = [...rows].sort((a, b) => Number(b.source === 'owner') - Number(a.source === 'owner'));
  const lines = ordered.map((r, i) => {
    // eslint-disable-next-line no-control-regex
    const clean = r.reason.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, 900);
    return `${i + 1}. AGENT=${r.slug} DEPTH=${r.depth} SOURCE=${r.source}\n   REASON=${clean.replace(/\n/g, ' / ')}`;
  });
  return `TASKS (${ordered.length}):\n${lines.join('\n')}`.slice(0, 7000);
}

export function fireUrl(runnerId: string): string {
  return `https://api.anthropic.com/v1/claude_code/routines/${encodeURIComponent(runnerId)}/fire`;
}

export type FireOutcome = { kind: 'fired'; sessionUrl: string | null } | { kind: 'retry'; why: string } | { kind: 'failed'; why: string };

/** 2xx: started. 429 or 5xx: leave it waiting and try on the next tick. Anything else (a wrong token, a deleted routine): failed. */
export function classifyFire(status: number, body: unknown): FireOutcome {
  if (status >= 200 && status < 300) {
    const url = typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).claude_code_session_url === 'string' ? ((body as Record<string, unknown>).claude_code_session_url as string) : null;
    return { kind: 'fired', sessionUrl: url };
  }
  if (status === 429 || status >= 500) return { kind: 'retry', why: `Anthropic answered ${status}` };
  return { kind: 'failed', why: status === 401 || status === 403 ? 'the runner token was refused (regenerate it and update CREW_RUNNER_TOKEN)' : `Anthropic answered ${status}` };
}
