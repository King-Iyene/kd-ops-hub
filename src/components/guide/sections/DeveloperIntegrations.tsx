import { Code2 } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function DeveloperIntegrationsSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={Code2}
        title="Developer & Integrations"
        blurb="This section is for developers, super admins, and anyone who needs to work with KDOps at a technical level — the raw database browser, n8n automations, API access, webhooks, and how the platform's backend fits together. If you're not building integrations or troubleshooting data issues, you probably don't need any of this."
      />

      <ModuleCard title="Database Browser (/data)" route="/data" roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Database Browser at <code className="text-xs bg-muted px-1 py-0.5 rounded">/data</code> gives you a direct,
          read-only view into every Supabase table that powers KDOps. It's the developer's equivalent of opening pgAdmin or
          the Supabase dashboard — you can browse rows, search across columns, filter by any field, and export filtered
          results to CSV. Every table in the system is listed here: employees, payments, expenses, vehicles, leave requests,
          audit logs, and everything else.
        </p>
        <StepList
          steps={[
            'Navigate to /data from the browser address bar, or find Database under Admin in the sidebar.',
            'Browse the list of available tables on the left — click any table name to load its rows.',
            'Use the search bar at the top to find specific records across all visible columns.',
            'Click column headers to sort, or use the filter controls to narrow by specific field values.',
            'Click Export CSV to download the current filtered view for analysis in Excel or Google Sheets.',
          ]}
        />
        <Callout tone="tip">
          The Database Browser is read-only — you cannot create, edit, or delete records from here. If you need to
          fix data, do it through the relevant module (Employees, Payments, etc.) so that the audit trail captures
          the change properly. Direct database edits through Supabase's own dashboard bypass the audit log entirely.
        </Callout>
        <p className="text-sm font-medium pt-1">Common use cases</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>Verifying that a payment record was written correctly after a batch completes</li>
          <li>Checking foreign-key relationships (e.g. which employee ID is linked to a specific expense)</li>
          <li>Exporting raw data for custom reporting that the Reports module doesn't cover</li>
          <li>Debugging n8n automations by confirming what data was actually written to a table</li>
          <li>Auditing data integrity — spotting orphaned records, null fields that shouldn't be null, or duplicate entries</li>
        </ul>
      </ModuleCard>

      <ModuleCard title="Tables (Custom Data)" route="/tables" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tables (<code className="text-xs bg-muted px-1 py-0.5 rounded">/tables</code>) is the user-facing custom-data module — a
          spreadsheet-like interface for creating your own structured datasets inside KDOps. Unlike the Database Browser (which
          shows the platform's internal tables), Tables is for data <em>you</em> define: project trackers, inventory lists,
          vendor comparisons, or anything that would otherwise live in a shared Google Sheet. Each table has custom columns
          (text, number, date, select, checkbox, etc.), row-level data, and role-based access controls. Find it under{' '}
          <strong>Workspace → Productivity → Tables</strong>.
        </p>
        <StepList
          steps={[
            'Open Tables from the sidebar and click New Table.',
            'Name the table and define your columns — choose from text, number, date, single-select, multi-select, checkbox, URL, and email types.',
            'Add rows manually, or import from CSV to bulk-load existing data.',
            'Set access: choose which roles can view and which can edit the table.',
            'Share the table link with colleagues — they\'ll see it in their sidebar under Tables.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="n8n Automations" route={null} roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          KDOps uses <strong>n8n</strong> (self-hosted) as its workflow automation engine. n8n connects KDOps events to
          external systems and automates repetitive processes — sending Slack notifications when a payment is approved,
          syncing new employees to a Google Sheet, triggering an email sequence when onboarding starts, or any other
          multi-step workflow you can design.
        </p>
        <p className="text-sm font-medium pt-1">How it connects to KDOps</p>
        <StepList
          steps={[
            <>
              <strong>Webhooks (KDOps → n8n):</strong> KDOps fires webhook events when key actions happen — payment approved,
              expense submitted, employee created, leave approved, etc. Each webhook sends a JSON payload with the full record
              to an n8n webhook URL you configure. Set these up in <strong>Settings → Integrations → Webhooks</strong>.
            </>,
            <>
              <strong>Supabase triggers (database → n8n):</strong> For events KDOps doesn't expose as webhooks, you can set up
              Supabase database triggers that fire when rows are inserted, updated, or deleted in specific tables. n8n's
              Supabase node listens for these triggers and starts a workflow.
            </>,
            <>
              <strong>n8n → KDOps API:</strong> n8n can also <em>write back</em> to KDOps via the Supabase API — creating records,
              updating statuses, or inserting data into custom Tables. Use the Supabase node in n8n with your project's API URL
              and service role key.
            </>,
          ]}
        />
        <Callout tone="warn">
          n8n workflows that write to KDOps bypass the UI's validation and approval flows. A workflow that creates a payment
          record directly in Supabase skips the approval chain entirely. Design write-back workflows carefully, and test them
          against a staging environment before pointing them at production.
        </Callout>
        <p className="text-sm font-medium pt-1">Example automations</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>When a payment batch is approved → post a summary to #finance in Slack with the total amount and batch name</li>
          <li>When a new employee is created → add a row to the HR master Google Sheet and send a welcome email via SendGrid</li>
          <li>Daily at 8am → check for leave requests pending approval for more than 48 hours and nudge the approver via email</li>
          <li>When a fuel request is submitted → check the vehicle's monthly fuel spend against its budget and flag if over 80%</li>
          <li>When an expense is approved → update a custom Table that tracks department spend by category</li>
        </ul>
      </ModuleCard>

      <ModuleCard title="API Access (Supabase)" route={null} roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          KDOps is built on <strong>Supabase</strong> (hosted PostgreSQL + REST API + Realtime). Every table in the Database
          Browser is accessible via Supabase's auto-generated REST API — which means any external system that can make HTTP
          requests can read from or write to KDOps data.
        </p>
        <p className="text-sm font-medium pt-1">API credentials</p>
        <StepList
          steps={[
            <>
              <strong>Project URL:</strong> Your Supabase project URL (format: <code className="text-xs bg-muted px-1 py-0.5 rounded">
              https://&lt;project-ref&gt;.supabase.co</code>). Find this in the Supabase dashboard under Settings → API.
            </>,
            <>
              <strong>Anon key:</strong> The public API key — used for client-side requests that respect Row Level Security (RLS)
              policies. This is the key the KDOps frontend uses.
            </>,
            <>
              <strong>Service role key:</strong> The privileged API key — bypasses all RLS policies and has full read/write access
              to every table. Use this only in server-side scripts and n8n, never in client-side code or browser extensions.
            </>,
          ]}
        />
        <Callout tone="caution">
          The service role key has unrestricted access to all data including employee PII, salary information, and bank details.
          Treat it like a database root password: store it in environment variables or a secrets manager, never in source code,
          and never share it in Slack, email, or documentation.
        </Callout>
        <p className="text-sm font-medium pt-1">Common API patterns</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li><strong>Read:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">GET /rest/v1/employees?select=*&department=eq.Engineering</code></li>
          <li><strong>Create:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">POST /rest/v1/expenses</code> with a JSON body</li>
          <li><strong>Update:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">PATCH /rest/v1/employees?id=eq.abc123</code></li>
          <li><strong>Realtime:</strong> Subscribe to table changes via Supabase's WebSocket channel for live dashboards</li>
        </ul>
      </ModuleCard>

      <ModuleCard title="Webhooks" route={null} roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Webhooks let KDOps push event notifications to external URLs in real time — no polling required. When a configured
          event happens (a payment is approved, an employee is created, a leave request is submitted), KDOps sends an HTTP POST
          to the URL you specify, with a JSON payload containing the full event data.
        </p>
        <StepList
          steps={[
            'Go to Settings → Integrations → Webhooks.',
            'Click Add Webhook and give it a name (e.g. "Slack payment alerts").',
            'Paste the destination URL — typically an n8n webhook URL, a Zapier catch hook, or your own API endpoint.',
            'Select which events should trigger this webhook (payment.approved, employee.created, expense.submitted, etc.).',
            'Save — KDOps will send a test ping to verify the URL is reachable.',
          ]}
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Each webhook delivery is logged with its response status code, so you can see whether the receiving system
          acknowledged the event or returned an error. Failed deliveries are retried automatically up to 3 times with
          exponential backoff.
        </p>
      </ModuleCard>

      <ModuleCard title="Paystack Integration" route={null} roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          KDOps processes all bank transfers through <strong>Paystack</strong> (with Flutterwave as a secondary provider).
          The integration is configured in Settings → Integrations and affects every module that moves money: Payments,
          Payroll, Principal Disbursements, Expenses (reimbursements), and Staff Loans.
        </p>
        <p className="text-sm font-medium pt-1">Key technical details</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>Account name resolution uses Paystack's Resolve Account Number endpoint — entered account numbers are verified live against the receiving bank</li>
          <li>Transfer webhooks from Paystack update payment statuses in real time (processing → success/failed)</li>
          <li>The Dedicated Virtual Account (DVA) for Principal Disbursements is issued by Paystack and receives funds via standard bank transfer</li>
          <li>Transfer fees are recorded per-transaction in the Transactions ledger, not estimated</li>
        </ul>
        <Callout tone="warn">
          Rotating Paystack API keys while payment batches are in flight will cause those batches to fail. Always
          complete or cancel pending batches before updating keys in Settings.
        </Callout>
      </ModuleCard>
    </div>
  );
}
