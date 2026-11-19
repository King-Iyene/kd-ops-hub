// Who a daily report is expected from: people in the KD Squares company who
// are not Field Agents.
//
//  • Company: a person's company comes from their pay group (there is no
//    company column on a profile), so someone with no pay group is not in
//    any company and is left out.
//  • Field Agent: the "Field Team" role (stored as field_staff), or a job
//    title that says Field Agent.

export interface ReporterCandidate {
  id: string;
  full_name: string;
  job_title?: string | null;
  role?: string | null;
  pay_group_id?: string | null;
}

export const isKdSquares = (companyName: string | null | undefined) => /^\s*kd\s*squares\b/i.test(companyName ?? '');

export const isFieldAgent = (p: Pick<ReporterCandidate, 'role' | 'job_title'>) =>
  p.role === 'field_staff' || /\bfield\s*agents?\b/i.test(p.job_title ?? '');

export function expectedReporters<P extends ReporterCandidate>(
  people: P[],
  payGroups: { id: string; company_id: string | null }[],
  companies: { id: string; name: string }[],
): P[] {
  const kdCompanyIds = new Set(companies.filter((c) => isKdSquares(c.name)).map((c) => c.id));
  const kdGroupIds = new Set(payGroups.filter((g) => g.company_id && kdCompanyIds.has(g.company_id)).map((g) => g.id));
  return people.filter((p) => !!p.pay_group_id && kdGroupIds.has(p.pay_group_id) && !isFieldAgent(p));
}
