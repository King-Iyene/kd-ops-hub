import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Lightbulb,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Users,
  CheckSquare,
  Receipt,
  Truck,
  FileText,
  Building2,
  CalendarDays,
  Banknote,
  AlertTriangle,
  Zap,
  Play,
  Code2,
} from 'lucide-react';

const API_BASE =
  'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/platform-api/v1';

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

interface Recipe {
  id: string;
  icon: React.ElementType;
  emoji: string;
  title: string;
  difficulty: Difficulty;
  platforms: string[];
  description: string;
  steps: string[];
  code?: { language: string; label: string; content: string }[];
  proTip?: string;
  important?: string;
}

const difficultyColors: Record<Difficulty, string> = {
  Beginner:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  Intermediate:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  Advanced: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

const recipes: Recipe[] = [
  {
    id: 'auto-create-employee',
    icon: Users,
    emoji: '👤',
    title: 'Auto-Create Employee from Google Sheet',
    difficulty: 'Beginner',
    platforms: ['n8n', 'Zapier'],
    description:
      'When a new row is added to a Google Sheet (e.g., HR onboarding spreadsheet), automatically create the employee in KDOps.',
    steps: [
      'Trigger: Google Sheets → New Row Added',
      `Action: HTTP Request to POST ${API_BASE}/employees`,
      'Map columns: Name → first_name, Email → email, Department → department, etc.',
    ],
    code: [
      {
        language: 'json',
        label: 'n8n HTTP Request Node',
        content: `{
  "method": "POST",
  "url": "${API_BASE}/employees",
  "headers": {
    "Authorization": "Bearer kdops_YOUR_KEY",
    "Content-Type": "application/json"
  },
  "body": {
    "first_name": "{{ $json.Name.split(' ')[0] }}",
    "last_name": "{{ $json.Name.split(' ')[1] }}",
    "email": "{{ $json.Email }}",
    "department": "{{ $json.Department }}",
    "role": "{{ $json.Role }}"
  }
}`,
      },
    ],
    proTip:
      'Add a second step to create a task for IT to set up their laptop.',
  },
  {
    id: 'daily-expense-report',
    icon: Receipt,
    emoji: '💰',
    title: 'Daily Expense Report to Slack',
    difficulty: 'Beginner',
    platforms: ['n8n', 'Make'],
    description:
      "Every morning at 9 AM, fetch yesterday's expenses and post a summary to a Slack channel.",
    steps: [
      'Trigger: Schedule (daily at 9 AM WAT)',
      `HTTP Request: GET ${API_BASE}/expenses?status=pending&date_from=yesterday`,
      'Format the response into a Slack message with totals',
      'Post to #finance Slack channel via Slack API',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function Node — Format Message',
        content: `const expenses = $input.all().map(i => i.json);
const total = expenses.reduce((sum, e) => sum + e.amount, 0);

return [{
  json: {
    text: \`*Daily Expense Report* — \${new Date().toLocaleDateString('en-NG')}\\n\\n\` +
      \`Pending expenses: *\${expenses.length}*\\n\` +
      \`Total amount: *₦\${total.toLocaleString()}*\\n\\n\` +
      expenses.map(e =>
        \`• \${e.employee_name}: ₦\${e.amount.toLocaleString()} — \${e.description}\`
      ).join('\\n')
  }
}];`,
      },
    ],
  },
  {
    id: 'fuel-request-approval',
    icon: Truck,
    emoji: '⛽',
    title: 'Fuel Request Approval Notification',
    difficulty: 'Intermediate',
    platforms: ['Webhook', 'n8n'],
    description:
      'When a fuel request is approved in KDOps, send an SMS to the driver via Termii and update a Google Sheet tracker.',
    steps: [
      'Set up webhook in KDOps for fuel_request.approved event',
      'n8n Webhook trigger receives the payload',
      'Extract driver name, amount, vehicle from payload',
      'Send SMS via Termii HTTP API to the driver',
      'Append row to Google Sheet fleet tracker',
    ],
    code: [
      {
        language: 'json',
        label: 'Termii SMS Request',
        content: `{
  "to": "{{ $json.driver_phone }}",
  "from": "KDOps",
  "sms": "Hi {{ $json.driver_name }}, your fuel request for {{ $json.vehicle_plate }} (₦{{ $json.amount }}) has been approved. Please proceed to the designated fuel station.",
  "type": "plain",
  "channel": "generic",
  "api_key": "YOUR_TERMII_KEY"
}`,
      },
    ],
    important:
      'The employee must have valid bank details on file for the fuel disbursement to process.',
  },
  {
    id: 'sync-clients-crm',
    icon: Building2,
    emoji: '🏢',
    title: 'Sync New Clients to CRM (HubSpot/Pipedrive)',
    difficulty: 'Intermediate',
    platforms: ['Zapier', 'Make'],
    description:
      'When a client is created in KDOps, automatically create a company in your CRM.',
    steps: [
      'KDOps webhook: client.created',
      'Map fields: name → company name, contact_email → email, industry → industry',
      'Create company in CRM (HubSpot or Pipedrive)',
      'Optionally create a deal/contact linked to the company',
    ],
    code: [
      {
        language: 'json',
        label: 'Webhook Payload Example',
        content: `{
  "event": "client.created",
  "data": {
    "id": "cl_abc123",
    "name": "Dangote Industries",
    "contact_email": "procurement@dangote.com",
    "industry": "Manufacturing",
    "phone": "+234 802 345 6789"
  }
}`,
      },
    ],
  },
  {
    id: 'payroll-report',
    icon: Banknote,
    emoji: '📊',
    title: 'Automated Payroll Report Generator',
    difficulty: 'Advanced',
    platforms: ['Python'],
    description:
      'Python script that runs monthly, fetches payroll data, generates a PDF report, and emails it to finance.',
    steps: [
      'Run script on the 1st of each month (cron job)',
      'Fetch payroll runs for the current month from KDOps API',
      'Retrieve pay slips for each run',
      'Generate PDF summary with totals and breakdown',
      'Email the report to the finance team via SMTP',
    ],
    code: [
      {
        language: 'python',
        label: 'payroll_report.py',
        content: `import requests
from datetime import date

API_KEY = "kdops_YOUR_KEY"
BASE = "${API_BASE}"
headers = {"Authorization": f"Bearer {API_KEY}"}

# Get current month's payroll
month = date.today().strftime("%Y-%m")
runs = requests.get(f"{BASE}/payroll/runs?month={month}", headers=headers).json()

for run in runs["data"]:
    slips = requests.get(
        f"{BASE}/payroll/runs/{run['id']}/slips", headers=headers
    ).json()
    total = sum(s["net_pay"] for s in slips["data"])
    print(f"Run {run['id']}: {len(slips['data'])} employees, Total: ₦{total:,.2f}")

# To generate PDF, use reportlab or weasyprint
# To send email, use smtplib with your SMTP credentials`,
      },
    ],
  },
  {
    id: 'task-deadline-reminder',
    icon: CheckSquare,
    emoji: '⏰',
    title: 'Task Deadline Reminder Bot',
    difficulty: 'Beginner',
    platforms: ['n8n'],
    description:
      'Every day, check for tasks due tomorrow and send reminder emails to assignees.',
    steps: [
      'Schedule trigger: daily at 8 AM WAT',
      `GET ${API_BASE}/tasks?due_date=tomorrow&status=pending`,
      'For each task, send email to assignee with task details',
      'Optionally send a Slack DM as well',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function Node',
        content: `const tasks = $input.all().map(i => i.json);

return tasks.map(task => ({
  json: {
    to: task.assignee_email,
    subject: \`Reminder: "\${task.title}" is due tomorrow\`,
    body: \`Hi \${task.assignee_name},\\n\\nYour task "\${task.title}" is due tomorrow (\${task.due_date}).\\n\\nPlease update the status in KDOps.\\n\\nBest,\\nKDOps Bot\`
  }
}));`,
      },
    ],
    proTip:
      'Add a filter to skip tasks already marked as "in progress" so you only nag about forgotten ones.',
  },
  {
    id: 'invoice-payment-tracker',
    icon: FileText,
    emoji: '📝',
    title: 'Invoice Payment Tracker with Google Sheets',
    difficulty: 'Intermediate',
    platforms: ['Make', 'Zapier'],
    description:
      'Keep a Google Sheet automatically updated with all invoice statuses.',
    steps: [
      'Set up webhooks: invoice.created, invoice.paid, invoice.overdue',
      'On create: add new row to Google Sheet with invoice details',
      'On paid: find the row by invoice ID and update status to "Paid"',
      'On overdue: find the row and update status to "Overdue", highlight red',
    ],
    code: [
      {
        language: 'json',
        label: 'Webhook Events',
        content: `// invoice.created payload
{
  "event": "invoice.created",
  "data": {
    "id": "inv_001",
    "client_name": "GTBank Plc",
    "amount": 2500000,
    "currency": "NGN",
    "due_date": "2026-10-01",
    "status": "pending"
  }
}`,
      },
    ],
  },
  {
    id: 'employee-onboarding',
    icon: Zap,
    emoji: '🚀',
    title: 'Employee Onboarding Automation Pipeline',
    difficulty: 'Advanced',
    platforms: ['n8n'],
    description:
      'When a new employee is created, automatically: create their onboarding checklist, assign IT tasks, send welcome email, add to Slack channels.',
    steps: [
      'Webhook: employee.created',
      'POST /tasks — create "Set up laptop" task assigned to IT',
      'POST /tasks — create "Create email account" task assigned to IT',
      'POST /tasks — create "Office access card" task assigned to Admin',
      'Send welcome email via SMTP with onboarding guide',
      'Add to Slack #general and department channel via Slack API',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function — Create Tasks',
        content: `const employee = $input.first().json;
const tasks = [
  { title: "Set up laptop", assignee_dept: "IT" },
  { title: "Create email account", assignee_dept: "IT" },
  { title: "Office access card", assignee_dept: "Admin" },
  { title: "Add to payroll", assignee_dept: "Finance" },
];

return tasks.map(t => ({
  json: {
    method: "POST",
    url: "${API_BASE}/tasks",
    body: {
      title: \`\${t.title} for \${employee.first_name} \${employee.last_name}\`,
      description: \`New hire onboarding task for \${employee.first_name}\`,
      department: t.assignee_dept,
      priority: "high",
      due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
    }
  }
}));`,
      },
    ],
    important:
      "Make sure the new employee's bank details are entered during creation — they'll need them for payroll.",
  },
  {
    id: 'fleet-trip-report',
    icon: Truck,
    emoji: '🚚',
    title: 'Fleet Trip Report Aggregator',
    difficulty: 'Intermediate',
    platforms: ['Python', 'Node.js'],
    description:
      'Weekly script that aggregates trip data per vehicle and calculates fuel efficiency.',
    steps: [
      'Run weekly via cron or task scheduler',
      `GET ${API_BASE}/fleet/trips?date_from=last_week`,
      'Group trips by vehicle_id',
      'Calculate total distance, fuel consumed, and cost per vehicle',
      'Generate summary report and save to Google Drive or email',
    ],
    code: [
      {
        language: 'python',
        label: 'fleet_report.py',
        content: `import requests
from collections import defaultdict

API_KEY = "kdops_YOUR_KEY"
BASE = "${API_BASE}"
headers = {"Authorization": f"Bearer {API_KEY}"}

trips = requests.get(f"{BASE}/fleet/trips?date_from=last_week", headers=headers).json()

by_vehicle = defaultdict(list)
for trip in trips["data"]:
    by_vehicle[trip["vehicle_plate"]].append(trip)

for plate, vehicle_trips in by_vehicle.items():
    total_km = sum(t["distance_km"] for t in vehicle_trips)
    total_fuel = sum(t.get("fuel_litres", 0) for t in vehicle_trips)
    efficiency = total_km / total_fuel if total_fuel else 0
    print(f"{plate}: {len(vehicle_trips)} trips, {total_km:.0f} km, {efficiency:.1f} km/L")`,
      },
    ],
  },
  {
    id: 'leave-balance-alert',
    icon: CalendarDays,
    emoji: '🏖️',
    title: 'Leave Balance Alert System',
    difficulty: 'Beginner',
    platforms: ['n8n'],
    description:
      'Monthly check of leave balances — alert employees who have more than 15 days unused annual leave.',
    steps: [
      'Schedule trigger: 1st of each month at 9 AM WAT',
      `GET ${API_BASE}/leaves/balances`,
      'Filter employees with annual_leave_balance > 15',
      'Send email reminder to each employee to plan their time off',
      'Optionally notify HR manager with a summary',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function — Filter & Format',
        content: `const balances = $input.all().map(i => i.json);
const high = balances.filter(b => b.annual_leave_balance > 15);

return high.map(emp => ({
  json: {
    to: emp.email,
    subject: "Reminder: You have unused annual leave",
    body: \`Hi \${emp.name},\\n\\nYou currently have \${emp.annual_leave_balance} days of unused annual leave. Please plan some time off before year-end.\\n\\nBest,\\nHR Team\`
  }
}));`,
      },
    ],
    proTip:
      "Send a second alert at 20+ days and CC the employee's line manager.",
  },
  {
    id: 'form-submission-to-google-sheets',
    icon: CheckSquare,
    emoji: '📋',
    title: 'Task Form Submissions → Google Sheets',
    difficulty: 'Beginner',
    platforms: ['n8n', 'Zapier', 'Make'],
    description:
      'When someone submits a form/report in the task module, automatically log the submission data to a Google Sheet for tracking and analysis.',
    steps: [
      'Create a webhook in KDOps listening for task.form_submitted',
      'n8n/Zapier receives the POST payload with form fields, submitter, and task details',
      'Map the form fields to Google Sheets columns',
      'Append a new row to the tracking spreadsheet',
      'Optionally send a Slack notification to the team channel',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function — Transform Form Data',
        content: `const payload = $input.first().json;

return [{
  json: {
    submitted_by: payload.employee_name,
    submitted_at: payload.created_at,
    task_title: payload.task_title,
    form_name: payload.form_name,
    // Spread all form field values into columns
    ...payload.form_data,
    // Add a link back to the task in KDOps
    kdops_link: \`https://ops.kdsquares.com/tasks/\${payload.task_id}\`
  }
}];`,
      },
    ],
    proTip:
      'Use this to build custom reporting dashboards — pipe form submissions to Google Sheets, then connect Google Sheets to Data Studio or Looker for real-time charts.',
  },
];

const allPlatforms = Array.from(
  new Set(recipes.flatMap((r) => r.platforms))
).sort();

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 px-2 text-xs gap-1"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </Button>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = recipe.icon;

  return (
    <Card
      className={cn(
        'transition-all duration-200 cursor-pointer hover:shadow-md',
        'border-zinc-200 dark:border-zinc-800',
        expanded && 'ring-1 ring-blue-500/30'
      )}
    >
      <CardContent className="p-0">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left p-5 flex items-start gap-4"
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 flex items-center justify-center text-lg">
            {recipe.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                {recipe.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge
                className={cn(
                  'text-[10px] font-medium px-1.5 py-0 border-0',
                  difficultyColors[recipe.difficulty]
                )}
              >
                {recipe.difficulty}
              </Badge>
              {recipe.platforms.map((p) => (
                <Badge
                  key={p}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                >
                  {p}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
              {recipe.description}
            </p>
          </div>
          <div className="flex-shrink-0 mt-1 text-zinc-400">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-4">
            {/* Steps */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" /> Steps
              </h4>
              <ol className="space-y-1.5">
                {recipe.steps.map((step, i) => (
                  <li
                    key={i}
                    className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span className="font-mono break-all">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Important warning */}
            {recipe.important && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Important:</span>{' '}
                  {recipe.important}
                </p>
              </div>
            )}

            {/* Pro tip */}
            {recipe.proTip && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  <span className="font-semibold">Pro Tip:</span>{' '}
                  {recipe.proTip}
                </p>
              </div>
            )}

            {/* Code blocks */}
            {recipe.code?.map((block, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5" /> {block.label}
                  </h4>
                  <CopyButton text={block.content} />
                </div>
                <pre className="p-3 rounded-lg bg-zinc-900 dark:bg-zinc-950 text-zinc-100 text-[11px] leading-relaxed overflow-x-auto">
                  <code>{block.content}</code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Recipes() {
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'All'>(
    'All'
  );
  const [platformFilter, setPlatformFilter] = useState<string>('All');

  const filtered = recipes.filter((r) => {
    if (difficultyFilter !== 'All' && r.difficulty !== difficultyFilter)
      return false;
    if (platformFilter !== 'All' && !r.platforms.includes(platformFilter))
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Recipes & Use Cases
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Real-world automation examples you can copy and adapt. Connect KDOps
          to your favourite tools with these battle-tested workflows.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Difficulty:
          </span>
          {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map(
            (d) => (
              <Button
                key={d}
                variant={difficultyFilter === d ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setDifficultyFilter(d)}
              >
                {d}
              </Button>
            )
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Platform:
          </span>
          {['All', ...allPlatforms].map((p) => (
            <Button
              key={p}
              variant={platformFilter === p ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setPlatformFilter(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Showing {filtered.length} of {recipes.length} recipes
      </p>

      {/* Recipe grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-400 dark:text-zinc-500">
          <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No recipes match your filters.</p>
        </div>
      )}
    </div>
  );
}
