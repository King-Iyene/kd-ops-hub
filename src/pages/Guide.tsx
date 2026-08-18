// Company Guide — the single in-app destination for "how do I use KDOps"
// and "what does KDOps enforce." Combines a role-based how-to walkthrough
// of every module, the real roles/permissions matrix (generated from the
// actual route guards in App.tsx), and the full technical/system
// reference (caps, thresholds, security settings, infra limits) that used
// to be the whole of this page. Visible to every authenticated role — not
// just admins — since everyone benefits from knowing how the system
// behaves, not just the people who configure it.
import { useEffect, useRef, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { cn } from '@/lib/utils';
import {
  Rocket, Shield, CalendarCheck2, Sparkles, Wallet, Users, Car,
  BookOpen, HelpCircle, ChevronRight, Search,
} from 'lucide-react';
import { GettingStartedSection } from '@/components/guide/sections/GettingStarted';
import { RolesPermissionsSection } from '@/components/guide/sections/RolesPermissions';
import { EverydayWorkSection } from '@/components/guide/sections/EverydayWork';
import { GrowthWellbeingSection } from '@/components/guide/sections/GrowthWellbeing';
import { FinanceOpsSection } from '@/components/guide/sections/FinanceOps';
import { PeopleOpsSection } from '@/components/guide/sections/PeopleOps';
import { FleetOpsSection } from '@/components/guide/sections/FleetOps';
import { TechnicalReferenceSection } from '@/components/guide/sections/TechnicalReference';
import { FaqSection } from '@/components/guide/sections/Faq';

interface NavLeaf { id: string; label: string; }
interface NavGroup { group: string; icon: React.ElementType; items: NavLeaf[]; }

const NAV: NavGroup[] = [
  { group: 'Start Here', icon: Rocket, items: [
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'roles-permissions', label: 'Roles & Permissions' },
  ] },
  { group: 'How To', icon: BookOpen, items: [
    { id: 'everyday-work', label: 'Everyday Work' },
    { id: 'growth-wellbeing', label: 'Growth & Wellbeing' },
    { id: 'finance-ops', label: 'Finance' },
    { id: 'people-ops', label: 'People Operations' },
    { id: 'fleet-ops', label: 'Fleet & Assets' },
  ] },
  { group: 'Technical Reference', icon: Shield, items: [
    { id: 'tech-overview', label: 'Change History & Overview' },
    { id: 'tech-payments', label: 'Payments & Paystack' },
    { id: 'tech-finance', label: 'Finance Modules' },
    { id: 'tech-expenses', label: 'Expenses & Budgets' },
    { id: 'tech-fleet', label: 'Fleet Technical Reference' },
    { id: 'tech-hr', label: 'HR & Leave Technical Reference' },
    { id: 'tech-workspace', label: 'Workspace / Tasks Technical Reference' },
    { id: 'tech-security', label: 'Security Settings' },
    { id: 'tech-files', label: 'Files & Data Retention' },
    { id: 'tech-infra', label: 'Infrastructure & Capacity' },
  ] },
  { group: 'Help', icon: HelpCircle, items: [
    { id: 'faq', label: 'FAQ & Troubleshooting' },
  ] },
];

const ALL_IDS = NAV.flatMap((g) => g.items.map((i) => i.id));

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function GuideSidebar({ active }: { active: string }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) })).filter((g) => g.items.length)
    : NAV;

  return (
    <nav className="hidden lg:block sticky top-6 self-start h-[calc(100vh-3rem)] overflow-y-auto pr-2 w-64 shrink-0">
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide..."
          className="w-full h-9 pl-8 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      {filtered.map((g) => (
        <div key={g.group} className="mb-5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-1.5">
            <g.icon className="h-3 w-3" />
            {g.group}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  'text-sm px-2.5 py-1.5 rounded-md transition-colors leading-snug',
                  active === item.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function MobileNav({ active }: { active: string }) {
  return (
    <div className="lg:hidden -mx-4 px-4 mb-4 overflow-x-auto">
      <div className="flex gap-1.5 pb-1 w-max">
        {ALL_IDS.map((id) => {
          const label = NAV.flatMap((g) => g.items).find((i) => i.id === id)?.label ?? id;
          return (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                'text-xs whitespace-nowrap px-3 py-1.5 rounded-full border transition-colors',
                active === id ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground',
              )}
            >
              {label}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function GuideBody() {
  const active = useActiveSection(ALL_IDS);
  return (
    <div className="flex gap-8 items-start">
      <GuideSidebar active={active} />
      <div className="min-w-0 flex-1 space-y-16">
        <MobileNav active={active} />

        <section id="getting-started" className="scroll-mt-6">
          <GettingStartedSection />
        </section>

        <section id="roles-permissions" className="scroll-mt-6">
          <RolesPermissionsSection />
        </section>

        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <BookOpen className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">How To</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            Every module, organised by who uses it day to day. Role badges on each card show exactly who can open that page —
            if a module below doesn't apply to your role, skip it.
          </p>

          <div className="space-y-16">
            <section id="everyday-work" className="scroll-mt-6">
              <EverydayWorkSection />
            </section>
            <section id="growth-wellbeing" className="scroll-mt-6">
              <GrowthWellbeingSection />
            </section>
            <section id="finance-ops" className="scroll-mt-6">
              <FinanceOpsSection />
            </section>
            <section id="people-ops" className="scroll-mt-6">
              <PeopleOpsSection />
            </section>
            <section id="fleet-ops" className="scroll-mt-6">
              <FleetOpsSection />
            </section>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Shield className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Technical Reference</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            Read-only reference of every cap, approval rule, retention policy, security setting, and operational threshold the
            platform enforces. This is the single source of truth — when a rule changes in code, this page is updated too.
          </p>
          <TechnicalReferenceSection />
        </div>

        <section id="faq" className="scroll-mt-6 pb-8">
          <FaqSection />
        </section>
      </div>
    </div>
  );
}

export default function Guide() {
  usePageTitle('Guide');
  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Company Guide"
        description="Everything you need to run your day inside KDOps — how-to walkthroughs, roles & permissions, and the full technical reference."
      />
      <GuideBody />
    </div>
  );
}
