/**
 * Sentinel for "show every company at once".
 *
 * Only valid where a screen is READING data (a dashboard, a list of past
 * runs). Anything that WRITES — drafting a payroll run, creating a pay
 * group — needs one specific company, so those paths must check for this
 * value rather than passing it through as if it were an id.
 */
export const ALL_COMPANIES = '__all__';
