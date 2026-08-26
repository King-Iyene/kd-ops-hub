import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, CreditCard, Receipt, Truck, Users, UserCog, Banknote,
  ShieldCheck, Inbox, ListTodo, BookOpen, FileText, Target, BarChart3,
  CalendarDays, ScrollText, PiggyBank, Layers, Contact2, Gift, ArrowUpDown,
  Settings, Plus, Zap, CalendarClock, HelpCircle, FileSpreadsheet, Wallet,
  CircleDollarSign, AlertTriangle, LineChart, Store, Award, Boxes,
  GraduationCap, FolderKanban, HeartHandshake, UserPlus, Briefcase, Link2,
  Handshake, Clock, AlertOctagon, Mail, ClipboardList, MessageSquareWarning,
  HandCoins, CalendarRange, GitBranch, BookMarked, Clock3, LayoutGrid,
  Workflow, Megaphone, Building2, Landmark, User as UserIcon, Bot,
  MessageCircle,
} from 'lucide-react';
import { useEffectiveRole } from '@/store/authStore';
import {
  hasRole, APPROVER_ROLES, MANAGER_ROLES, ALL_AUTH_ROLES, ADMIN_ONLY_ROLES,
  PAYMENT_ROLES, type Role,
} from '@/lib/roles';

type Item = {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  roles: Role[];
  group: 'navigate' | 'create' | 'finance' | 'workspace' | 'hr' | 'admin';
  keywords?: string;
};

const ITEMS: Item[] = [
  // Navigate
  { title: 'Dashboard',       path: '/',              icon: LayoutDashboard, shortcut: 'G D', roles: ALL_AUTH_ROLES, group: 'navigate' },
  { title: 'My Dashboard',    path: '/my-dashboard',  icon: LayoutGrid,     roles: ALL_AUTH_ROLES, group: 'navigate', keywords: 'self service' },
  { title: 'Approvals',       path: '/approvals',     icon: Inbox,           shortcut: 'G A', roles: APPROVER_ROLES, group: 'navigate' },
  { title: 'Tasks',           path: '/tasks',         icon: ListTodo,        roles: ALL_AUTH_ROLES, group: 'navigate' },
  { title: 'Goals',           path: '/goals',         icon: Target,          roles: ALL_AUTH_ROLES, group: 'navigate' },
  { title: 'Messages',        path: '/messages',      icon: MessageCircle,  roles: ALL_AUTH_ROLES, group: 'navigate', keywords: 'chat direct message' },
  { title: 'AI Assistant',    path: '/assistant',     icon: Bot,            roles: ALL_AUTH_ROLES, group: 'navigate', keywords: 'chatbot ask help' },
  { title: 'My Profile',      path: '/profile',       icon: UserIcon,       roles: ALL_AUTH_ROLES, group: 'navigate', keywords: 'account settings payslips' },
  { title: 'Guide',           path: '/guide',         icon: HelpCircle,      roles: ALL_AUTH_ROLES, group: 'navigate', keywords: 'help how to manual documentation onboarding roles permissions' },

  // Finance
  { title: 'Payments',          path: '/payments',          icon: CreditCard,    roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Payment Schedule',  path: '/payments/schedule', icon: CalendarClock, roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Transactions',      path: '/transactions',      icon: ArrowUpDown,   roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Invoices',          path: '/invoices',           icon: FileSpreadsheet, roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Payroll',           path: '/payroll',           icon: Banknote,      roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Pay Hub',           path: '/pay-hub',            icon: Wallet,        roles: APPROVER_ROLES, group: 'finance', keywords: 'payroll ewa loans compliance' },
  { title: 'Earned Wage Access', path: '/ewa',              icon: CircleDollarSign, roles: ALL_AUTH_ROLES, group: 'finance', keywords: 'ewa advance draw' },
  { title: 'Staff Loans',       path: '/staff-loans',        icon: HandCoins,     roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Subscriptions',     path: '/subscriptions',     icon: Layers,        roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Budgets',           path: '/budgets',           icon: PiggyBank,     roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Cards',             path: '/cards',             icon: CreditCard,    roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Cash Flow',         path: '/cashflow',           icon: LineChart,     roles: APPROVER_ROLES, group: 'finance', keywords: 'forecast runway' },
  { title: 'Anomalies',         path: '/anomalies',          icon: AlertTriangle, roles: APPROVER_ROLES, group: 'finance', keywords: 'fraud review flag' },
  { title: 'Finance Dashboard', path: '/finance',            icon: BarChart3,     roles: ['super_admin'], group: 'finance', keywords: 'cfo board runway' },
  { title: 'Compliance',        path: '/compliance',        icon: ShieldCheck,   roles: APPROVER_ROLES, group: 'finance' },

  // Workspace
  { title: 'Expenses',     path: '/expenses',    icon: Receipt,    roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Fleet',        path: '/fleet',       icon: Truck,      roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Leave',        path: '/leave',       icon: CalendarDays, roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Knowledge',    path: '/knowledge',   icon: BookOpen,   roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Employee Handbook', path: '/handbook', icon: BookMarked, roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Documents',    path: '/documents',   icon: FileText,   roles: APPROVER_ROLES, group: 'workspace' },
  { title: 'Assets',       path: '/assets',      icon: Boxes,      roles: APPROVER_ROLES, group: 'workspace', keywords: 'asset register equipment' },
  { title: 'Reports',      path: '/reports',     icon: BarChart3,  roles: APPROVER_ROLES, group: 'workspace' },
  { title: 'Projects',     path: '/projects',    icon: FolderKanban, roles: MANAGER_ROLES, group: 'workspace' },
  { title: 'Vendors',      path: '/vendors',     icon: Store,      roles: MANAGER_ROLES,  group: 'workspace', keywords: 'vendor registry supplier' },
  { title: 'Contractors',  path: '/contractors', icon: UserCog,    roles: MANAGER_ROLES,  group: 'workspace' },
  { title: 'Employees',    path: '/employees',   icon: Users,      roles: ['super_admin', 'admin'], group: 'workspace' },
  { title: 'Clients',      path: '/clients',     icon: Building2,  roles: MANAGER_ROLES,  group: 'workspace' },
  { title: 'Contacts',     path: '/contacts',    icon: Contact2,   roles: MANAGER_ROLES,  group: 'workspace' },
  { title: 'Communications', path: '/communications', icon: Megaphone, roles: ['super_admin', 'admin', 'finance'], group: 'workspace', keywords: 'campaign announcement broadcast' },
  { title: 'Public Links', path: '/public-links', icon: Link2,     roles: MANAGER_ROLES,  group: 'workspace', keywords: 'shareable external form' },
  { title: 'Referrals',    path: '/referrals',   icon: Gift,       roles: ALL_AUTH_ROLES, group: 'workspace' },

  // HR
  { title: 'HR Analytics',     path: '/hr-analytics', icon: BarChart3,     roles: APPROVER_ROLES, group: 'hr', keywords: 'headcount attrition org chart' },
  { title: 'Performance Reviews', path: '/performance', icon: Award,       roles: MANAGER_ROLES,  group: 'hr' },
  { title: 'Training & Certifications', path: '/training', icon: GraduationCap, roles: MANAGER_ROLES, group: 'hr' },
  { title: 'Benefits',          path: '/benefits',     icon: HeartHandshake, roles: MANAGER_ROLES, group: 'hr' },
  { title: 'Onboarding',        path: '/onboarding',   icon: UserPlus,       roles: MANAGER_ROLES, group: 'hr', keywords: 'offboarding new hire' },
  { title: 'Recruitment',       path: '/recruitment',  icon: Briefcase,      roles: MANAGER_ROLES, group: 'hr', keywords: 'pipeline candidate hiring' },
  { title: 'Placements',        path: '/placements',   icon: Handshake,      roles: ['super_admin'], group: 'hr' },
  { title: 'Attendance',        path: '/attendance',   icon: Clock,          roles: MANAGER_ROLES, group: 'hr', keywords: 'timesheets clock in' },
  { title: 'Timesheets',        path: '/timesheets',   icon: Clock3,         roles: MANAGER_ROLES, group: 'hr' },
  { title: 'Shift Scheduling',  path: '/shifts',       icon: CalendarRange,  roles: MANAGER_ROLES, group: 'hr', keywords: 'roster shift' },
  { title: 'Surveys',           path: '/surveys',      icon: ClipboardList,  roles: MANAGER_ROLES, group: 'hr', keywords: 'pulse check feedback' },
  { title: 'Succession Planning', path: '/succession', icon: GitBranch,     roles: ADMIN_ONLY_ROLES, group: 'hr' },
  { title: 'Disciplinary Records', path: '/disciplinary', icon: AlertOctagon, roles: ADMIN_ONLY_ROLES, group: 'hr', keywords: 'sensitive' },
  { title: 'Grievance Portal',  path: '/grievances',   icon: MessageSquareWarning, roles: ADMIN_ONLY_ROLES, group: 'hr', keywords: 'sensitive complaint' },
  { title: 'HR Letters',        path: '/hr-letters',   icon: Mail,           roles: ADMIN_ONLY_ROLES, group: 'hr', keywords: 'offer letter template' },

  // Create
  { title: 'New Payment Batch',  path: '/payments/new', icon: Plus, shortcut: 'N B', roles: PAYMENT_ROLES, group: 'create', keywords: 'create batch payment' },

  // Admin
  { title: 'Approval Workflows', path: '/approval-workflows', icon: Workflow, roles: ADMIN_ONLY_ROLES, group: 'admin', keywords: 'thresholds routing' },
  { title: 'Audit Log',  path: '/audit',    icon: ScrollText, roles: ['super_admin', 'admin'], group: 'admin' },
  { title: 'AI Assistant Admin', path: '/assistant/admin', icon: Bot, roles: ['super_admin'], group: 'admin', keywords: 'knowledge base config' },
  { title: 'Director Disbursements', path: '/principal-disbursements', icon: Landmark, roles: ['super_admin'], group: 'admin', keywords: 'principal owner payout' },
  { title: 'Settings',   path: '/settings', icon: Settings,   roles: ['super_admin'], group: 'admin' },
];

const GROUP_LABELS: Record<Item['group'], string> = {
  navigate:  'Navigate',
  create:    'Create',
  finance:   'Finance',
  workspace: 'Workspace',
  hr:        'HR',
  admin:     'Admin',
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const role = useEffectiveRole();

  // Cmd/Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allowed = ITEMS.filter((it) => hasRole(role || undefined, it.roles));
  const groups = Array.from(new Set(allowed.map((i) => i.group))) as Item['group'][];

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      // Compact variant: the shared defaults (12px input, 20px icons) were
      // sized for a rarely-used, generously-spaced palette, but this one
      // opens constantly via Cmd/Ctrl+K — a tighter, denser list reads
      // faster and matches what Raycast/Linear/VS Code actually ship.
      commandClassName="sm:max-w-xl [&_[cmdk-input]]:h-11 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-item]]:py-2 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
    >
      <CommandInput placeholder="Jump to anywhere — type a page, action, or keyword…" />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nothing found. Try a different keyword.
          </div>
        </CommandEmpty>

        {groups.map((g, idx) => (
          <div key={g}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={GROUP_LABELS[g]}>
              {allowed.filter((it) => it.group === g).map((it) => {
                const Icon = it.icon;
                return (
                  <CommandItem
                    key={it.path}
                    value={`${it.title} ${it.keywords ?? ''}`}
                    onSelect={() => go(it.path)}
                    className="gap-2.5"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{it.title}</span>
                    {it.shortcut && (
                      <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {it.shortcut}
                      </kbd>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">↵</kbd>
            open
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">esc</kbd>
            close
          </span>
        </div>
        <span className="inline-flex items-center gap-1">
          <Zap className="h-3 w-3" />
          KDOps Command
        </span>
      </div>
    </CommandDialog>
  );
}
