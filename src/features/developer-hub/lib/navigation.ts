/**
 * Developer Hub navigation: four areas, each with sections.
 *
 * The hub used to have nine flat tabs addressed as `?tab=<id>`. Those ids are
 * still understood (other pages link to `/developer?tab=webhooks`), so every
 * old tab id maps to an area + section here.
 */

export type AreaId = 'start' | 'keys' | 'reference' | 'webhooks';

export type SectionId =
  | 'overview'
  | 'quickstart'
  | 'guides'
  | 'recipes'
  | 'troubleshooting'
  | 'keys'
  | 'reference'
  | 'explorer'
  | 'v0'
  | 'webhooks'
  | 'modules';

export interface SectionDef {
  id: SectionId;
  label: string;
}

export interface AreaDef {
  id: AreaId;
  label: string;
  description: string;
  sections: SectionDef[];
}

export const AREAS: AreaDef[] = [
  {
    id: 'start',
    label: 'Start',
    description: 'Overview, a copy-paste quick start, tool guides, recipes and troubleshooting',
    sections: [
      { id: 'overview', label: 'Overview' },
      { id: 'quickstart', label: 'Quick start' },
      { id: 'guides', label: 'Connect tools' },
      { id: 'recipes', label: 'Recipes' },
      { id: 'troubleshooting', label: 'Troubleshooting' },
    ],
  },
  {
    id: 'keys',
    label: 'Keys',
    description: 'Create, review and revoke API keys',
    sections: [{ id: 'keys', label: 'API keys' }],
  },
  {
    id: 'reference',
    label: 'Reference and Explorer',
    description: 'Endpoint reference, a live explorer and the planned /v0 API',
    sections: [
      { id: 'reference', label: 'API reference' },
      { id: 'explorer', label: 'API explorer' },
      { id: 'v0', label: '/v0 Airtable-compatible' },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks and logs',
    description: 'Webhook endpoints, delivery logs and per-module event guides',
    sections: [
      { id: 'webhooks', label: 'Webhooks and deliveries' },
      { id: 'modules', label: 'Module guides' },
    ],
  },
];

export const DEFAULT_LOCATION: HubLocation = { area: 'start', section: 'overview' };

export interface HubLocation {
  area: AreaId;
  section: SectionId;
}

/** The nine original tab ids, and where each one lives now. */
export const LEGACY_TAB_MAP: Record<string, HubLocation> = {
  overview: { area: 'start', section: 'overview' },
  quickstart: { area: 'start', section: 'quickstart' },
  guides: { area: 'start', section: 'guides' },
  recipes: { area: 'start', section: 'recipes' },
  troubleshooting: { area: 'start', section: 'troubleshooting' },
  keys: { area: 'keys', section: 'keys' },
  reference: { area: 'reference', section: 'reference' },
  explorer: { area: 'reference', section: 'explorer' },
  v0: { area: 'reference', section: 'v0' },
  webhooks: { area: 'webhooks', section: 'webhooks' },
  modules: { area: 'webhooks', section: 'modules' },
};

export function getArea(id: string | null | undefined): AreaDef | undefined {
  return AREAS.find((a) => a.id === id);
}

export function isSectionInArea(area: AreaId, section: string | null | undefined): section is SectionId {
  return !!getArea(area)?.sections.some((s) => s.id === section);
}

/** Area that contains a section. */
export function areaForSection(section: string | null | undefined): AreaDef | undefined {
  return AREAS.find((a) => a.sections.some((s) => s.id === section));
}

/**
 * Work out where to show, from the URL's `area`, `section` and legacy `tab`
 * params. Anything unknown falls back sensibly (never throws).
 */
export function resolveLocation(params: {
  area?: string | null;
  section?: string | null;
  tab?: string | null;
}): HubLocation {
  const area = getArea(params.area);
  if (area) {
    const section = isSectionInArea(area.id, params.section) ? params.section : area.sections[0].id;
    return { area: area.id, section };
  }
  if (params.section) {
    const owner = areaForSection(params.section);
    if (owner) return { area: owner.id, section: params.section as SectionId };
  }
  if (params.tab && Object.prototype.hasOwnProperty.call(LEGACY_TAB_MAP, params.tab)) {
    return LEGACY_TAB_MAP[params.tab];
  }
  return DEFAULT_LOCATION;
}

/** A target passed to onNavigate: a legacy tab id, a section id or an area id. */
export function resolveTarget(target: string): HubLocation | null {
  if (Object.prototype.hasOwnProperty.call(LEGACY_TAB_MAP, target)) return LEGACY_TAB_MAP[target];
  const owner = areaForSection(target);
  if (owner) return { area: owner.id, section: target as SectionId };
  const area = getArea(target);
  if (area) return { area: area.id, section: area.sections[0].id };
  return null;
}

/** Query string values for a location. */
export function locationToParams(loc: HubLocation): { area: string; section: string } {
  return { area: loc.area, section: loc.section };
}
