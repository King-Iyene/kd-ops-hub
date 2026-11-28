// HQ shows who is paused (dimmed face, "Paused" chip); the toggle itself is components/PauseToggle.tsx, shown in the profile drawer.
import { usePausedAgents } from '../components/PauseToggle';

/** Ids of the agents that are paused (an empty set while loading or if the flag cannot be read). */
export function usePausedIds(): ReadonlySet<string> {
  const rows = usePausedAgents().data;
  return new Set((rows ?? []).filter((r) => r.paused).map((r) => r.id));
}
