import type { CrewAgent } from './crewDb';

export function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function agentName(agents: CrewAgent[] | undefined, id: string | null): string {
  if (!id) return 'You';
  return agents?.find((a) => a.id === id)?.name ?? 'Unknown agent';
}
