import { Brain, Inbox, Link2, MessageSquare, ScrollText, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';

export type AgentTabKey = 'inbox' | 'summaries' | 'chat' | 'memory' | 'connections' | 'settings';

export interface AgentTab { key: AgentTabKey; label: string; path: string; icon: LucideIcon; superOnly?: boolean }

/** The Ops Agent sections. They live in the sidebar (and the mobile menu), not as a bar on the page. */
export const AGENT_TABS: AgentTab[] = [
  { key: 'inbox', label: 'Inbox', path: '/agent', icon: Inbox },
  { key: 'chat', label: 'Chat', path: '/agent/chat', icon: MessageSquare },
  { key: 'summaries', label: 'Summaries', path: '/agent/summaries', icon: ScrollText },
  { key: 'memory', label: 'Memory', path: '/agent/memory', icon: Brain },
  { key: 'connections', label: 'Connections', path: '/agent/connections', icon: Link2, superOnly: true },
  { key: 'settings', label: 'Settings', path: '/agent/settings', icon: SettingsIcon },
];

/** The section for the part of the address after /agent/. Unknown or empty means the Inbox. */
export function tabFromSplat(splat: string | undefined): AgentTabKey {
  const first = (splat ?? '').split('/')[0];
  return (AGENT_TABS.find((t) => t.key === first)?.key ?? 'inbox') as AgentTabKey;
}

export type SettingsSectionKey = 'claude' | 'team' | 'calendar' | 'coverage' | 'rules' | 'sites' | 'changes';

export interface SettingsSection { key: SettingsSectionKey; label: string; blurb: string }

/** The sections of Settings, in the order of the left rail. The address is /agent/settings/<key>. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'claude', label: 'Claude & budget', blurb: 'The Claude key, the models and what AI may spend.' },
  { key: 'team', label: 'Team', blurb: "Who the agent watches, and each person's group, manager and hours." },
  { key: 'calendar', label: 'Calendar & reports', blurb: 'When reports are due and when the team works.' },
  { key: 'coverage', label: 'Coverage', blurb: 'Which companies and modules the agent may look at.' },
  { key: 'rules', label: 'Operating rules', blurb: "The agent's standing brief and who sees which flags." },
  { key: 'sites', label: 'Sites & apps', blurb: 'Approved and unproductive sites the rules compare against.' },
  { key: 'changes', label: 'Change log', blurb: 'Who changed what in the agent, and when.' },
];

/** The Settings section for the address after /agent/. Only "settings/<key>" names one; anything else means the first. */
export function settingsSectionFromSplat(splat: string | undefined): SettingsSectionKey {
  const parts = (splat ?? '').split('/');
  const second = parts[0] === 'settings' ? parts[1] : undefined;
  return SETTINGS_SECTIONS.find((s) => s.key === second)?.key ?? SETTINGS_SECTIONS[0].key;
}

export const settingsPath = (key: SettingsSectionKey) => `/agent/settings/${key}`;
