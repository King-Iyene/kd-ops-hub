/**
 * The KD Squares field team: people whose role is Field Staff, or whose job title says Field Agent. Time Tracking (Track) leaves them
 * out everywhere: they are not listed, not counted in totals and not in reports. This is the same rule the Ops Agent uses for the
 * team it watches (agent_team_v).
 */
export interface FieldTeamCandidate { role?: string | null; job_title?: string | null }

export function isFieldTeam(p: FieldTeamCandidate | null | undefined): boolean {
  if (!p) return false;
  return p.role === 'field_staff' || /field\s*agents?/i.test(p.job_title ?? '');
}
