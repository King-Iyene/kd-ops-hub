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
  Settings, Plus, Zap, CalendarClock, HelpCircle,
} from 'lucide-react';
import { useEffectiveRole } from '@/store/authStore';
import { hasRole, APPROVER_ROLES, MANAGER_ROLES, ALL_AUTH_ROLES, type Role } from '@/lib/roles';

type Item = {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  roles: Role[];
  group: 'navigate' | 'create' | 'finance' | 'workspace' | 'admin';
  keywords?: string;
};

const ITEMS: Item[] = [
  // Navigate
  { title: 'Dashboard',       path: '/',              icon: LayoutDashboard, shortcut: 'G D', roles: ALL_AUTH_ROLES, group: 'navigate' },
  { title: 'Approvals',       path: '/approvals',     icon: Inbox,           shortcut: 'G A', roles: APPROVER_ROLES, group: 'navigate' },
  { title: 'Tasks',           path: '/tasks',         icon: ListTodo,        roles: ALL_AUTH_ROLES, group: 'navigate' },
  { title: 'Goals',           path: '/goals',         icon: Target,          roles: ALL_AUTH_ROLES, group: 'navigate' },
  { title: 'Guide',           path: '/guide',         icon: HelpCircle,      roles: ALL_AUTH_ROLES, group: 'navigate', keywords: 'help how to manual documentation onboarding roles permissions' },

  // Finance
  { title: 'Payments',          path: '/payments',          icon: CreditCard,    roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Payment Schedule',  path: '/payments/schedule', icon: CalendarClock, roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Transactions',      path: '/transactions',      icon: ArrowUpDown,   roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Payroll',           path: '/payroll',           icon: Banknote,      roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Subscriptions',     path: '/subscriptions',     icon: Layers,        roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Budgets',           path: '/budgets',           icon: PiggyBank,     roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Cards',             path: '/cards',             icon: CreditCard,    roles: APPROVER_ROLES, group: 'finance' },
  { title: 'Compliance',        path: '/compliance',        icon: ShieldCheck,   roles: APPROVER_ROLES, group: 'finance' },

  // Workspace
  { title: 'Expenses',     path: '/expenses',    icon: Receipt,    roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Fleet',        path: '/fleet',       icon: Truck,      roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Leave',        path: '/leave',       icon: CalendarDays, roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Knowledge',    path: '/knowledge',   icon: BookOpen,   roles: ALL_AUTH_ROLES, group: 'workspace' },
  { title: 'Documents',    path: '/documents',   icon: FileText,   roles: APPROVER_ROLES, group: 'workspace' },
  { title: 'Reports',      path: '/reports',     icon: BarChart3,  roles: APPROVER_ROLES, group: 'workspace' },
  { title: 'Contractors',  path: '/contractors', icon: UserCog,    roles: MANAGER_ROLES,  group: 'workspace' },
  { title: 'Employees',    path: '/employees',   icon: Users,      roles: ['super_admin', 'admin'], group: 'workspace' },
  { title: 'Contacts',     path: '/contacts',    icon: Contact2,   roles: MANAGER_ROLES,  group: 'workspace' },
  { title: 'Referrals',    path: '/referrals',   icon: Gift,       roles: ALL_AUTH_ROLES, group: 'workspace' },

  // Create
  { title: 'New Payment Batch',  path: '/payments/new', icon: Plus, shortcut: 'N B', roles: APPROVER_ROLES, group: 'create', keywords: 'create batch payment' },

  // Admin
  { title: 'Audit Log',  path: '/audit',    icon: ScrollText, roles: ['super_admin', 'admin'], group: 'admin' },
  { title: 'Settings',   path: '/settings', icon: Settings,   roles: ['super_admin'], group: 'admin' },
];

const GROUP_LABELS: Record<Item['group'], string> = {
  navigate:  'Navigate',
  create:    'Create',
  finance:   'Finance',
  workspace: 'Workspace',
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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to anywhere — type a page, action, or keyword…" />
      <CommandList>
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
