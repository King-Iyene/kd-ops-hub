import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  UserCheck,
  CheckSquare,
  CalendarDays,
  Receipt,
  Banknote,
  Truck,
  FileText,
  Building2,
  UserPlus,
  Database,
  CreditCard,
  ArrowRight,
  Key,
  Send,
  Webhook,
  Zap,
  Code2,
  Terminal,
  Globe,
  Gauge,
  Layers,
  Radio,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const modules = [
  {
    name: 'Employees',
    icon: Users,
    description: 'Manage employee records, profiles, departments and org charts.',
    endpoints: ['GET /employees', 'POST /employees'],
    color: 'from-blue-500 to-blue-600',
  },
  {
    name: 'Contractors',
    icon: UserCheck,
    description: 'Track contractors, contracts, and engagement history.',
    endpoints: ['GET /contractors', 'POST /contractors'],
    color: 'from-cyan-500 to-cyan-600',
  },
  {
    name: 'Tasks',
    icon: CheckSquare,
    description: 'Create, assign, and track tasks across projects.',
    endpoints: ['GET /tasks', 'POST /tasks', 'PATCH /tasks/:id'],
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    name: 'Leave',
    icon: CalendarDays,
    description: 'Leave requests, balances, approvals and calendars.',
    endpoints: ['GET /leaves', 'POST /leaves'],
    color: 'from-violet-500 to-violet-600',
  },
  {
    name: 'Expenses',
    icon: Receipt,
    description: 'Submit and approve expense claims with receipt uploads.',
    endpoints: ['GET /expenses', 'POST /expenses'],
    color: 'from-orange-500 to-orange-600',
  },
  {
    name: 'Payroll',
    icon: Banknote,
    description: 'Payroll runs, salary slips, and compensation data.',
    endpoints: ['GET /payroll/runs', 'GET /payroll/slips'],
    color: 'from-green-500 to-green-600',
  },
  {
    name: 'Fleet & Fuel',
    icon: Truck,
    description: 'Vehicle tracking, fuel requests, and maintenance logs.',
    endpoints: ['GET /vehicles', 'GET /fuel-requests'],
    color: 'from-amber-500 to-amber-600',
  },
  {
    name: 'Invoices',
    icon: FileText,
    description: 'Generate, send, and track invoices and line items.',
    endpoints: ['GET /invoices', 'POST /invoices'],
    color: 'from-rose-500 to-rose-600',
  },
  {
    name: 'Clients',
    icon: Building2,
    description: 'Client profiles, contacts, and relationship management.',
    endpoints: ['GET /clients', 'POST /clients'],
    color: 'from-indigo-500 to-indigo-600',
  },
  {
    name: 'Recruitment',
    icon: UserPlus,
    description: 'Job openings, applicant tracking, and hiring pipelines.',
    endpoints: ['GET /openings', 'GET /applicants'],
    color: 'from-pink-500 to-pink-600',
  },
  {
    name: 'Database (Custom)',
    icon: Database,
    description: 'Query your custom tables and records via the data API.',
    endpoints: ['GET /data/bases/:id/tables/:id/records'],
    color: 'from-purple-500 to-purple-600',
  },
  {
    name: 'Payments',
    icon: CreditCard,
    description: 'Payment batches, transaction history, and disbursements.',
    endpoints: ['GET /payment-batches', 'GET /transactions'],
    color: 'from-teal-500 to-teal-600',
  },
];

const quickStartSteps = [
  {
    step: 1,
    icon: Key,
    title: 'Create an API Key',
    description:
      'Go to the API Keys tab, name your key, and pick scopes. Your key is shown once — copy it immediately.',
    action: 'keys',
    actionLabel: 'Create Key',
  },
  {
    step: 2,
    icon: Send,
    title: 'Make Your First Request',
    description: 'Use your key in the Authorization header to call any endpoint.',
    code: `curl -H "Authorization: Bearer kdops_xxx" \\
  https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/platform-api/v1/employees`,
  },
  {
    step: 3,
    icon: Webhook,
    title: 'Set Up Webhooks',
    description:
      'Subscribe to events like employee.created, task.updated, payment.completed. Receive POST payloads at your URL.',
    action: 'webhooks',
    actionLabel: 'Configure Webhooks',
  },
];

const integrations = [
  { name: 'n8n', icon: Zap },
  { name: 'Zapier', icon: Zap },
  { name: 'Make', icon: Globe },
  { name: 'cURL', icon: Terminal },
  { name: 'Python', icon: Code2 },
  { name: 'Node.js', icon: Code2 },
];

const stats = [
  { label: '100+ endpoints', icon: Layers },
  { label: '12 modules', icon: Database },
  { label: 'Webhook events', icon: Radio },
  { label: 'Rate limit: 100 req/min', icon: Clock },
];

export default function ApiOverview({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="space-y-10 pb-12">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-8 md:p-12 shadow-2xl shadow-blue-600/20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnYtMmgtNHY2aDR2LTJ6bTAtOGgydi0yaDJ2LTJoLTR2NHptLTYgMGgydi0yaDJ2LTRoLTR2NnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            REST API v1
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
            KDOps Platform API
          </h1>
          <p className="text-base md:text-lg text-blue-100/90 leading-relaxed mb-8">
            One unified REST API to access every module &mdash; employees, tasks,
            finance, fleet, HR, clients, and your custom databases. Authenticate
            with API keys, subscribe to webhooks, and build integrations with n8n,
            Zapier, Make, or any HTTP client.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => onNavigate('explorer')}
              size="lg"
              className="bg-white text-indigo-700 hover:bg-blue-50 font-semibold shadow-lg shadow-black/10"
            >
              Try the API Explorer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              onClick={() => onNavigate('reference')}
              variant="outline"
              size="lg"
              className="border-white/30 text-white hover:bg-white/10 font-semibold"
            >
              Read the Docs
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Start */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Zap className="h-5 w-5 text-success" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Quick Start
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Get up and running in three steps
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {quickStartSteps.map((s) => (
            <Card key={s.step} className="relative overflow-hidden group">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-bold shadow-md shadow-blue-500/20">
                    {s.step}
                  </span>
                  <s.icon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                </div>
                <CardTitle className="text-base">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {s.description}
                </p>
                {s.code && (
                  <div className="rounded-lg bg-zinc-950 dark:bg-zinc-900 p-3 overflow-x-auto">
                    <code className="text-2xs leading-relaxed text-emerald-400 font-mono whitespace-pre">
                      {s.code}
                    </code>
                  </div>
                )}
                {s.action && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate(s.action!)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-0"
                  >
                    {s.actionLabel}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Bank Details Warning */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-300/50 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-900/10">
        <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Bank Details Required for Disbursements</h3>
          <p className="text-sm text-amber-700 dark:text-amber-400/80 leading-relaxed">
            Any API operation involving payments — payroll, fuel requests, payment batches, expense reimbursements — requires the recipient to have valid bank details on file
            (<strong>bank_name</strong>, <strong>account_number</strong>, <strong>account_name</strong>). Without these, the payment will be created but <strong>cannot be processed</strong>.
            Always ensure employees and contractors have their bank details set before triggering disbursements via the API.
          </p>
        </div>
      </div>

      {/* Available Modules */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Available Modules
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Every module accessible through the API
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map((m) => (
            <Card
              key={m.name}
              className="group hover:shadow-lg transition-all duration-200 cursor-default"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br shadow-sm text-white',
                      m.color,
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">
                    {m.name}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {m.description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {m.endpoints.map((ep) => (
                    <Badge
                      key={ep}
                      variant="secondary"
                      className="font-mono text-3xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    >
                      {ep}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <Globe className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Works With Your Stack
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Connect with the tools you already use
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {integrations.map((i) => (
            <div
              key={i.name}
              className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-200"
            >
              <i.icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {i.name}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Bar */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-1">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-zinc-200 dark:divide-zinc-800">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-center gap-2.5 py-4 px-3"
            >
              <s.icon className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
