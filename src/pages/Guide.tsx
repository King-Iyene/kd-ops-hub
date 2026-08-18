// Company Guide — the single in-app destination for "how do I use KDOps"
// and "what does KDOps enforce." Each topic is its own real, bookmarkable
// page under /guide/*, grouped in a collapsible sidebar (Start Here, How
// To, Technical Reference, Help) rather than one long scrolling document.
import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  Rocket, Shield, BookOpen, HelpCircle, Search,
} from 'lucide-react';

import { GettingStartedSection } from '@/components/guide/sections/GettingStarted';
import { RolesPermissionsSection } from '@/components/guide/sections/RolesPermissions';
import { EverydayWorkSection } from '@/components/guide/sections/EverydayWork';
import { GrowthWellbeingSection } from '@/components/guide/sections/GrowthWellbeing';
import { FinanceOpsSection } from '@/components/guide/sections/FinanceOps';
import { PeopleOpsSection } from '@/components/guide/sections/PeopleOps';
import { FleetOpsSection } from '@/components/guide/sections/FleetOps';
import { FaqSection } from '@/components/guide/sections/Faq';

import { TechOverviewSection } from '@/components/guide/sections/technical/Overview';
import { TechPaymentsSection } from '@/components/guide/sections/technical/Payments';
import { TechFinanceSection } from '@/components/guide/sections/technical/FinanceModules';
import { TechExpensesSection } from '@/components/guide/sections/technical/ExpensesBudgets';
import { TechFleetSection } from '@/components/guide/sections/technical/Fleet';
import { TechHrSection } from '@/components/guide/sections/technical/HrLeave';
import { TechWorkspaceSection } from '@/components/guide/sections/technical/Workspace';
import { TechSecuritySection } from '@/components/guide/sections/technical/Security';
import { TechFilesSection } from '@/components/guide/sections/technical/FilesRetention';
import { TechInfraSection } from '@/components/guide/sections/technical/Infrastructure';

interface NavLeaf { id: string; label: string; }
interface NavGroup { id: string; group: string; icon: React.ElementType; items: NavLeaf[]; }

const NAV: NavGroup[] = [
  { id: 'start', group: 'Start Here', icon: Rocket, items: [
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'roles-permissions', label: 'Roles & Permissions' },
  ] },
  { id: 'howto', group: 'How To', icon: BookOpen, items: [
    { id: 'how-to/everyday-work', label: 'Everyday Work' },
    { id: 'how-to/growth-wellbeing', label: 'Growth & Wellbeing' },
    { id: 'how-to/finance', label: 'Finance' },
    { id: 'how-to/people-operations', label: 'People Operations' },
    { id: 'how-to/fleet-assets', label: 'Fleet & Assets' },
  ] },
  { id: 'technical', group: 'Technical Reference', icon: Shield, items: [
    { id: 'technical/overview', label: 'Change History & Overview' },
    { id: 'technical/payments', label: 'Payments & Paystack' },
    { id: 'technical/finance', label: 'Finance Modules' },
    { id: 'technical/expenses', label: 'Expenses & Budgets' },
    { id: 'technical/fleet', label: 'Fleet Technical Reference' },
    { id: 'technical/hr', label: 'HR & Leave Technical Reference' },
    { id: 'technical/workspace', label: 'Workspace / Tasks Technical Reference' },
    { id: 'technical/security', label: 'Security Settings' },
    { id: 'technical/files', label: 'Files & Data Retention' },
    { id: 'technical/infra', label: 'Infrastructure & Capacity' },
  ] },
  { id: 'help', group: 'Help', icon: HelpCircle, items: [
    { id: 'faq', label: 'FAQ & Troubleshooting' },
  ] },
];

function GuideSidebar() {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) })).filter((g) => g.items.length)
    : NAV;

  const activeGroup = NAV.find((g) => g.items.some((i) => location.pathname.endsWith(i.id)))?.id ?? 'start';

  return (
    <nav className="hidden lg:block sticky top-6 self-start h-[calc(100vh-3rem)] overflow-y-auto pr-2 w-64 shrink-0">
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide..."
          className="w-full h-9 pl-8 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <Accordion type="multiple" defaultValue={NAV.map((g) => g.id)} className="border-none">
        {filtered.map((g) => (
          <AccordionItem key={g.id} value={g.id} className="border-none mb-1">
            <AccordionTrigger
              className={cn(
                'py-2 px-2.5 rounded-md text-[11px] font-semibold uppercase tracking-wide hover:no-underline hover:bg-muted/60',
                activeGroup === g.id ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className="flex items-center gap-1.5">
                <g.icon className="h-3.5 w-3.5" />
                {g.group}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1 pt-0">
              <div className="flex flex-col gap-0.5 pl-1.5">
                {g.items.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.id}
                    className={({ isActive }) => cn(
                      'text-sm px-2.5 py-1.5 rounded-md transition-colors leading-snug',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </nav>
  );
}

function MobileNav() {
  const location = useLocation();
  const allItems = NAV.flatMap((g) => g.items);
  return (
    <div className="lg:hidden -mx-4 px-4 mb-4 overflow-x-auto">
      <div className="flex gap-1.5 pb-1 w-max">
        {allItems.map((item) => {
          const active = location.pathname.endsWith(item.id);
          return (
            <NavLink
              key={item.id}
              to={item.id}
              className={cn(
                'text-xs whitespace-nowrap px-3 py-1.5 rounded-full border transition-colors',
                active ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

function TechnicalPageWrapper({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function GuideBody() {
  return (
    <div className="flex gap-8 items-start">
      <GuideSidebar />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <Routes>
          <Route index element={<Navigate to="getting-started" replace />} />
          <Route path="getting-started" element={<GettingStartedSection />} />
          <Route path="roles-permissions" element={<RolesPermissionsSection />} />
          <Route path="how-to/everyday-work" element={<EverydayWorkSection />} />
          <Route path="how-to/growth-wellbeing" element={<GrowthWellbeingSection />} />
          <Route path="how-to/finance" element={<FinanceOpsSection />} />
          <Route path="how-to/people-operations" element={<PeopleOpsSection />} />
          <Route path="how-to/fleet-assets" element={<FleetOpsSection />} />
          <Route path="technical/overview" element={<TechnicalPageWrapper><TechOverviewSection /></TechnicalPageWrapper>} />
          <Route path="technical/payments" element={<TechnicalPageWrapper><TechPaymentsSection /></TechnicalPageWrapper>} />
          <Route path="technical/finance" element={<TechnicalPageWrapper><TechFinanceSection /></TechnicalPageWrapper>} />
          <Route path="technical/expenses" element={<TechnicalPageWrapper><TechExpensesSection /></TechnicalPageWrapper>} />
          <Route path="technical/fleet" element={<TechnicalPageWrapper><TechFleetSection /></TechnicalPageWrapper>} />
          <Route path="technical/hr" element={<TechnicalPageWrapper><TechHrSection /></TechnicalPageWrapper>} />
          <Route path="technical/workspace" element={<TechnicalPageWrapper><TechWorkspaceSection /></TechnicalPageWrapper>} />
          <Route path="technical/security" element={<TechnicalPageWrapper><TechSecuritySection /></TechnicalPageWrapper>} />
          <Route path="technical/files" element={<TechnicalPageWrapper><TechFilesSection /></TechnicalPageWrapper>} />
          <Route path="technical/infra" element={<TechnicalPageWrapper><TechInfraSection /></TechnicalPageWrapper>} />
          <Route path="faq" element={<FaqSection />} />
          <Route path="*" element={<Navigate to="getting-started" replace />} />
        </Routes>
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
