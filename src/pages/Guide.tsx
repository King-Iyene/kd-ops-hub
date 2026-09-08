import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import {
  Rocket, Shield, BookOpen, HelpCircle, Search, ChevronRight,
} from 'lucide-react';

import { GettingStartedSection } from '@/components/guide/sections/GettingStarted';
import { RolesPermissionsSection } from '@/components/guide/sections/RolesPermissions';
import { EverydayWorkSection } from '@/components/guide/sections/EverydayWork';
import { GrowthWellbeingSection } from '@/components/guide/sections/GrowthWellbeing';
import { FinanceOpsSection } from '@/components/guide/sections/FinanceOps';
import { PeopleOpsSection } from '@/components/guide/sections/PeopleOps';
import { FleetOpsSection } from '@/components/guide/sections/FleetOps';
import { AdminToolsSection } from '@/components/guide/sections/AdminTools';
import { CrmOutreachSection } from '@/components/guide/sections/CrmOutreach';
import { ShiftsSchedulingSection } from '@/components/guide/sections/ShiftsScheduling';
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
    { id: 'how-to/crm-outreach', label: 'CRM & Outreach' },
    { id: 'how-to/shifts-scheduling', label: 'Shifts & Scheduling' },
    { id: 'how-to/admin-tools', label: 'Admin Tools' },
  ] },
  { id: 'technical', group: 'Technical Reference', icon: Shield, items: [
    { id: 'technical/overview', label: 'Change History & Overview' },
    { id: 'technical/payments', label: 'Payments & Paystack' },
    { id: 'technical/finance', label: 'Finance Modules' },
    { id: 'technical/expenses', label: 'Expenses & Budgets' },
    { id: 'technical/fleet', label: 'Fleet Technical Reference' },
    { id: 'technical/hr', label: 'HR & Leave Technical Reference' },
    { id: 'technical/workspace', label: 'Workspace / Tasks' },
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

  return (
    <nav className="hidden lg:block sticky top-6 self-start h-[calc(100vh-3rem)] overflow-y-auto w-64 shrink-0">
      <div className="rounded-2xl border border-white/[0.08] bg-card/60 backdrop-blur-2xl shadow-[0_2px_20px_-4px_rgba(0,0,0,0.12)] p-3">
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide..."
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-white/[0.06] bg-white/[0.03] text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 kd-transition"
          />
        </div>

        {/* Nav groups */}
        <div className="space-y-4">
          {filtered.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.id}>
                <div className="flex items-center gap-1.5 px-2 mb-1.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
                    {g.group}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const isActive = location.pathname.endsWith(item.id);
                    return (
                      <NavLink
                        key={item.id}
                        to={`/guide/${item.id}`}
                        className={cn(
                          'group flex items-center justify-between text-[13px] px-2.5 py-1.5 rounded-lg kd-transition leading-snug',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground/80 hover:bg-white/[0.04] hover:text-foreground',
                        )}
                      >
                        <span>{item.label}</span>
                        <ChevronRight className={cn(
                          'h-3 w-3 shrink-0 kd-transition',
                          isActive ? 'text-primary/60' : 'text-transparent group-hover:text-muted-foreground/30',
                        )} />
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function MobileNav() {
  const location = useLocation();
  const allItems = NAV.flatMap((g) => g.items);
  return (
    <div className="lg:hidden -mx-4 px-4 mb-5 overflow-x-auto">
      <div className="flex gap-1.5 pb-1 w-max">
        {allItems.map((item) => {
          const active = location.pathname.endsWith(item.id);
          return (
            <NavLink
              key={item.id}
              to={`/guide/${item.id}`}
              className={cn(
                'text-xs whitespace-nowrap px-3 py-1.5 rounded-full border kd-transition',
                active
                  ? 'bg-primary/10 text-primary border-primary/30 font-medium'
                  : 'text-muted-foreground/70 border-white/[0.06] hover:bg-white/[0.04]',
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

function GuideBody() {
  return (
    <div className="flex gap-8 items-start">
      <GuideSidebar />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <div className="rounded-2xl border border-white/[0.08] bg-card/60 backdrop-blur-2xl shadow-[0_2px_20px_-4px_rgba(0,0,0,0.12)] p-5 sm:p-7">
          <Routes>
            <Route index element={<Navigate to="/guide/getting-started" replace />} />
            <Route path="getting-started" element={<GettingStartedSection />} />
            <Route path="roles-permissions" element={<RolesPermissionsSection />} />
            <Route path="how-to/everyday-work" element={<EverydayWorkSection />} />
            <Route path="how-to/growth-wellbeing" element={<GrowthWellbeingSection />} />
            <Route path="how-to/finance" element={<FinanceOpsSection />} />
            <Route path="how-to/people-operations" element={<PeopleOpsSection />} />
            <Route path="how-to/fleet-assets" element={<FleetOpsSection />} />
            <Route path="how-to/crm-outreach" element={<CrmOutreachSection />} />
            <Route path="how-to/shifts-scheduling" element={<ShiftsSchedulingSection />} />
            <Route path="how-to/admin-tools" element={<AdminToolsSection />} />
            <Route path="technical/overview" element={<TechOverviewSection />} />
            <Route path="technical/payments" element={<TechPaymentsSection />} />
            <Route path="technical/finance" element={<TechFinanceSection />} />
            <Route path="technical/expenses" element={<TechExpensesSection />} />
            <Route path="technical/fleet" element={<TechFleetSection />} />
            <Route path="technical/hr" element={<TechHrSection />} />
            <Route path="technical/workspace" element={<TechWorkspaceSection />} />
            <Route path="technical/security" element={<TechSecuritySection />} />
            <Route path="technical/files" element={<TechFilesSection />} />
            <Route path="technical/infra" element={<TechInfraSection />} />
            <Route path="faq" element={<FaqSection />} />
            <Route path="*" element={<Navigate to="/guide/getting-started" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default function Guide() {
  usePageTitle('Guide');
  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Guide</h1>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Step-by-step walkthroughs for every part of KDOps. Pick a topic from the sidebar to get started.
        </p>
      </div>
      <GuideBody />
    </div>
  );
}
