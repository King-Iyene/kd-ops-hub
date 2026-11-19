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
