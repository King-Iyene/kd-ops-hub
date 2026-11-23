/**
 * Search over the Developer Hub docs. The index is built from the typed data
 * files, so it stays in step with what the pages show. All pure.
 */
import { EVENT_GROUPS } from '@/features/developer/webhookEvents';
import { MODULE_GUIDES } from '../data/moduleGuides';
import { RECIPES } from '../data/recipes';
import { STATUS_CODES } from '../data/statusCodes';
import { V0_ENDPOINTS } from '../data/v0Endpoints';
import { V1_MODULES } from '../data/v1Reference';
import { AREAS, areaForSection, type HubLocation, type SectionId } from './navigation';

export type SearchKind = 'Page' | 'Endpoint' | 'Planned endpoint' | 'Recipe' | 'Module' | 'Status code' | 'Webhook events';

export interface SearchEntry {
  id: string;
  kind: SearchKind;
  title: string;
  /** Extra words that should match but are not shown as the title. */
  text: string;
  location: HubLocation;
}

export interface SearchResult {
  entry: SearchEntry;
  score: number;
}

function loc(section: SectionId): HubLocation {
  const area = areaForSection(section);
  // Every section id belongs to an area; fall back to the first area defensively.
  return { area: (area ?? AREAS[0]).id, section };
}

/** Hand-written keywords for pages whose content is not in a data file. */
const PAGE_KEYWORDS: Record<SectionId, string> = {
  overview: 'api overview modules integrations rate limit',
  quickstart: 'quick start curl fetch javascript n8n make base table id snippet copy paste first request',
  guides: 'connect tools n8n zapier make python node php curl http request authentication header',
  recipes: 'recipes automation examples google sheets slack workflow',
  troubleshooting: 'troubleshooting errors 401 403 404 422 429 500 unauthorized forbidden rate limit checklist debug',
  keys: 'api keys create revoke scopes expiry kdops_ bearer token secret',
  reference: 'api reference endpoints bases tables records fields pagination filter sort scopes errors',
  explorer: 'api explorer try request send test live',
  v0: 'v0 airtable compatible filterByFormula pageSize offset typecast upsert coming soon',
  webhooks: 'webhooks endpoints deliveries logs signature secret retry events hmac replay',
  modules: 'module guides employees contractors tasks leave expenses payroll fleet invoices clients recruitment payments fields tips',
};

export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const area of AREAS) {
    for (const s of area.sections) {
      entries.push({
        id: `page:${s.id}`,
        kind: 'Page',
        title: `${area.label}: ${s.label}`,
        text: `${area.description} ${PAGE_KEYWORDS[s.id]}`,
        location: { area: area.id, section: s.id },
      });
    }
  }

  for (const m of V1_MODULES) {
    for (const e of m.endpoints) {
      entries.push({
        id: `v1:${m.id}:${e.method}:${e.path}`,
        kind: 'Endpoint',
        title: `${e.method} ${e.path}`,
        text: `${m.name} ${e.description} ${e.notes ?? ''} ${(e.params ?? []).map((p) => p.name).join(' ')} ${(e.bodyFields ?? []).map((p) => p.name).join(' ')}`,
        location: loc('reference'),
      });
    }
  }

  for (const e of V0_ENDPOINTS) {
    entries.push({
      id: `v0:${e.id}`,
      kind: 'Planned endpoint',
      title: `${e.method} ${e.path}`,
      text: `${e.name} ${e.description} ${e.notes ?? ''} v0 airtable`,
      location: loc('v0'),
    });
  }

  for (const r of RECIPES) {
    entries.push({
      id: `recipe:${r.id}`,
      kind: 'Recipe',
      title: r.title,
      text: `${r.description} ${r.platforms.join(' ')} ${r.difficulty} ${r.steps.join(' ')}`,
      location: loc('recipes'),
    });
  }

  for (const m of MODULE_GUIDES) {
    entries.push({
      id: `module:${m.id}`,
      kind: 'Module',
      title: `${m.name} module`,
      text: `${m.overview} ${m.basePath} ${m.fields.map((f) => f.name).join(' ')}`,
      location: loc('modules'),
    });
  }

  for (const s of STATUS_CODES) {
    entries.push({
      id: `status:${s.code}`,
      kind: 'Status code',
      title: `${s.code} ${s.meaning}`,
      text: s.action,
      location: loc('troubleshooting'),
    });
  }

  for (const g of EVENT_GROUPS) {
    for (const event of g.events) {
      entries.push({
        id: `event:${event}`,
        kind: 'Webhook events',
        title: event,
        text: `${g.module} webhook event`,
        location: loc('webhooks'),
      });
    }
  }

  return entries;
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Every word must appear somewhere in an entry. Title matches count for more,
 * and a title that starts with the first word counts for most. Ties keep the
 * order of the index (pages first).
 */
export function searchEntries(entries: SearchEntry[], query: string, limit = 12): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const results: SearchResult[] = [];
  entries.forEach((entry, index) => {
    const title = entry.title.toLowerCase();
    const text = entry.text.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      const inTitle = title.includes(t);
      const inText = text.includes(t);
      if (!inTitle && !inText) return;
      score += inTitle ? 5 : 1;
    }
    if (title.startsWith(tokens[0])) score += 3;
    // Keep the original order for equal scores by nudging with the index.
    results.push({ entry, score: score - index / 100000 });
  });
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
