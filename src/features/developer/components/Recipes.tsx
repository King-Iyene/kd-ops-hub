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
  'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/rest-api/v1';

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
    'bg-success/10 text-success dark:bg-success/10 dark:text-success',
  Intermediate:
    'bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning',
  Advanced: 'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive',
};

const recipes: Recipe[] = [
  {
    id: 'auto-create-employee',
    icon: Users,
    emoji: '👤',
    title: 'Stage New Hires from a Google Sheet into KDOps',
    difficulty: 'Beginner',
    platforms: ['n8n', 'Zapier'],
    description:
      'There\'s no REST endpoint to create an employee directly. Instead, stage new-hire rows from a Google Sheet into a KDOps Database (Bases) table that HR reviews — then HR creates the real employee record in KDOps, which fires employee.created for the rest of your automation.',
    steps: [
      'Trigger: Google Sheets → New Row Added',
      'One-time setup: create a "New Hires" base and table in the KDOps Database module with fields like Name, Email, Department, Start Date',
      `Action: HTTP Request to POST ${API_BASE}/bases/YOUR_BASE_ID/tables/YOUR_TABLE_ID/records`,
      'HR reviews the "New Hires" table and creates the real employee in KDOps — this fires employee.created, which you can chain further automation off',
    ],
    code: [
      {
        language: 'json',
        label: 'n8n HTTP Request Node',
        content: `{
  "method": "POST",
  "url": "${API_BASE}/bases/YOUR_BASE_ID/tables/YOUR_TABLE_ID/records",
  "headers": {
    "Authorization": "Bearer kdops_YOUR_KEY",
    "Content-Type": "application/json"
  },
  "body": {
    "records": [
      {
        "fields": {
          "Name": "{{ $json.Name }}",
          "Email": "{{ $json.Email }}",
          "Department": "{{ $json.Department }}",
          "Start Date": "{{ $json.StartDate }}"
        }
      }
    ]
  }
}`,
      },
    ],
    important:
      'This does not create an employee — there is currently no REST endpoint for that. It stages the data in a custom table for a human to action.',
    proTip:
      'Subscribe to employee.created (Webhooks tab) to trigger the "set up laptop" task and welcome email automatically once HR actually creates the employee.',
  },
  {
    id: 'daily-expense-report',
    icon: Receipt,
    emoji: '💰',
    title: 'Real-Time Expense Alerts to Slack (via Webhook)',
    difficulty: 'Beginner',
    platforms: ['n8n', 'Make'],
    description:
      "There's no REST endpoint to fetch expenses, so a scheduled \"yesterday's expenses\" digest isn't possible today. Instead, post to Slack the instant an expense is submitted, using the real expense.submitted webhook.",
    steps: [
      'Set up a webhook in KDOps for the expense.submitted event',
      'n8n/Make Webhook trigger receives the payload the moment someone submits an expense',
      'Format the payload into a Slack message',
      'Post to #finance Slack channel via Slack API',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function Node — Format Message',
        content: `const body = $input.first().json; // full webhook envelope: { event, timestamp, payload, ... }
const expense = body.payload;

return [{
  json: {
    text: \`*New Expense Submitted*\\n\` +
      \`Amount: *₦\${(expense.amount_ngn ?? 0).toLocaleString()}*\\n\` +
      \`Category: \${expense.category ?? 'n/a'}\\n\` +
      \`Description: \${expense.description ?? ''}\\n\` +
      \`Status: \${expense.status}\`
  }
}];`,
      },
    ],
    important:
      'The exact fields on expense.submitted vary depending on where the expense originates in KDOps — send a test delivery and inspect the payload before finalizing your Slack message.',
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
      'n8n Webhook trigger receives the payload — real fields are id, employee_name, amount_ngn, and status; it does not include a phone number or vehicle plate',
      'Add a lookup step (e.g., against a Database/Bases table you maintain) to resolve employee_name → phone number',
      'Send SMS via Termii HTTP API to the driver',
      'Append row to Google Sheet fleet tracker',
    ],
    code: [
      {
        language: 'json',
        label: 'Real fuel_request.approved Payload',
        content: `{
  "event": "fuel_request.approved",
  "timestamp": "2026-09-15T10:30:00Z",
  "base_id": "00000000-0000-0000-0000-000000000000",
  "table_id": "00000000-0000-0000-0000-000000000000",
  "payload": {
    "id": "fr-001",
    "employee_name": "Chioma Okafor",
    "amount_ngn": 30000,
    "status": "approved"
  },
  "old_payload": null
}`,
      },
      {
        language: 'json',
        label: 'Termii SMS Request',
        content: `{
  "to": "{{ $json.driver_phone }}",
  "from": "KDOps",
  "sms": "Hi {{ $json.payload.employee_name }}, your fuel request (₦{{ $json.payload.amount_ngn }}) has been approved. Please proceed to your usual fuel station.",
  "type": "plain",
  "channel": "generic",
  "api_key": "YOUR_TERMII_KEY"
}`,
      },
    ],
    important:
      'The employee must have valid bank details on file for the fuel disbursement to process. Also note: driver_phone above comes from your own lookup step, not from the KDOps payload.',
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
      'Map fields: name → company name, industry → industry (the payload does not include contact email or phone — add those in your CRM separately)',
      'Create company in CRM (HubSpot or Pipedrive)',
      'Optionally create a deal/contact linked to the company',
    ],
    code: [
      {
        language: 'json',
        label: 'Real client.created Payload',
        content: `{
  "event": "client.created",
  "timestamp": "2026-09-15T10:30:00Z",
  "base_id": "00000000-0000-0000-0000-000000000000",
  "table_id": "00000000-0000-0000-0000-000000000000",
  "payload": {
    "name": "MTN Nigeria",
    "industry": "Telecommunications",
    "status": "active",
    "contract_value_ngn": 15000000
  },
  "old_payload": null
}`,
      },
    ],
  },
  {
    id: 'payroll-report',
    icon: Banknote,
    emoji: '📊',
    title: 'Payroll Completion Notification (via Webhook)',
    difficulty: 'Intermediate',
    platforms: ['Python', 'Webhook'],
    description:
      "There's no REST read access to payroll runs or payslips, so pulling this data on a schedule isn't possible today. Instead, run a small webhook receiver that reacts the instant a payroll run completes and emails finance a notification.",
    steps: [
      'Set up a webhook in KDOps for payroll.run_started, payroll.run_completed, and payroll.slip_generated',
      'Run a lightweight webhook receiver (e.g., Flask) that KDOps can POST to',
      'On payroll.run_completed, email finance a notification with the period — link back into KDOps to review the actual figures',
    ],
    code: [
      {
        language: 'python',
        label: 'payroll_webhook_receiver.py',
        content: `from flask import Flask, request
import smtplib
from email.mime.text import MIMEText

app = Flask(__name__)

@app.route("/kdops-webhook", methods=["POST"])
def kdops_webhook():
    body = request.get_json()
    if body.get("event") == "payroll.run_completed":
        period = body["payload"]["period"]
        msg = MIMEText(
            f"Payroll for {period} has been completed and paid. "
            f"There is no API to pull payslip data directly, so the "
            f"full breakdown still needs to be viewed in KDOps."
        )
        msg["Subject"] = f"Payroll completed — {period}"
        msg["From"] = "bot@kdsquares.com"
        msg["To"] = "finance@kdsquares.com"
        with smtplib.SMTP("smtp.yourprovider.com") as server:
            server.login("bot@kdsquares.com", "YOUR_SMTP_PASSWORD")
            server.send_message(msg)
    return "", 200

# Register this endpoint's public URL as a webhook in KDOps
# (Developer Hub → Webhooks → Add Webhook) for the payroll.* events.`,
      },
    ],
    important:
      'This only tells you that a run finished — not the underlying numbers. Payroll figures still have to be viewed or exported from the KDOps UI; there is no REST endpoint for them.',
  },
  {
    id: 'task-deadline-reminder',
    icon: CheckSquare,
    emoji: '⏰',
    title: 'Task Deadline Reminder Bot — Not Currently Possible',
    difficulty: 'Beginner',
    platforms: ['n8n'],
    description:
      "Proactively reminding people about tasks due tomorrow requires querying tasks by due date. There's no REST endpoint for tasks today — and no scheduled/polling access to KDOps data outside of webhooks — so this isn't possible yet.",
    steps: [
      'Not currently possible: there is no REST endpoint to list or filter tasks (e.g. by due date)',
      'The closest real alternative is event-driven, not scheduled: subscribe to task.assigned and notify the assignee the moment a task is assigned, rather than the day before it\'s due',
    ],
    code: [
      {
        language: 'javascript',
        label: 'Alternative: notify on task.assigned (real webhook)',
        content: `// This reacts the instant a task is ASSIGNED — not "due tomorrow",
// since there's no way to query tasks by due date via the API today.
const body = $input.first().json;
const task = body.payload;

return [{
  json: {
    subject: \`New task assigned: "\${task.title}"\`,
    body: \`Hi,\\n\\nYou've been assigned a task: "\${task.title}".\\n\\nCheck KDOps for the due date and details.\\n\\nBest,\\nKDOps Bot\`
  }
}];`,
      },
    ],
    important:
      'This is not the same recipe as a deadline reminder — it fires on assignment, not the day before something is due. There is currently no way to build a true due-date reminder via the API.',
  },
  {
    id: 'invoice-payment-tracker',
    icon: FileText,
    emoji: '📝',
    title: 'Invoice Payment Tracker with Google Sheets',
    difficulty: 'Intermediate',
    platforms: ['Make', 'Zapier'],
    description:
      'Keep a Google Sheet automatically updated with invoice statuses using the real invoice webhooks.',
    steps: [
      'Set up webhooks: invoice.created, invoice.sent, invoice.paid (there is no invoice.overdue event — compute "overdue" yourself in the sheet by comparing due_date to today)',
      'On invoice.created: add a new row to Google Sheet with invoice details',
      'On invoice.sent: find the row by invoice_number and update status to "Sent"',
      'On invoice.paid: find the row and update status to "Paid"',
    ],
    code: [
      {
        language: 'json',
        label: 'Real invoice.created Payload',
        content: `{
  "event": "invoice.created",
  "timestamp": "2026-09-15T10:30:00Z",
  "base_id": "00000000-0000-0000-0000-000000000000",
  "table_id": "00000000-0000-0000-0000-000000000000",
  "payload": {
    "invoice_number": "INV-2026-019",
    "client_name": "Dangote Industries",
    "client_id": "cl-001",
    "client_email": "procurement@dangote.com",
    "issue_date": "2026-09-09",
    "due_date": "2026-10-30",
    "payment_terms": "net_30",
    "line_items": [{ "description": "Software Development — Phase 1", "amount_ngn": 3000000 }],
    "subtotal_ngn": 3000000,
    "vat_rate": 7.5,
    "vat_amount_ngn": 225000,
    "total_ngn": 3225000,
    "notes": "Payment due within 30 days."
  },
  "old_payload": null
}`,
      },
    ],
  },
  {
    id: 'employee-onboarding',
    icon: Zap,
    emoji: '🚀',
    title: 'Employee Onboarding Checklist Pipeline',
    difficulty: 'Advanced',
    platforms: ['n8n'],
    description:
      "When a new employee is created, log an onboarding checklist into a KDOps Database table and notify IT/Admin/Finance. There's no REST endpoint to create a task directly, so this logs a trackable checklist instead of creating real KDOps tasks.",
    steps: [
      'Webhook: employee.created',
      `POST ${API_BASE}/bases/YOUR_BASE_ID/tables/YOUR_TABLE_ID/records — create one row per onboarding checklist item ("Set up laptop", "Create email account", "Office access card", "Add to payroll")`,
      'Send a Slack message or email to IT/Admin/Finance listing the checklist, since there\'s no REST endpoint to create an actual KDOps task for them to work from',
      'Add the new hire to Slack #general and their department channel via the Slack API',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function — Log Checklist to Database API',
        content: `const employee = $input.first().json.payload; // employee.created payload: { email, full_name, role }

const checklist = [
  { item: "Set up laptop", owner_dept: "IT" },
  { item: "Create email account", owner_dept: "IT" },
  { item: "Office access card", owner_dept: "Admin" },
  { item: "Add to payroll", owner_dept: "Finance" },
];

return [{
  json: {
    method: "POST",
    url: "${API_BASE}/bases/YOUR_BASE_ID/tables/YOUR_TABLE_ID/records",
    body: {
      records: checklist.map(c => ({
        fields: {
          "Item": c.item,
          "Owner Dept": c.owner_dept,
          "New Hire": employee.full_name,
          "New Hire Email": employee.email,
          "Status": "Pending"
        }
      }))
    }
  }
}];`,
      },
    ],
    important:
      "There's no REST endpoint to create a KDOps task directly — this logs the checklist into a Database (Bases) table instead, and a person still needs to do the work and check it off. Make sure the new employee's bank details are entered — they'll need them for payroll.",
  },
  {
    id: 'fleet-trip-report',
    icon: Truck,
    emoji: '🚚',
    title: 'Fleet Trip Log to Google Sheets (via Webhook)',
    difficulty: 'Intermediate',
    platforms: ['n8n', 'Webhook'],
    description:
      "There's no REST endpoint to query trips, so pulling a week of data on a schedule isn't possible today. Instead, log every trip to a Google Sheet the instant it's completed, using the real trip.completed webhook, then aggregate weekly totals in the sheet itself.",
    steps: [
      'Set up a webhook in KDOps for the trip.completed event',
      'n8n Webhook trigger receives the payload each time a trip finishes',
      'Append a row to a Google Sheet with vehicle, driver, distance, and duration',
      'Use a Sheets pivot table (or scheduled Apps Script) to aggregate weekly totals per vehicle — the aggregation happens in the sheet, not by querying KDOps again',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function — Format Row',
        content: `const body = $input.first().json;
const trip = body.payload;

return [{
  json: {
    logged_at: body.timestamp,
    vehicle_id: trip.vehicle_id,
    driver_id: trip.driver_id,
    end_location: trip.end_location,
    distance_km: trip.distance_km,
    duration_min: trip.duration_min,
  }
}];`,
      },
    ],
    proTip:
      'The payload only gives you vehicle_id and driver_id, not human-readable names — join against a Database/Bases table you maintain if you want plate numbers or driver names in the sheet.',
  },
  {
    id: 'leave-balance-alert',
    icon: CalendarDays,
    emoji: '🏖️',
    title: 'Leave Request Activity Log (via Webhook)',
    difficulty: 'Beginner',
    platforms: ['n8n'],
    description:
      "There's no REST endpoint to read leave balances, so a proactive \"you have 15 unused days\" alert isn't possible today. Instead, log every leave.requested/approved/rejected/cancelled event to a Google Sheet in real time, which HR can scan for patterns.",
    steps: [
      'Set up webhooks for leave.requested, leave.approved, leave.rejected, and leave.cancelled',
      'n8n receives each event the moment it happens',
      'Append a row to a Google Sheet with employee, leave type, dates, and status',
      'HR reviews the sheet periodically, or builds a pivot table to spot employees taking little or no leave',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function — Format Row',
        content: `const body = $input.first().json;
const leave = body.payload;

return [{
  json: {
    logged_at: body.timestamp,
    event: body.event,
    employee_id: leave.employee_id,
    leave_type: leave.leave_type,
    start_date: leave.start_date,
    end_date: leave.end_date,
    days_requested: leave.days_requested,
  }
}];`,
      },
    ],
    important:
      "There's no REST endpoint to read leave balances directly. This log approximates usage patterns over time from webhook activity — it isn't the same as querying real-time balances.",
  },
  {
    id: 'form-submission-to-google-sheets',
    icon: CheckSquare,
    emoji: '📋',
    title: 'Task Form Submissions → Google Sheets',
    difficulty: 'Beginner',
    platforms: ['n8n', 'Zapier', 'Make'],
    description:
      'When someone submits a task form, automatically log the submission data to a Google Sheet for tracking and analysis.',
    steps: [
      'Create a webhook in KDOps listening for task.form_submitted',
      'n8n/Zapier receives the full webhook envelope — the actual form data is nested under payload.submitted_values, with the created task under payload.task',
      'Map the form fields to Google Sheets columns',
      'Append a new row to the tracking spreadsheet',
      'Optionally send a Slack notification to the team channel',
    ],
    code: [
      {
        language: 'javascript',
        label: 'n8n Function — Transform Form Data',
        content: `const envelope = $input.first().json;
const { form_name, task, submitted_values } = envelope.payload;

return [{
  json: {
    submitted_at: envelope.timestamp,
    form_name,
    task_title: task?.title ?? '',
    task_priority: task?.priority ?? '',
    // Spread all form field values into columns
    ...submitted_values,
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
                  'text-3xs font-medium px-1.5 py-0 border-0',
                  difficultyColors[recipe.difficulty]
                )}
              >
                {recipe.difficulty}
              </Badge>
              {recipe.platforms.map((p) => (
                <Badge
                  key={p}
                  variant="outline"
                  className="text-3xs px-1.5 py-0"
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
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-3xs font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span className="font-mono break-all">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Important warning */}
            {recipe.important && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10/20 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Important:</span>{' '}
                  {recipe.important}
                </p>
              </div>
            )}

            {/* Pro tip */}
            {recipe.proTip && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/20">
                <Lightbulb className="h-4 w-4 text-primary dark:text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-primary dark:text-primary">
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
                <pre className="p-3 rounded-lg bg-zinc-900 dark:bg-zinc-950 text-zinc-100 text-2xs leading-relaxed overflow-x-auto">
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
