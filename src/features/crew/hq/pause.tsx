// Pause / resume per agent lives in components/PauseToggle.tsx, which arrives with its own pull request (and a database column). Until that file is in
// the tree this module quietly shows nothing and nobody is paused; the moment it is merged, HQ picks it up with no further change. It is looked up at
// build time (import.meta.glob), so a missing file can never break the build.
import type { ComponentType } from 'react';

interface PauseModule {
  PauseToggle?: ComponentType<{ agentId: string; name: string }>;
  usePausedAgents?: () => { data?: { id: string; paused: boolean }[] };
}

const found = Object.values(import.meta.glob<PauseModule>('../components/PauseToggle.tsx', { eager: true }))[0];

/** The pause button for one agent, or null when the feature is not in this build. */
export const PauseToggleSlot: ComponentType<{ agentId: string; name: string }> | null = found?.PauseToggle ?? null;

const none = (): { data?: { id: string; paused: boolean }[] } => ({ data: undefined });
const usePaused = found?.usePausedAgents ?? none;

/** Ids of the agents that are paused (an empty set when the feature is not available). */
export function usePausedIds(): ReadonlySet<string> {
  const rows = usePaused().data;
  return new Set((rows ?? []).filter((r) => r.paused).map((r) => r.id));
}
