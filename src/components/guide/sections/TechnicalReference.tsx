// Technical Reference — consolidated content of the former 9-tab "System
// Reference" UI in src/pages/Guide.tsx. Every RefSection, RefTable row, and
// paragraph of prose from those tabs lives here verbatim, split into plain
// labeled <section> blocks (no Tabs/TabsList/TabsTrigger/TabsContent) so it
// can be composed into the new Guide page shell.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefTable, RefSection } from '@/components/guide/shared';
import {
  Activity, Archive, BarChart2, BookOpen, Briefcase, CalendarCheck2, Car,
  CheckCircle2, CreditCard, Database, FilePlus2, FileWarning, FolderKanban,
  FolderOpen, Fuel, Globe, GraduationCap, HardDrive, HeartPulse, History,
  Lock, Package, Receipt, RefreshCw, Shield, ShieldAlert, ShieldCheck,
  Sparkles, Star, Store, UserCheck, UserPlus2, Users, Wallet, Zap,
} from 'lucide-react';

export function TechnicalReferenceSection() {
  return (
    <div className="space-y-10">
      {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
      <section id="tech-overview" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Change History & Overview</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Platform change history
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2 leading-relaxed">
            <p><strong>Phase 1 — Tighter access control.</strong> Only the right people can see audit logs, tasks, comments, referrals, and deductions. Webhook duplicates from Paystack no longer create duplicate transactions. Two missing tables (salary increments, revenue entries) were added.</p>
            <p><strong>Phase 2 — More resilient pages.</strong> A bug on one page no longer brings down the whole app — the user sees a friendly error message instead. The Payments page is much faster (was making many small database calls in a loop). Background refreshing slows down when a tab is inactive. Long employee profiles now use page navigation.</p>
            <p><strong>Phase 3 — Sanity checks &amp; receipts.</strong> The database now rejects unrealistically large amounts (e.g. ₦50 billion typed by accident). Risky file types (.exe, .html, .js) are blocked from upload. A "Reconcile" button on Payments re-checks stuck transfers. Every login and logout is recorded in the audit log.</p>
            <p><strong>Phase 4 — Login &amp; browser security.</strong> 5 wrong passwords in 15 minutes briefly locks the account. Failed attempts are saved for admins to review. The browser is told which servers it can talk to so injected scripts can't reach unknown sites. App-wide error reporting is wired up (Sentry-ready).</p>
            <p><strong>Phase 5–14 — Feature build-out.</strong> Two-approver workflow for big expenses, budget locking, leave balance tracking, payroll advances, virtual cards, knowledge base, goals, announcements, compliance calendar, and contractor profiles.</p>
            <p><strong>Phase 15 — Always fresh data.</strong> When you switch back to a browser tab, lists automatically pull the latest numbers so you never see stale data.</p>
            <p><strong>P0 Go-live hardening.</strong> Admins can first-approve their own expenses (others can't). The Approvals page caps how many rows it loads at once. Our server APIs reject calls from unknown websites. Database queries are faster thanks to indexes. Passwords must be 12+ characters with letters and numbers. Logging out cleans up live data subscriptions. All file uploads are limited to 10 MB.</p>
            <p><strong>P1 — Payments page crash fixed.</strong> The page used to crash with "Cannot access before initialization" because some code ran in the wrong order. The fix is now enforced automatically by the linter, so it cannot come back.</p>
            <p><strong>P1 — Safer delete.</strong> Deleting an expense, document, budget, leave request, or fuel request no longer wipes it permanently. The row is hidden from every screen but stays in the database, so an admin can recover it from the Supabase dashboard if it was a mistake.</p>
            <p><strong>P1 — Query caps everywhere.</strong> Every list in the app now has a maximum number of rows it fetches at once. This stops pages from getting slower as your data grows. Covers Dashboard, Budgets, Leave, Approvals, Fleet, Reports, plus supporting lists (departments, budget line items, knowledge versions, employee directories, tags).</p>
            <p><strong>P1 — Auto-trim.</strong> Spaces accidentally typed before or after a value (company name, RC number, TIN, address, website, payment batch name) are stripped automatically before saving.</p>
            <p><strong>P1 — No more double-clicks.</strong> Buttons like Submit, Approve, Lock, Delete on Budgets — and Add note, Affiliate toggle, Deactivate elsewhere — grey out the moment you click them. The screen updates immediately; if the server rejects the change, the screen reverts and shows an error.</p>
            <p><strong>P1 — Branded confirmation pop-ups.</strong> When you delete a subscription, revert a leave approval, or delete an employee document, you see the app's own confirmation box instead of the plain browser pop-up. Same look and feel everywhere.</p>
            <p><strong>P1 — Screen-reader friendliness &amp; cleaner CSV.</strong> Buttons that show only an icon (Pause, Edit, Delete, History) now announce what they do to assistive technology. CSV exports of Contacts, Goals, and Referrals show dates as 27/04/2026 instead of raw timestamps like 2026-04-27T14:00:00Z.</p>
            <p><strong>P1 — Clients module.</strong> New CRM page to track clients (active, inactive, prospect) with contract values, contact details, industry, start date, and notes. Includes search, status filter, pagination, CSV export, and soft delete. Accessible under CRM → Clients in the sidebar.</p>
            <p><strong>P1 — Paystack fee fix.</strong> The Paystack Fees figure on Reports was always ₦0 because the per-transfer fee column is only populated after a real Paystack webhook fires. The calculation now falls back to an estimate (1.5% of transfer amount, minimum ₦50, maximum ₦2,000) for transfers where the actual fee has not yet been recorded, so the Reports P&amp;L shows a realistic figure even during testing.</p>
            <p><strong>P1 — Mobile dialogs &amp; date sanity.</strong> Forms on Compliance and Budgets no longer overflow on small screens — they now scroll inside the dialog instead of running off the page. Date inputs (Client start date, Expense date, Budget periods) now reject unrealistic years like 1900 or 9999, and the budget end date can never be set before the start date.</p>
            <p><strong>P1 — Faster client entry.</strong> The "Add Client" form now puts the cursor in the Name field automatically, so you can start typing immediately without clicking. The Compliance page also shows a friendly "No filings yet" message with guidance for new admins instead of an empty table.</p>
            <p><strong>P1 — Dashboard discovery.</strong> The new Clients module now appears in the Dashboard's Quick Actions panel so it's reachable in one click from anywhere in the app.</p>
            <p><strong>P1 — Client profile pages.</strong> Clicking on any client in the Clients list now opens a dedicated profile page for that client. From there you can edit all details, track contract value, change their status (active / inactive / prospect), and add timestamped notes — the same way you can add notes on a Contact profile. The remove button on the profile also works like the list view: the client is hidden but kept in the database.</p>
            <p><strong>P1 — Compliance keyboard shortcut.</strong> In the "New statutory filing" form, pressing Enter now saves the filing — just like clicking the "Save filing" button. This saves time when quickly logging multiple filings in a row.</p>
            <p><strong>P1 — Reports stopped guessing Paystack fees.</strong> The P&amp;L and Payments reports used to show an estimated Paystack fee figure (1.5% of the transfer amount) which was almost never accurate. The "Paystack Fees" stat card and chart bar have been removed from both the P&amp;L and Payments tabs in Reports. The actual fees Paystack charges (e.g. ₦10 per transfer, plus stamp duty) appear as real entries on the Transactions page, where they naturally count toward what you spent.</p>
            <p><strong>P1 — Friendlier Clients error.</strong> If the Clients table has not been created in the database yet, the page used to show a confusing "schema cache" error from Supabase. It now shows a clear message explaining that the database migration needs to be deployed by running "supabase db push" — so admins know exactly what to do.</p>
            <p><strong>P1 — Paystack fees as separate rows in Transactions.</strong> The Transactions page now shows Paystack transfer fees as their own rows — exactly like the Paystack ledger does. Each completed transfer that has a recorded fee produces a "Charge for transfer: TRF_xxx" row (in amber) directly below the transfer itself. Clicking a fee row navigates to the same batch detail page as the transfer. A "Fees" tab lets you filter to fee rows only.</p>
            <p><strong>P1 — Paystack fees count toward P&amp;L and Payment costs.</strong> Reports now includes real Paystack transfer fees (from webhook data, never estimated) in operating costs. The P&amp;L tab shows a "Paystack Fees" stat card and stacks fees in the monthly chart. Net Profit is now Revenue − disbursements − expenses − actual Paystack fees. The Payments tab also shows a Paystack Fees total, and the CSV export includes the fee column per batch.</p>
            <p><strong>Phase 2 — Invoices module.</strong> A full Invoices page (Finance → Invoices in the sidebar) lets you create, send, and track client invoices. Each invoice supports dynamic line items, Nigerian VAT at 7.5% (configurable to 0 / 5 / 7.5 / 10%), and a clear status workflow: draft → sent → paid | overdue | cancelled. Overdue is detected automatically — no scheduled job needed. Invoices are linked to the Clients CRM. Print-ready view and CSV export included.</p>
            <p><strong>Phase 2 — Dashboard expiry alerts.</strong> The Dashboard now shows an amber alert panel for anything that needs attention in the next 30 days: documents whose expiry date is approaching and compliance filings whose due date is close. Clicking an alert takes you directly to the Documents or Compliance page. Only visible to Finance / Admin / Super Admin roles (not personal dashboards).</p>
            <p><strong>Phase 3 — Vendor Registry.</strong> A dedicated Vendors page (Operations group in the sidebar) stores all suppliers — utilities, SaaS, service providers, logistics partners. Each vendor record holds contact info, CAC RC number, TIN, bank details, payment terms, and contract start/end dates. Contracts expiring within 30 days surface as amber badges. Soft delete and CSV export included. Accessible to Finance, Operations, Admin, and Super Admin.</p>
            <p><strong>Phase 3 — Petty Cash Management.</strong> The Petty Cash page (Finance group) lets you create one or more cash funds (e.g. "Head Office Float", "Lagos Branch"). Each fund has a custodian, an opening balance, and a running current balance that is automatically recalculated by a database trigger after every entry. Disbursements and replenishments are recorded individually with date, purpose, payee, and category. Low-balance alerts appear when a fund drops below ₦5,000.</p>
            <p><strong>Phase 3 — Performance Reviews.</strong> The Performance page (Operations group) introduces structured review cycles — annual, mid-year, quarterly, or probation. Each cycle contains individual reviews (manager, self-assessment, or peer). Reviewers rate employees on five competencies (Delivery, Communication, Teamwork, Initiative, Leadership) on a 1–5 scale; the overall rating is computed as the average. Status flow: draft → submitted → acknowledged. A progress bar on each cycle shows how many reviews have been submitted. Overdue cycles are flagged in red.</p>
            <p><strong>Phase 3 — Petty Cash removed.</strong> The Petty Cash module was built but removed at the user's request — all expenses go through bank transfers and the Expenses module, making a separate cash float tracker redundant. The underlying database tables (petty_cash_funds, petty_cash_entries) remain in the schema but the UI is gone.</p>
            <p><strong>Phase 4 — Asset Register.</strong> A fixed assets page (Finance → Assets) tracks every company asset — IT equipment, motor vehicles, furniture, plant &amp; machinery, buildings, and leasehold improvements. Book value is calculated live using straight-line or reducing-balance depreciation. CITA capital allowance rates (initial and annual) are pre-filled by asset category per Nigerian Companies Income Tax Act rules. Insurance expiry dates trigger 30-day amber badges. Assets can be assigned to employees and departments. Disposed and written-off assets are tracked separately from active ones. CSV export included.</p>
            <p><strong>Phase 4 — Employee Loans removed.</strong> A standalone Loans module was built but removed — the existing employee_advances system in Payroll already handles staff advances with monthly deductions, auto-settlement, and payroll integration. The loan migration (employee_loans table) remains in the schema but the UI is gone.</p>
            <p><strong>Phase 4 — Training &amp; Certifications.</strong> The Training page (Operations → Training) records every employee course and certification. Certifications with expiry dates automatically show as "Expired" when past due — no job needed. Expiry dates within 30 days surface as amber badges. Mandatory training (safety, compliance) is flagged separately from optional development. Filters by employee, type, category, and status. CSV export included. Training costs are tracked for budget analysis.</p>
            <p><strong>Phase 5 — Project Tracker.</strong> A Projects page (Workspace group) links projects to clients (CRM), owners, and departments. Status workflow: planning → active → on_hold → completed / cancelled. Priority levels: critical, high, normal, low. Budget in ₦. Inline milestones with drag-sortable order — mark each milestone complete with a single click. Linked tasks from the Tasks module are counted and displayed per project. Overdue detection on active projects whose end date has passed. CSV export included.</p>
            <p><strong>Phase 5 — Employee Benefits.</strong> A Benefits page (Operations group) tracks all statutory and voluntary benefits per employee: HMO (NHIS), Pension (PFA with RSA PIN), Group Life, and other benefits. Premium amounts and frequency (monthly / quarterly / annually) are stored; monthly equivalent is computed on the fly. Expiry dates within 30 days surface as amber badges. Summary cards show active enrolment counts by type. CSV export included.</p>
            <p><strong>Phase 5 — Onboarding &amp; Offboarding.</strong> An Onboarding page (Operations group) manages joining and exit checklists for employees. Creating a checklist pre-populates it with 11 default onboarding items (documentation, IT setup, HR admin, finance, training, equipment, introduction) or 8 offboarding items — or you can start blank. Each item can be assigned to a team member with a due date. Tick items complete individually; a progress bar shows overall completion. Status is derived in-app (pending / in-progress / completed) — no DB trigger needed. CSV export included.</p>
            <p><strong>Phase 6 — Recruitment Pipeline.</strong> A Recruitment page (Operations group) manages the full hiring lifecycle: create job openings with title, department, employment type (full-time / part-time / contract / intern), salary range, and closing date. Add applicants to each opening; move them through the pipeline stages: New → Screening → Interview 1 → Interview 2 → Offer → Hired / Rejected. Record interview dates, assigned interviewers, offer amounts, and rejection reasons. Stage-filter buttons on each opening show counts per stage. Summary cards track active openings, total applicants, offers out, and hired count. CSV export included.</p>
            <p><strong>Phase 6 — Attendance &amp; Timesheets.</strong> An Attendance page (Operations group) records daily attendance per employee. Each record captures clock-in and clock-out times (stored as TIME — single-timezone Nigeria WAT), attendance status (present / absent / late / half-day / remote / on-leave / public holiday), and overtime minutes. One record per employee per date is enforced by a UNIQUE constraint — upsert on conflict handles re-submission. The page shows a month navigator with a running summary of present, late, absent, and on-leave counts. Overtime hours are totalled for the period. CSV export per month included.</p>
            <p><strong>Phase 6 — Disciplinary Records.</strong> A Disciplinary page (Admin + Super Admin only) manages formal HR actions per Nigerian Labour Act requirements. Incident types cover the full ladder: verbal warning → written warning → final warning → query / show-cause → suspension → termination, plus counselling and other. Each record stores the subject, incident details, formal outcome, and the number of suspension days (if applicable). Employees can formally respond to queries (show-cause letters) via the built-in response thread. Records can be acknowledged (confirming the employee received the notice — required for fair hearing) and expunged with a reason after a clean-record period. Expunged records remain in the audit trail but are hidden from active history unless "Show expunged" is toggled. CSV export included.</p>
            <p><strong>Phase 7 — Fleet Intelligence.</strong> The Fleet Dashboard tab now opens with a Fleet Insights Panel — a composite health score (0–100%) for each vehicle based on fuel efficiency (20%), maintenance compliance (30%), document/compliance status (30%), and inspection results (20%). Smart insights engine generates actionable alerts: overdue maintenance, budget overruns, anomaly rates above 15%, unresolved inspection defects, low fuel efficiency, and week-over-week spend trends. Quick action buttons jump to inspections, maintenance, anomalies, or compliance. Below the insights panel, a Fuel Cost Optimizer ranks vehicles by cost-per-km over 30 days, highlights the best fuel station by average price per litre, and calculates monthly savings opportunity by bringing worst performers to fleet average.</p>
            <p><strong>Phase 7 — Inspection Defect Resolution.</strong> Inspection defects now have a structured resolution workflow. Each defect card shows a green "Resolve" button that opens a dialog with 8 action options: repaired, replaced, adjusted, cleaned, calibrated, temporary_fix, deferred, or not_required. Resolution includes optional repair cost (₦) and notes. Resolved defects show a green "Resolved" badge with the action taken. Available to all authenticated users, not just admins.</p>
            <p><strong>Phase 7 — Document Management Overhaul.</strong> The Documents page was completely rebuilt. New features: (1) Folder system — create folders with custom colors, navigate with breadcrumbs, nest documents inside folders. (2) Entity linking — tag any document to a client, employee, vehicle, or project for cross-referencing. (3) Drag &amp; drop upload — drop files anywhere on the page. (4) Bulk upload — select multiple files at once with a progress bar. (5) Grid + list view toggle. (6) Dashboard stats cards showing total docs, expiring soon, expired, linked count, and folder count. (7) Entity filter in toolbar — filter by client/employee/vehicle/project/unlinked. (8) Document detail dialog with full metadata. (9) Template flag for reusable documents. (10) Access tracking — records last_accessed_at and access_count on every download. (11) Expanded categories: contract, agreement, receipt, invoice, ID document, policy, report, proposal, letter, certificate, license, insurance, tax, HR, onboarding, template, other. Upload roles expanded to include finance and operations (not just admin).</p>
            <p><strong>Security audit remediation (2026-08-15/16).</strong> A forensic security/ops audit and a separate mobile/design audit both ran against the live system; every Critical and High finding, plus the highest-value Medium findings, were actioned: (1) Closed 53 RLS policies across the database that used <code>USING (true)</code> — including contractors' bank details, which were readable and writable by any authenticated user. (2) Fixed 3 edge function bugs: <code>record-failed-login</code> threw a ReferenceError on every call, <code>data-retention-runner</code> had an auth bypass via a spoofable request-body flag, <code>send-email</code> let any authenticated user send email/SMS as the company (now restricted to super_admin/admin/operations). (3) Restored server-side MFA step-up (password + fresh TOTP code) for payment/expense approvals — a full step-up system existed before but was silently deleted in a later "remove restrictions" migration with no server-side AAL2 check left behind. Rebuilt it as opt-in (<code>company_settings.approval_step_up_required</code>, off by default) since 0 of 10 current approvers had TOTP enrolled at the time — a super_admin turns it on from Settings → Security once approvers are enrolled, and a live "X of Y enrolled" counter prevents flipping it on blind. (4) Closed a latent gap where the <code>employee_earnings</code> table's broad-access policy fix only worked because the original broad policy never actually ran in production — a fresh database rebuild would have silently reopened it; now explicitly dropped by name. (5) Mobile/UI audit Tier 1: 44px minimum touch targets app-wide (was as low as 32px on approve/reject buttons), lazy-loaded the receipt PDF libraries (removed 181 kB from every batch page load), replaced all 23 native browser confirm() popups with a proper in-app dialog — including the two irreversible payroll actions (recall a run to draft, delete a draft) that were previously bare OS alerts, added mobile card views to the money-critical tables that had none, added proper form labels to the highest-traffic forms (bank/salary fields previously had zero screen-reader association), and migrated the highest-traffic dialogs to a bottom-sheet layout on mobile.</p>
            <p><strong>Pre-launch hardening (2026-04-29).</strong> Six go-live blockers and four high-priority issues resolved before production launch: (1) Batch payments now run server-side (edge function, 50-item chunks, 8-way concurrency, 120 s budget) — a 1,000-transfer batch completes in ~3.5 min regardless of tab state. A pg_cron watchdog fires every minute to rescue orphaned batches. (2) Optimistic concurrency guard prevents double-payment when two admins click Process simultaneously. (3) Paystack fees now display on batch items and fuel requests with a three-tier fallback (webhook data → raw JSON → tier estimate). (4) Fleet Activity tab restricted to admin/finance/super_admin; PermissionsEditor updated with fleet.view_activity key. (5) Security hardening: BEFORE UPDATE trigger blocks role self-elevation, transactions_view switched to security_invoker, company_settings locked to admin/finance/super_admin, fuel request RLS widened to include finance role. (6) Hot-table indexes added on audit_logs, notifications, and batch_items. Status preconditions added to all state transitions (batch and fuel) to prevent stale-state races. CI workflow added (lint + typecheck + build on every push to main).</p>
            <p className="text-muted-foreground border-t pt-2 mt-2">
              Database changes live in <code>supabase/migrations/</code> · Server-side helpers in <code>supabase/functions/</code> · After deploying, run <code>supabase db push</code> to apply any new database changes.
            </p>
          </CardContent>
        </Card>

        <RefSection icon={Wallet} title="Money caps (all modules)">
          <RefTable
            cols={['What', 'Maximum', 'Why']}
            rows={[
              { a: 'Single payment batch (total)',      b: '₦5,000,000,000', c: 'Catches typo on bulk runs' },
              { a: 'Single transfer (one beneficiary)', b: '₦100,000,000',   c: 'Single Paystack transfer guard' },
              { a: 'One expense submission',            b: '₦100,000,000',   c: 'Catches accidental extra digit' },
              { a: 'One fuel request',                  b: '₦5,000,000',     c: 'Highest plausible single fuel-up' },
              { a: 'One subscription',                  b: '₦50,000,000',    c: 'SaaS / utility max' },
              { a: 'One revenue entry',                 b: '₦5,000,000,000', c: 'Monthly revenue ceiling' },
              { a: 'Annual budget (per category)',      b: '₦5,000,000,000', c: 'Yearly planning ceiling' },
              { a: 'Salary advance',                    b: '₦50,000,000',    c: 'Per-employee advance' },
              { a: 'Annual salary',                     b: '₦100,000,000',   c: 'Per-employee yearly comp' },
            ]}
          />
        </RefSection>

        <RefSection icon={Sparkles} title="What we polished recently (in plain English)">
          <RefTable
            cols={['What you will notice', 'How it works']}
            rows={[
              { a: 'Branded "Are you sure?" pop-ups',      b: 'Deleting a subscription, reverting a leave approval, removing an employee document, or running Reconcile on Payments now shows the app\'s own confirmation box instead of the plain browser one.' },
              { a: 'No accidental double-clicks',          b: 'Buttons like Submit, Approve, Lock, Delete (Budgets), Add note (Contacts), Affiliate toggle (Referrals), Deactivate (Contractors) grey out the moment you click them — so the same change cannot be made twice.' },
              { a: 'Instant on-screen feedback',           b: 'Toggling an affiliate, deactivating a contractor, or adding a note updates the screen straight away. If the server rejects the change, the screen reverts and you see an error.' },
              { a: 'Friendlier for screen readers',        b: 'Icon-only buttons (Pause, Edit, Delete, History) now announce what they do to assistive technology — important for low-vision or keyboard-only users.' },
              { a: 'Cleaner dates in CSV exports',         b: 'Contacts, Goals, and Referrals CSV exports show dates like 27/04/2026 instead of raw timestamps like 2026-04-27T14:00:00Z.' },
              { a: 'Stray spaces auto-stripped',           b: 'Spaces accidentally typed before or after company name, RC number, TIN, website, address, or payment batch name are removed automatically before saving.' },
              { a: 'No silent page failures',              b: 'If a page can\'t load its data (e.g. brief network issue), you see a red error toast — never a blank screen with no explanation.' },
              { a: 'Click a client to open its profile',  b: 'Clicking any row in the Clients list opens a full profile page where you can edit details, add notes, and change status — without opening a small dialog.' },
              { a: 'Notes on client profiles',            b: 'You can add timestamped notes to any client the same way you can for Contacts. Each note shows the date and time it was added, and the full history is visible in one place.' },
              { a: 'Enter key saves compliance filings',  b: 'In the "New statutory filing" form, pressing Enter submits the form — useful when adding several filings quickly without reaching for the mouse.' },
              { a: 'No more guessed Paystack fees',        b: 'Reports used to show an estimated 1.5% Paystack fee figure that was almost always wrong. That stat card and chart bar are gone — actual transfer fees (₦10 charges, stamp duty etc.) appear as real entries on the Transactions page and naturally count toward operating costs.' },
              { a: 'Helpful Clients setup message',        b: 'If an admin opens the Clients page before the database migration has been deployed, the page now says "ask an admin to run supabase db push" instead of a confusing "schema cache" error.' },
              { a: 'Paystack fees as their own rows',       b: 'Each completed Paystack transfer now generates a separate "Charge for transfer: TRF_xxx" row (shown in amber) in the Transactions list — the same way the Paystack ledger shows it. Use the Fees filter tab to view only fee rows. The TRF reference matches Paystack\'s own ledger exactly.' },
              { a: 'Paystack fees in P&L and Payments',     b: 'Real transfer fees (from webhook data, never estimated) now count toward operating costs in Reports. P&L shows a dedicated "Paystack Fees" card and stacks fees in the chart. Net Profit = Revenue − disbursements − expenses − fees.' },
              { a: 'Invoices module',                       b: 'Finance can now create and send invoices to clients with line items, VAT (default 7.5% Nigerian standard), and a status workflow (draft → sent → paid / overdue / cancelled). Overdue is auto-detected by comparing due_date to today. Print-ready layout and CSV export included.' },
              { a: '30-day expiry alerts on Dashboard',     b: 'An amber panel on the main Dashboard shows documents expiring soon and compliance filings due within 30 days. Clicking takes you straight to the relevant page. Visible to Finance / Admin / Super Admin only.' },
              { a: 'Vendor Registry',                       b: 'A Vendors page stores all suppliers with contact info, bank details, CAC/TIN, payment terms, and contract dates. Contracts expiring within 30 days are flagged in amber — no more scrambling to find a supplier\'s bank account before a payment.' },
              { a: 'Petty Cash Management',                 b: 'Create cash funds with custodians. Each disbursement or replenishment adjusts the running balance instantly (via a DB trigger). Low-balance warning shows when a fund drops below ₦5,000. Export a fund\'s full history to CSV.' },
              { a: 'Performance Reviews',                   b: 'Run structured review cycles (annual / mid-year / quarterly / probation). Rate employees on five competencies (1–5 stars). Manager, self-assessment, and peer reviews are tracked separately. A progress bar shows how many reviews have been submitted in each cycle.' },
              { a: 'Asset Register',                        b: 'Track fixed assets with live book value (straight-line or reducing-balance depreciation). CITA capital allowance rates are pre-filled by category. Insurance expiry triggers 30-day alerts. Assets can be assigned to employees and departments. Disposal and write-off tracking included.' },
              { a: 'Training & Certifications',             b: 'Record courses and certifications per employee. Certifications auto-show as "Expired" when past their expiry date. 30-day amber badges for upcoming renewals. Mandatory vs optional flag for compliance training. Filters by employee, type, category, and status.' },
              { a: 'Project Tracker',                       b: 'Create and manage projects linked to clients, owners, and departments. Add milestones inline and tick them complete. Linked tasks are counted per project. Overdue projects are automatically flagged. Priority and status filters included.' },
              { a: 'Employee Benefits',                     b: 'Record HMO, Pension (PFA), Group Life, and other benefits per employee. Store policy numbers, RSA PINs, premiums, and expiry dates. Monthly cost equivalent is computed on the fly for quarterly or annual premiums. Expiry alerts at 30 days.' },
              { a: 'Onboarding & Offboarding',              b: 'Generate joining or exit checklists in one click — pre-filled with Nigerian HR best-practice default items. Tick items complete individually and assign them to team members. Progress bar shows overall completion without any database trigger.' },
              { a: 'Recruitment Pipeline',                   b: 'Post job openings with salary range, employment type, and closing date. Move applicants through a 7-stage pipeline (New → Screening → Interviews → Offer → Hired / Rejected). Track interview dates, assigned interviewers, and offer amounts. Stage-filter buttons on each opening show live counts.' },
              { a: 'Attendance & Timesheets',                b: 'Log daily clock-in/out and attendance status per employee. Month navigator with running totals for present, late, absent, and on-leave. Overtime minutes tracked per day and summed for the period. One record per employee per date enforced at the database level.' },
              { a: 'Disciplinary Records',                   b: 'Full disciplinary ladder: verbal → written → final warning → query → suspension → termination. Employee response thread for show-cause replies (required for fair hearing). Acknowledge receipt, expunge after clean-record period. Visible to Admin and Super Admin only.' },
              { a: 'Fleet Insights Panel',                    b: 'The Fleet Dashboard now opens with a health score panel. Each vehicle gets a composite 0–100% health score based on fuel efficiency (20%), maintenance compliance (30%), document/compliance (30%), and inspection results (20%). Smart insights engine generates alerts: overdue maintenance, budget overruns, anomaly rates > 15%, unresolved defects, low fuel efficiency, and week-over-week spend trends. Quick-action buttons jump directly to inspections, maintenance, anomalies, or compliance.' },
              { a: 'Fuel Cost Optimizer',                     b: 'Below the Fleet Insights Panel, a cost optimizer ranks vehicles by cost-per-km over 30 days. Highlights the best fuel station by average price per litre. Calculates monthly savings opportunity by bringing worst performers to fleet average. Vehicles rated as "Efficient" (below average cost/km) or "High" (above average).' },
              { a: 'Inspection Defect Resolution',            b: 'Inspection defects now have a structured resolution workflow. Green "Resolve" button opens a dialog with 8 action options (repaired, replaced, adjusted, cleaned, calibrated, temporary_fix, deferred, not_required). Optional repair cost and notes. Resolved defects show a green badge. Available to all users.' },
              { a: 'Document Management Overhaul',            b: 'Documents page rebuilt with: folder system (custom colours, breadcrumb navigation), entity linking (tag to client/employee/vehicle/project), drag-and-drop upload, bulk upload with progress bar, grid + list view toggle, dashboard stats (total/expiring/expired/linked/folders), entity filter toolbar, document detail dialog, template flag, access tracking (last_accessed_at + access_count), 17 document categories. Upload roles expanded to include finance and operations.' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── PAYMENTS ──────────────────────────────────────────────────── */}
      <section id="tech-payments" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Payments & Paystack</h2>
        <RefSection icon={CreditCard} title="Paystack integration">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Webhook signature verification', b: 'HMAC-SHA512, timing-safe compare. Rejected events return 401' },
              { a: 'Transfer events handled',        b: 'transfer.success · transfer.failed · transfer.reversed' },
              { a: 'Webhook idempotency',            b: '(reference, event_type) UNIQUE — duplicate deliveries silently ignored' },
              { a: 'Fees captured',                  b: 'paystack_fee_ngn per batch_item; shown in the Fees column on the Transactions page' },
              { a: 'CORS allowed origins',           b: 'ops.kdsquares.com · localhost:5173 · localhost:8080 · localhost:3000 (no wildcard *)' },
              { a: 'Funding wallet',                 b: 'Payments page → top-right link, or dashboard.paystack.com/#/balance/' },
            ]}
          />
        </RefSection>

        <RefSection icon={RefreshCw} title="Batch processing & reconciliation">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Low balance warning',          b: 'Below ₦50,000 → orange banner on Payments page' },
              { a: 'Batch processing',             b: 'Each transfer is sent via the paystack-transfer edge function, but the batch is currently driven by a browser loop on the Batch page — KEEP THE TAB OPEN AND FOCUSED until the run finishes. A pg_cron watchdog (batch-worker) rescues orphaned items if the tab closes, but slowly (~1/min) — do not rely on it for a large run.' },
              { a: 'Chunk size per invocation',    b: '50 items per batch-worker call' },
              { a: 'Concurrency per chunk',        b: '8 Paystack transfers in parallel' },
              { a: 'Time budget per call',         b: '120 seconds (edge function cap is 150 s)' },
              { a: 'Client-side iterations',       b: 'Up to 20 invocations from BatchDetail; each continues until all items done' },
              { a: 'Orphan watchdog',              b: 'pg_cron fires batch-worker every minute — picks up any batch in processing > 60 s old' },
              { a: 'Double-payment guard',         b: 'Optimistic concurrency: claim processing only if status IN (funded, partially_processed). Row count 0 → abort.' },
              { a: 'BatchDetail polling interval', b: '15 s → 30 s → 60 s → 120 s (exponential backoff)' },
              { a: 'Polling stops after',          b: '30 minutes of no progress (manual refresh still works)' },
              { a: 'Polling pauses when',          b: 'Browser tab is hidden' },
              { a: 'Reconciliation threshold',     b: 'Re-checks any transfer stuck in "pending" for more than 1 hour' },
              { a: 'Reconciliation cap per run',   b: '200 items (rate-limit guard)' },
              { a: 'Manual reconcile button',      b: 'Payments page → "Reconcile" (top-right)' },
            ]}
          />
        </RefSection>

        <RefSection icon={CreditCard} title="Paystack fee display">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Fee column on BatchDetail',   b: 'Shown per batch item. Falls back gracefully if webhook has not yet fired.' },
              { a: 'Fee source 1 (best)',         b: 'paystack_fee_ngn — written by the transfer.success webhook' },
              { a: 'Fee source 2 (fallback)',     b: 'paystack_raw.fee ÷ 100 — raw Paystack JSON, kobo → naira' },
              { a: 'Fee source 3 (estimate)',     b: 'Tier estimate for succeeded items: min(₦2,000, max(₦50, amount × 1.5%))' },
              { a: 'Fee for non-succeeded items', b: '— (dash) — not charged yet' },
              { a: 'Fee for in-flight items',     b: '... (three dots) — transfer dispatched but webhook pending' },
            ]}
          />
        </RefSection>

        <RefSection icon={Database} title="Query limits (Payments module)">
          <RefTable
            cols={['Query', 'Limit']}
            rows={[
              { a: 'Approvals — payment batches',         b: '200 rows' },
              { a: 'Dashboard — processed batches (KPI)', b: '500 rows' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── FINANCE MODULES ────────────────────────────────────────────── */}
      <section id="tech-finance" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Finance Modules</h2>
        <RefSection icon={FilePlus2} title="Invoices">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Default VAT rate',        b: '7.5% — Nigerian standard rate (configurable per invoice)' },
              { a: 'Status workflow',         b: 'draft → sent → paid · overdue · cancelled' },
              { a: 'Overdue detection',       b: 'Auto-detected — sent invoices with due_date &lt; today display as overdue' },
              { a: 'Line items',              b: 'Multiple line items per invoice; quantity × unit_price + VAT = total' },
              { a: 'Payment terms',           b: 'Stored as days (30/60/90/custom) — used to compute due_date from issue_date' },
              { a: 'Currency',                b: 'NGN only — multi-currency not supported in this version' },
              { a: 'Print layout',            b: 'Print-ready CSS — use browser Print to PDF' },
              { a: 'Soft delete',             b: 'Status="cancelled" preferred over deletion to keep audit trail' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance only' },
            ]}
          />
        </RefSection>

        <RefSection icon={Store} title="Vendors / Suppliers">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Categories',              b: 'utilities · software · services · supplies · logistics · professional · other' },
              { a: 'Status values',           b: 'active · inactive · blacklisted (last blocks new POs)' },
              { a: 'Required fields',         b: 'Name + category + status. All other fields optional.' },
              { a: 'Tax/CAC fields',          b: 'rc_number (CAC) · tin (FIRS) — both 8–14 chars typical' },
              { a: 'Bank details',            b: 'Stored for direct payment via Paystack transfer recipient flow' },
              { a: 'Contract expiry',         b: 'contract_end within 30 days surfaces as amber badge' },
              { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance / operations' },
            ]}
          />
        </RefSection>

        <RefSection icon={Package} title="Asset Register">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Asset categories',        b: 'plant_machinery · motor_vehicle · furniture · it_equipment · land_building · leasehold_improvement · other' },
              { a: 'Depreciation methods',    b: 'straight_line (default) · reducing_balance' },
              { a: 'Straight-line formula',   b: 'book_value = cost − ((cost − salvage) ÷ useful_life) × years_elapsed' },
              { a: 'CITA initial allowance',  b: 'Pre-filled per category (plant 50% · vehicle 50% · furniture 25% · IT 50% · land/building 10%)' },
              { a: 'CITA annual allowance',   b: 'Pre-filled per category (plant 25% · vehicle 25% · furniture 20% · IT 25% · land/building 10%)' },
              { a: 'Insurance expiry',        b: '30-day amber badge when insurance_expiry approaches' },
              { a: 'Disposal tracking',       b: 'status: active · disposed · written_off — disposed assets hidden from default view' },
              { a: 'Assignment',              b: 'Assets can be linked to an employee (assigned_to) and department' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance only' },
            ]}
          />
        </RefSection>

        <RefSection icon={Briefcase} title="Subscriptions">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Maximum amount',          b: '₦50,000,000 per subscription (DB CHECK)' },
              { a: 'Renewal cycles',          b: 'monthly · quarterly · annually · custom' },
              { a: 'Auto-renewal flag',       b: 'is_auto_renew controls whether system flags upcoming renewals' },
              { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
              { a: 'Categories',              b: 'Linked to global expense categories for budget tracking' },
            ]}
          />
        </RefSection>

        <RefSection icon={CreditCard} title="Virtual Cards">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Card lifecycle',          b: 'pending → active → suspended · expired · closed' },
              { a: 'Daily / monthly caps',    b: 'Stored on the card record; enforced by Paystack at swipe time' },
              { a: 'Linked employee',         b: 'Each card belongs to one employee (linked profile)' },
              { a: 'Soft delete',             b: 'Closed cards stay in DB for transaction history' },
            ]}
          />
        </RefSection>

        <RefSection icon={ShieldCheck} title="Compliance Filings">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Filing types',            b: 'paye · pension · nhf · nhis · vat · cit · firs_other (Nigerian statutory)' },
              { a: 'Due-date alerts',         b: '30-day amber badge on Dashboard for filings due soon' },
              { a: 'Status values',           b: 'pending · submitted · paid · overdue (auto-detected)' },
              { a: 'Document linking',        b: 'Each filing can be linked to a Documents record (receipt PDF)' },
              { a: 'RLS read access',         b: 'super_admin / admin / finance only' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── EXPENSES ──────────────────────────────────────────────────── */}
      <section id="tech-expenses" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Expenses & Budgets</h2>
        <RefSection icon={CheckCircle2} title="Approval flow">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Single approval',         b: 'Expenses below the dual-approval threshold need one approver (admin / finance)' },
              { a: 'Dual approval',           b: 'Expenses at or above the threshold in Settings require two separate approvers' },
              { a: 'Dual threshold',          b: 'Configurable in Settings → Expense Limits (0 = dual approval disabled)' },
              { a: 'Self-approval — non-admin', b: 'Staff / finance / operations cannot approve their own expenses' },
              { a: 'Self-approval — admin',   b: 'super_admin and admin roles CAN first-approve their own expenses (exception)' },
              { a: 'Second approver',         b: 'Must be a different person from the first approver — enforced in code' },
              { a: 'Bulk approve',            b: 'Admin / finance only — each item gets its own audit log entry' },
              { a: 'Rejection reason',        b: 'Mandatory for all rejections — minimum 10 characters' },
            ]}
          />
        </RefSection>

        <RefSection icon={Receipt} title="Expense submission rules">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Maximum single expense',    b: '₦100,000,000 (CHECK constraint in DB)' },
              { a: 'Receipt upload size cap',   b: '10 MB per file' },
              { a: 'Receipt compression',       b: 'Images auto-compressed to 1600 px JPEG @ 82% on upload' },
              { a: 'Resubmission',              b: 'Rejected expenses can be edited and resubmitted — creates audit trail' },
              { a: 'Fuel-linked expenses',      b: 'Approving a fuel request auto-creates / updates a linked expense row' },
            ]}
          />
        </RefSection>

        <RefSection icon={Database} title="Data & query limits (Expenses)">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Soft delete',               b: 'Deleting an expense sets deleted_at — row stays in DB for audit trail' },
              { a: 'Deleted row visibility',    b: 'Hidden from all UI queries; visible in Supabase dashboard for recovery' },
              { a: 'Approvals page limit',      b: '200 pending expenses fetched at once' },
              { a: 'Dashboard spend-calc limit', b: '2,000 approved expenses (for budget KPIs)' },
              { a: 'Budgets spend-calc limit',  b: '2,000 approved expenses' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── FLEET ─────────────────────────────────────────────────────── */}
      <section id="tech-fleet" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Fleet Technical Reference</h2>
        <RefSection icon={Car} title="Fuel requests">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Maximum single fuel request', b: '₦5,000,000 (DB CHECK constraint + UI validation)' },
              { a: 'Minimum fuel amount',         b: '₦1 — zero-amount requests are rejected' },
              { a: 'File size cap',               b: '10 MB per receipt / document' },
              { a: 'Approval required',           b: 'admin / finance / super_admin (RLS enforced)' },
              { a: 'Approved → linked expense',   b: 'Approving a fuel request auto-creates a paired expense row' },
              { a: 'Status preconditions',        b: 'Approve requires status=pending; Mark Sent requires approved; Mark Complete requires sent' },
              { a: 'Paystack fee column',         b: 'Shown per request; resolved from paystack_fee_ngn → raw JSON → tier estimate' },
              { a: 'Soft delete',                 b: 'Deleting sets deleted_at — record preserved in DB' },
              { a: 'Query limit',                 b: '100 fuel requests fetched per load' },
              { a: 'Trip logs',                   b: 'Hard deleted (no financial value requiring preservation)' },
            ]}
          />
        </RefSection>

        <RefSection icon={Zap} title="Fleet operational thresholds">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Fuel request query limit',    b: '100 rows (most recent first)' },
              { a: 'Trip log query limit',        b: '100 rows (most recent first)' },
              { a: 'Trip date validation',        b: 'Future dates rejected on submission' },
              { a: 'Odometer validation',         b: 'End reading must be ≥ start reading' },
              { a: 'Payment type toggle',         b: 'Naming-only — bank fields always visible regardless of toggle' },
              { a: 'Reimbursement vs company',    b: 'Toggle on fuel & repair forms; stored on expense row (is_reimbursement)' },
            ]}
          />
        </RefSection>

        <RefSection icon={BarChart2} title="Fleet Insights Panel">
          <RefTable
            cols={['Feature', 'Detail']}
            rows={[
              { a: 'Vehicle health score',     b: 'Composite 0–100% per vehicle: fuel efficiency (20%) + maintenance compliance (30%) + document/compliance (30%) + inspection results (20%)' },
              { a: 'Smart insights engine',    b: 'Auto-generates alerts: overdue maintenance, budget overruns, anomaly rates > 15%, unresolved defects, low fuel efficiency, WoW spend trends' },
              { a: 'Health breakdown',         b: 'Per-vehicle progress bars with colour coding (green > 80%, amber 50–80%, red < 50%), issue tags, trend indicators' },
              { a: 'Quick actions',            b: 'Jump buttons: run inspection, schedule maintenance, review anomalies, check compliance' },
              { a: 'Data range',               b: '30-day rolling window for all calculations' },
            ]}
          />
        </RefSection>

        <RefSection icon={Fuel} title="Fuel Cost Optimizer">
          <RefTable
            cols={['Feature', 'Detail']}
            rows={[
              { a: 'Cost-per-km ranking',      b: 'All vehicles ranked by fuel spend ÷ km driven over 30 days. Top 8 displayed.' },
              { a: 'Efficiency rating',        b: 'Vehicles at or below fleet average cost/km = "Efficient" (green). Above average = "High" (red).' },
              { a: 'Best station highlight',   b: 'Fuel station with lowest average price per litre across all requests' },
              { a: 'Savings opportunity',      b: 'Monthly savings estimate by bringing worst-half performers down to fleet average cost/km' },
              { a: 'Fleet avg cost/km',        b: 'Computed as mean of all vehicles with both spend and distance data' },
              { a: 'Station anomaly rate',     b: 'Per station: percentage of fuel requests flagged as anomalies' },
            ]}
          />
        </RefSection>

        <RefSection icon={CheckCircle2} title="Inspection defect resolution">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Resolution actions',       b: 'repaired · replaced · adjusted · cleaned · calibrated · temporary_fix · deferred · not_required' },
              { a: 'Repair cost',              b: 'Optional ₦ amount recorded per resolution' },
              { a: 'Notes',                    b: 'Free-text resolution notes (optional)' },
              { a: 'Visual indicator',         b: 'Resolved defects show green "Resolved" badge with action taken' },
              { a: 'Access',                   b: 'All authenticated users can resolve defects (not restricted to admin)' },
              { a: 'Resolve button placement', b: 'Green button on each defect card + in defect detail view' },
            ]}
          />
        </RefSection>

        <RefSection icon={Shield} title="Fleet access control">
          <RefTable
            cols={['Tab / feature', 'Who can access']}
            rows={[
              { a: 'Fuel Requests tab',           b: 'All authenticated users (submit own; admin/finance approve)' },
              { a: 'Trip Logs tab',               b: 'All authenticated users' },
              { a: 'Activity tab',                b: 'admin · finance · super_admin only (hidden from other roles)' },
              { a: 'fleet.view_activity perm',    b: 'Tracked in PermissionsEditor — default on for admin + finance' },
              { a: 'Approve / send / complete',   b: 'admin · finance · super_admin only (RLS: current_user_role() IN (…))' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── HR & LEAVE ────────────────────────────────────────────────── */}
      <section id="tech-hr" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">HR & Leave Technical Reference</h2>
        <RefSection icon={Users} title="Leave requests">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Approval roles',          b: 'admin / super_admin / operations' },
              { a: 'Rejection reason',        b: 'Mandatory — minimum 10 characters' },
              { a: 'Balance deducted when',   b: 'Leave is approved — restored if approval is reverted' },
              { a: 'Cancellation',            b: 'Employee can cancel their own pending / approved request' },
              { a: 'Soft delete',             b: 'Deleting sets deleted_at — record stays in DB' },
              { a: 'My requests limit',       b: '100 rows (most recent first)' },
              { a: 'Team view limit',         b: '200 rows (admin / privileged roles only)' },
              { a: 'Approvals page limit',    b: '200 pending leave requests' },
            ]}
          />
        </RefSection>

        <RefSection icon={Users} title="Employee profile caps">
          <RefTable
            cols={['Data', 'Cap']}
            rows={[
              { a: 'Payslips shown',             b: '24 (newest first)' },
              { a: 'Salary advances shown',      b: '20 (newest first)' },
              { a: 'Salary increments shown',    b: '20 (newest first)' },
              { a: 'Deductions shown',           b: '20 (newest first)' },
              { a: 'Documents shown',            b: '30 (newest first, soft-deleted excluded)' },
              { a: 'Audit log shown',            b: '50 most recent entries' },
              { a: 'Maximum annual salary',      b: '₦100,000,000 (DB CHECK constraint)' },
              { a: 'Maximum salary advance',     b: '₦50,000,000 (DB CHECK constraint)' },
            ]}
          />
        </RefSection>

        <RefSection icon={Database} title="Budgets">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Maximum annual budget',   b: '₦5,000,000,000 per category (DB CHECK)' },
              { a: 'Approval required',       b: 'admin / finance / super_admin' },
              { a: 'Locking',                 b: 'Locked budgets block new expense submissions against their categories' },
              { a: 'Soft delete',             b: 'Deleting sets deleted_at — record stays in DB' },
              { a: 'Query limit',             b: '200 budget rows per load' },
              { a: 'Approvals page limit',    b: '200 pending budgets' },
            ]}
          />
        </RefSection>

        <RefSection icon={Star} title="Performance Reviews">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Cycle types',             b: 'annual · mid_year · quarterly · probation' },
              { a: 'Competency scale',        b: '1–5 stars across 5 competencies (Delivery, Communication, Teamwork, Initiative, Leadership)' },
              { a: 'Overall rating',          b: 'Computed as the average of the five competency ratings' },
              { a: 'Status flow',             b: 'draft → submitted → acknowledged' },
              { a: 'Review types',            b: 'manager · self · peer (each tracked separately)' },
              { a: 'Who can edit',            b: 'The reviewer (until acknowledged) or any manager role' },
              { a: 'Overdue cycles',          b: 'Cycles past target_completion_date with incomplete reviews are flagged red' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
            ]}
          />
        </RefSection>

        <RefSection icon={GraduationCap} title="Training &amp; Certifications">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Record types',            b: 'training (course completion) · certification (formal credential)' },
              { a: 'Expiry detection',        b: 'Auto-shows "Expired" when expiry_date &lt; today — no DB job needed' },
              { a: 'Renewal alert',           b: '30-day amber badge when expiry_date is within 30 days' },
              { a: 'Categories',              b: 'professional_development · compliance · safety · technical · leadership · software · other' },
              { a: 'Mandatory flag',          b: 'is_mandatory = true marks compliance/safety training as required' },
              { a: 'Cost tracking',           b: 'cost_ngn fed into budget analysis (no cap)' },
              { a: 'Certificate URL',         b: 'Optional link to PDF or external system' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
            ]}
          />
        </RefSection>

        <RefSection icon={HeartPulse} title="Employee Benefits">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Benefit types',           b: 'hmo (NHIS) · pension_pfa (PFA) · group_life · other' },
              { a: 'RSA PIN',                 b: 'Stored only for pension_pfa records — Retirement Savings Account number' },
              { a: 'Premium frequency',       b: 'monthly · quarterly · annually' },
              { a: 'Monthly equivalent',      b: 'Computed in-app: quarterly ÷ 3, annually ÷ 12' },
              { a: 'Status values',           b: 'active · suspended · expired' },
              { a: 'Expiry alert',            b: '30-day amber badge when expiry_date approaches; red when past' },
              { a: 'Multiple records',        b: 'Multiple HMO plans per employee allowed (e.g. employee + family plan)' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
            ]}
          />
        </RefSection>

        <RefSection icon={UserCheck} title="Onboarding &amp; Offboarding">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Checklist types',         b: 'onboarding (new hires) · offboarding (exits)' },
              { a: 'Default items seeded',    b: '11 onboarding items · 8 offboarding items (when "Populate defaults" is checked)' },
              { a: 'Item categories',         b: 'documentation · it_setup · hr_admin · finance · training · equipment · introduction · other' },
              { a: 'Item delegation',         b: 'Each item can be assigned to a team member (HR, IT, finance, buddy)' },
              { a: 'Status derivation',       b: 'Computed in-app — pending (0%) · in_progress (1–99%) · completed (100%). No DB trigger.' },
              { a: 'Item completion',         b: 'Click checkbox — sets completed_at + completed_by. Toggleable.' },
              { a: 'Sort order',              b: 'sort_order INT — lower numbers appear first within each category' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
            ]}
          />
        </RefSection>

        <RefSection icon={UserPlus2} title="Recruitment Pipeline">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Pipeline stages',         b: 'new → screening → interview_1 → interview_2 → offer → hired | rejected' },
              { a: 'Employment types',        b: 'full_time · part_time · contract · intern' },
              { a: 'Opening status',          b: 'draft (private) · published · closed (no more applicants) · filled' },
              { a: 'Application sources',     b: 'job_board · referral · walk_in · internal · linkedin · other' },
              { a: 'Salary range',            b: 'salary_min_ngn / salary_max_ngn — planning figures, not enforced on offer' },
              { a: 'Offer amount',            b: 'Recorded only when stage is offer or hired; offered_at auto-stamped' },
              { a: 'Hire-to-employee',        b: 'Marking "Hired" does NOT auto-create an auth.users row — admin creates the employee manually' },
              { a: 'Soft delete',             b: 'Job openings use deleted_at; applicants are hard-deleted on removal' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
            ]}
          />
        </RefSection>

        <RefSection icon={CalendarCheck2} title="Attendance &amp; Timesheets">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Storage',                 b: 'One row per employee per work_date — UNIQUE constraint at DB level' },
              { a: 'Conflict handling',       b: 'Insert uses upsert(onConflict=employee_id,work_date) — re-submission updates the existing row' },
              { a: 'Time storage',            b: 'clock_in / clock_out are TIME (no timezone) — assumes Nigeria WAT (UTC+1)' },
              { a: 'Status values',           b: 'present · absent · late · half_day · remote · on_leave · public_holiday' },
              { a: 'Overtime tracking',       b: 'overtime_minutes INT ≥ 0 — totalled per period in the summary card' },
              { a: 'Month navigation',        b: 'Page loads 1 month at a time; navigator buttons shift the date range' },
              { a: 'Leave integration',       b: 'on_leave status is set manually; not auto-synced from leave_requests (future)' },
              { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
            ]}
          />
        </RefSection>

        <RefSection icon={ShieldAlert} title="Disciplinary Records">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Action ladder',           b: 'verbal_warning → written_warning → final_warning → query → suspension → termination' },
              { a: 'Other types',             b: 'counselling · other (for informal coaching or undefined incidents)' },
              { a: 'Fair hearing support',    b: 'Employee response thread on each record — required by Nigerian Labour Act before termination' },
              { a: 'Acknowledgement',         b: 'acknowledged_at / acknowledged_by — confirms employee received the notice' },
              { a: 'Suspension',              b: 'suspension_days INT > 0 — mandatory when incident_type = suspension' },
              { a: 'Expunge mechanism',       b: 'is_expunged = true hides record from active history but keeps it in audit trail' },
              { a: 'Expunge reason',          b: 'Free-text reason captured (e.g. "12 months clean record")' },
              { a: 'Show expunged toggle',    b: 'Default off — expunged records hidden until "Show expunged" is checked' },
              { a: 'RLS access',              b: 'super_admin / admin only — finance and operations CANNOT view or edit (sensitive HR data)' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── WORKSPACE ──────────────────────────────────────────────────── */}
      <section id="tech-workspace" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Workspace / Tasks Technical Reference</h2>
        <RefSection icon={FolderKanban} title="Project Tracker">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Status workflow',         b: 'planning → active → on_hold → completed | cancelled' },
              { a: 'Priority levels',         b: 'critical · high · normal · low' },
              { a: 'Date constraint',         b: 'CHECK: end_date must be ≥ start_date when both set' },
              { a: 'Client linking',          b: 'Optional client_id FK to Clients CRM (sets to NULL on client delete)' },
              { a: 'Owner / department',      b: 'Each project has one owner (auth user) and an optional department' },
              { a: 'Milestones',              b: 'Inline list — pending or complete; Enter key adds; sort_order controls display' },
              { a: 'Linked tasks',            b: 'Tasks gain a project_id FK (added by Phase 5 migration); count shown per project' },
              { a: 'Overdue detection',       b: 'Active project past end_date displays an Overdue badge' },
              { a: 'Budget',                  b: 'budget_ngn is a planning figure; actual spend computed from linked expenses (not stored)' },
              { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
            ]}
          />
        </RefSection>

        <RefSection icon={Users} title="Tasks">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Status values',           b: 'open · in_progress · blocked · done' },
              { a: 'Priority levels',         b: 'critical · high · normal · low' },
              { a: 'Project linkage',         b: 'project_id FK added in Phase 5 — tasks can belong to a project (or stay standalone)' },
              { a: 'Assignment',              b: 'One assignee per task; comments thread for collaboration' },
              { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
            ]}
          />
        </RefSection>

        <RefSection icon={CheckCircle2} title="Goals (OKR)">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Goal types',              b: 'company · department · team · individual' },
              { a: 'Status values',           b: 'on_track · at_risk · off_track · completed' },
              { a: 'Progress',                b: '0–100% — entered manually by goal owner' },
              { a: 'Visibility',              b: 'Each user sees their own goals + their department goals + company goals' },
            ]}
          />
        </RefSection>

        <RefSection icon={BookOpen} title="Knowledge Base">
          <RefTable
            cols={['Rule', 'Detail']}
            rows={[
              { a: 'Article statuses',        b: 'draft (only author) · published (all authenticated)' },
              { a: 'Versioning',              b: 'knowledge_article_versions stores every save — full edit history retained' },
              { a: 'Search',                  b: 'In-app filtering by title, body, category, tag' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── SECURITY ──────────────────────────────────────────────────── */}
      <section id="tech-security" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Security Settings</h2>
        <RefSection icon={Lock} title="Authentication & passwords">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Minimum password length',   b: '12 characters' },
              { a: 'Password complexity',       b: 'Must contain at least one letter and one number' },
              { a: 'Login rate limit',          b: '5 failed attempts per email in 15 minutes → 15-minute lockout' },
              { a: 'Failed login tracking',     b: 'Recorded in failed_login_attempts table (admins only)' },
              { a: 'Login / logout audited',    b: 'Every session start and end recorded in audit_logs' },
              { a: 'Session storage',           b: 'localStorage with auto-refresh JWT. Cleared on Sign Out' },
              { a: '"View As role"',            b: 'super_admin only — sessionStorage, cleared on tab close' },
              { a: 'Realtime cleanup',          b: 'All Supabase realtime channels removed on logout (no ghost subscriptions)' },
            ]}
          />
        </RefSection>

        <RefSection icon={ShieldCheck} title="Approval step-up (password + TOTP re-verification)">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Toggle',                  b: 'Settings → Security → "Require password + 2FA re-verification to approve or reject" (super_admin only, off by default)' },
              { a: 'When ON',                 b: 'Approving/rejecting a payment batch or expense prompts for a fresh password + 6-digit authenticator code immediately before the action goes through' },
              { a: 'When OFF',                b: 'Approvals work exactly as before — no extra prompt' },
              { a: 'Requirement',             b: 'Every approver (super_admin/admin/operations) must have TOTP enrolled in Profile → Security before this is turned on, or they cannot approve anything' },
              { a: 'Lockout',                 b: '3 failed step-up attempts in 60 minutes locks that user out of stepping up for 1 hour; super_admins are notified' },
              { a: 'Token lifetime',          b: '5 minutes, single-use, bound to the specific batch/expense and action' },
            ]}
          />
        </RefSection>

        <RefSection icon={Shield} title="Access control (role matrix)">
          <RefTable
            cols={['Module / Resource', 'super_admin', 'admin', 'finance', 'operations', 'field_staff / driver']}
            rows={[
              { a: 'Dashboard',           b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
              { a: 'Expenses',            b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
              { a: 'Payroll / Payslips',  b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Budgets',             b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Fleet',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Contractors',         b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
              { a: 'Employees (HR)',       b: '✓', c: '✓', d: '—', e: '—', f: '—' },
              { a: 'Leave',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Performance Reviews', b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Training Records',    b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Benefits',            b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Onboarding',          b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Recruitment',         b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Attendance',          b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Disciplinary',        b: '✓', c: '✓', d: '—', e: '—', f: '—' },
              { a: 'Vendors',             b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Clients / CRM',       b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Invoices',            b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
              { a: 'Assets',              b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
              { a: 'Projects',            b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Tasks',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Goals',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Documents (read)',     b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
              { a: 'Documents (upload)',   b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
              { a: 'Audit Log',           b: '✓', c: '✓', d: '—', e: '—', f: '—' },
              { a: 'Settings',            b: '✓', c: '—', d: '—', e: '—', f: '—' },
              { a: 'Company Guide (this page)', b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
            ]}
          />
          <p className="text-[11px] text-muted-foreground mt-2">✓ = can access · — = blocked at route and database level. Role changes take effect on the employee's next page load.</p>
        </RefSection>

        <RefSection icon={Shield} title="Fine-grained write permissions">
          <RefTable
            cols={['Resource', 'Who can write']}
            rows={[
              { a: 'Audit log write',          b: 'INSERT only — performed_by must equal your own user_id' },
              { a: 'Documents bucket write',   b: 'admin / finance / operations / super_admin' },
              { a: 'Expense approval',         b: 'admin / finance (single items) · admin / finance (bulk)' },
              { a: 'Approval comments',        b: 'admin / finance / operations only' },
              { a: 'Employee deductions',      b: 'Self only OR admin / finance' },
              { a: 'Tasks visibility',         b: 'Assignee + creator + admin / operations' },
              { a: 'Invoices write',           b: 'super_admin / admin / finance only (RLS)' },
              { a: 'Assets write',             b: 'super_admin / admin / finance only (RLS)' },
              { a: 'Disciplinary write',       b: 'super_admin / admin only (RLS)' },
              { a: 'Disciplinary responses',   b: 'super_admin / admin only (RLS)' },
              { a: 'Company settings read',    b: 'super_admin / admin / finance only — no longer readable by all authenticated users' },
              { a: 'Fuel request management',  b: 'super_admin / admin / finance (RLS policy "Staff can manage fuel requests")' },
              { a: 'Document folders create',  b: 'super_admin / admin / finance / operations (RLS)' },
              { a: 'Document folders update',  b: 'super_admin / admin OR folder creator (RLS)' },
              { a: 'Document folders delete',  b: 'super_admin / admin only (RLS)' },
            ]}
          />
        </RefSection>

        <RefSection icon={Lock} title="Database-level security hardening">
          <RefTable
            cols={['Control', 'Detail']}
            rows={[
              { a: 'Role self-elevation blocked',   b: 'BEFORE UPDATE trigger on profiles — prevents any user from changing their own role or status unless super_admin' },
              { a: 'transactions_view',             b: 'security_invoker = true — view runs with the caller\'s RLS context, not the definer\'s' },
              { a: 'Notification insert policy',    b: 'Users can only insert notifications for themselves; admin/finance can notify any user' },
              { a: 'Batch-worker auth (user)',      b: 'JWT must belong to admin / finance / super_admin — checked in edge function' },
              { a: 'Batch-worker auth (cron)',      b: 'X-Cron-Secret header matched against Vault secret cron_shared_secret' },
              { a: 'audit_logs indexes',            b: 'created_at DESC · performed_by · action_type — fast dashboard and audit page loads' },
              { a: 'notifications indexes',         b: '(user_id, created_at DESC) · (user_id) WHERE read=false — unread-count probe is O(1)' },
              { a: 'batch_items indexes',           b: '(batch_id, status) · (paystack_reference) WHERE NOT NULL — worker pull + webhook lookup' },
            ]}
          />
        </RefSection>

        <RefSection icon={Globe} title="Network & API security">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Content Security Policy',   b: 'Active in index.html — restricts scripts, connects, iframes to known origins' },
              { a: 'Edge function CORS',        b: 'Locked to ops.kdsquares.com + localhost ports (no wildcard *)' },
              { a: 'Paystack webhook auth',     b: 'HMAC-SHA512 signature verified on every webhook delivery' },
              { a: 'Error reporting',           b: 'window.onerror + ErrorBoundary forward to window.Sentry if configured' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── FILES & DATA ──────────────────────────────────────────────── */}
      <section id="tech-files" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Files & Data Retention</h2>
        <RefSection icon={FileWarning} title="File upload rules">
          <RefTable
            cols={['Setting', 'Value']}
            rows={[
              { a: 'Maximum file size',           b: '10 MB per file (5 MB for company logo)' },
              { a: 'Image compression',           b: 'On by default — receipts / photos resize to 1600 px JPEG @ 82%' },
              { a: 'Compression skipped for',     b: 'PDFs, GIFs, SVGs, files smaller than 200 KB' },
              { a: 'Blocked extensions',          b: '.exe .bat .cmd .sh .ps1 .jar .msi .app .dmg .html .js .ts .php .py .rb' },
              { a: 'Documents bucket',            b: 'Private — preview uses short-lived signed URLs' },
              { a: 'Receipts bucket',             b: 'Private — same signed-URL pattern' },
              { a: 'Documents auto-delete',       b: 'NEVER — HR / legal docs survive any retention policy' },
            ]}
          />
        </RefSection>

        <RefSection icon={FolderOpen} title="Document Management">
          <RefTable
            cols={['Feature', 'Detail']}
            rows={[
              { a: 'Folder system',            b: 'Create folders with custom colours and icons. Breadcrumb navigation. Folders can be linked to entities (client/employee/vehicle/project).' },
              { a: 'Entity linking',           b: 'Tag documents to: client (Building2), employee (Users), vehicle (Car), project (Briefcase). Filter by entity type in toolbar.' },
              { a: 'Drag & drop upload',       b: 'Drop files anywhere on the page — auto-opens upload form with file pre-attached.' },
              { a: 'Bulk upload',              b: 'Select multiple files at once. Progress bar tracks completion. Each file creates a separate document record.' },
              { a: 'Grid + list view',         b: 'Toggle between card grid and table list view. Preference persists during session.' },
              { a: 'Dashboard stats',          b: 'Cards showing: total documents, expiring soon (30 days), expired, linked to entities, total folders.' },
              { a: 'Document categories',      b: 'contract · agreement · receipt · invoice · id_document · policy · report · proposal · letter · certificate · license · insurance · tax · hr · onboarding · template · other' },
              { a: 'Template flag',            b: 'Mark documents as templates for reuse. Template badge displayed on cards.' },
              { a: 'Access tracking',          b: 'Every download updates last_accessed_at timestamp and increments access_count.' },
              { a: 'Document detail dialog',   b: 'Full metadata view: title, description, category, entity link, tags, file size, upload date, expiry, version, access count.' },
              { a: 'Version tracking',         b: 'version INT (default 1) + parent_document_id FK for document lineage.' },
              { a: 'Upload roles',             b: 'admin · finance · operations · super_admin (expanded from admin-only)' },
              { a: 'Folder RLS',               b: 'All authenticated can read. admin/finance/operations can create. admin/creator can update. admin can delete.' },
            ]}
          />
        </RefSection>

        <RefSection icon={Database} title="What really happens when you click 'Delete'">
          <RefTable
            cols={['What you delete', 'What actually happens']}
            rows={[
              { a: 'Expense',           b: 'Hidden from every screen, but kept in the database with a "deleted on" timestamp. An admin can restore it from the Supabase dashboard.' },
              { a: 'Document',          b: 'Hidden everywhere and the actual file is removed from storage (frees space). The database record stays so the audit log still references it.' },
              { a: 'Budget',            b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
              { a: 'Leave request',     b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
              { a: 'Fuel request',      b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
              { a: 'Contractor',        b: 'Sensitive personal info (name, email, phone, BVN, bank details) is anonymised. The row stays so historical payments still balance.' },
              { a: 'Trip log',          b: 'Permanently removed (no financial value tied to it).' },
              { a: 'Task or Goal',      b: 'Permanently removed.' },
            ]}
          />
        </RefSection>

        <RefSection icon={Archive} title="Data retention policies">
          <RefTable
            cols={['Data type', 'Current behaviour', 'Recommended setting']}
            rows={[
              { a: 'Audit logs',            b: 'Configurable in Data Retention tab', c: '3 years (FIRS requirement)' },
              { a: 'Notifications (read)',  b: 'Configurable',                       c: '90 days' },
              { a: 'Receipts & files',      b: 'Configurable (archive-only mode)',   c: '2 years archive, never hard-delete' },
              { a: 'Documents (HR/legal)',  b: 'NEVER auto-deleted (locked)',         c: 'Keep 7 years post-employment' },
              { a: 'Archive recovery',      b: '90-day window after archiving',      c: 'Restore via Supabase before expiry' },
              { a: 'First-run delay',       b: '7 days from enabling retention',     c: 'Cancellation window' },
            ]}
          />
        </RefSection>
      </section>

      {/* ── INFRASTRUCTURE ────────────────────────────────────────────── */}
      <section id="tech-infra" className="space-y-4 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Infrastructure & Capacity</h2>

        {/* ── BACKUP — most prominent section ── */}
        <Card className="border-2 border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-5 w-5 text-primary" />
              Database Backup — Daily Automated (Free)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>
              A GitHub Actions workflow (<code>.github/workflows/daily-backup.yml</code>) runs every night
              at <strong>02:00 WAT</strong> and creates a compressed SQL dump of the entire database.
              Backups are stored as GitHub Actions artifacts — <strong>completely free, no Pro plan needed</strong>.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="font-semibold text-primary">One-time setup (2 min)</p>
                <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                  <li><strong>SUPABASE_ACCESS_TOKEN</strong> — already in GitHub secrets ✅</li>
                  <li>Find your project ref: open Supabase → look at the URL:<br />
                    <code className="text-xs">supabase.com/dashboard/project/<strong>THIS_PART</strong></code></li>
                  <li>GitHub repo → <strong>Settings → Secrets → Actions → New secret</strong></li>
                  <li>Name: <strong><code>SUPABASE_PROJECT_REF</code></strong> · Value: paste the ref</li>
                  <li>Done — backup runs tonight automatically ✅</li>
                </ol>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-primary">How to restore a backup</p>
                <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                  <li>GitHub repo → <strong>Actions tab</strong></li>
                  <li>Click <strong>"Daily Database Backup"</strong> on the left</li>
                  <li>Open any past run → scroll to <strong>Artifacts</strong></li>
                  <li>Download the zip → extract the <code>.sql.gz</code> file</li>
                  <li>Run: <code>gunzip backup.sql.gz</code></li>
                  <li>Then: <code>psql "$DB_URL" &lt; backup.sql</code></li>
                </ol>
              </div>
            </div>

            <RefTable
              cols={['What', 'Detail']}
              rows={[
                { a: 'Schedule',           b: '02:00 WAT every day (01:00 UTC). Can also be triggered manually from the Actions tab.' },
                { a: 'Retention',          b: '30 days of backups kept. Oldest are deleted automatically — no manual cleanup needed.' },
                { a: 'Storage used',       b: 'Typical small DB: 2–5 MB compressed per backup × 30 = 60–150 MB. GitHub Free plan gives 500 MB artifact storage.' },
                { a: 'When storage fills', b: 'The workflow logs a warning if a single backup exceeds 15 MB. Check usage at github.com/settings/billing → Storage. Fix: reduce retention_days in the workflow file from 30 to 14, or upgrade to GitHub Pro ($4/mo) for 2 GB.' },
                { a: 'What is backed up',  b: 'Full logical dump: all tables, data, and indexes. Does NOT include Supabase Edge Function secrets (those live in Supabase Vault — record them separately in a password manager).' },
                { a: 'Manual trigger',     b: 'GitHub → Actions → "Daily Database Backup" → "Run workflow" button. Use this before any major migration or data change.' },
                { a: 'Verify it is running', b: 'After setup, go to GitHub → Actions tab → "Daily Database Backup" — green checkmarks = working. A red X means SUPABASE_PROJECT_REF secret is wrong or missing.' },
              ]}
            />
          </CardContent>
        </Card>

        <RefSection icon={HardDrive} title="Supabase capacity (free tier)">
          <RefTable
            cols={['Resource', 'Limit / guidance']}
            rows={[
              { a: 'Database storage',       b: '500 MB — watch this first as data grows' },
              { a: 'File storage',            b: '1 GB' },
              { a: 'Bandwidth',               b: '5 GB / month' },
              { a: 'Edge Function invocations', b: '500,000 / month' },
              { a: 'Realtime concurrent peers', b: '200' },
              { a: 'Auth users (MAU)',         b: '50,000' },
              { a: 'Upgrade trigger',          b: 'Pro tier ($25/mo) lifts all limits 50–100×. Storage fills first at scale.' },
            ]}
          />
        </RefSection>

        <RefSection icon={Zap} title="Query limits by page">
          <RefTable
            cols={['Page / query', 'Limit']}
            rows={[
              { a: 'Approvals — each table (batches, expenses, fuel, budgets, leave)', b: '200 rows' },
              { a: 'Approvals — profiles',           b: '500 rows' },
              { a: 'Dashboard — approved expenses',  b: '2,000 rows' },
              { a: 'Dashboard — processed batches',  b: '500 rows' },
              { a: 'Budgets — budget rows',          b: '200 rows' },
              { a: 'Budgets — spend-calc expenses',  b: '2,000 rows' },
              { a: 'Budgets — spend-calc batches',   b: '500 rows' },
              { a: 'Leave — my requests',            b: '100 rows' },
              { a: 'Leave — team requests',          b: '200 rows' },
              { a: 'Fleet — fuel requests',          b: '100 rows' },
              { a: 'Fleet — trip logs',              b: '100 rows' },
            ]}
          />
        </RefSection>

        <RefSection icon={Activity} title="Permanent code guardrails">
          <RefTable
            cols={['Rule', 'What it prevents']}
            rows={[
              { a: 'Linter blocks "used too early" code', b: 'Stops a function from being called before the line that defines it. This was the cause of the old Payments page crash, so the rule is now an error and CI will fail if anyone reintroduces it.' },
              { a: 'Strict list of audit actions',         b: 'Every audit log action name (e.g. expense_approved, contractor_deactivated) must be in a fixed list. Typos that would silently break the audit log are caught at build time.' },
              { a: 'Production build tool',                b: 'We use Vite 8 (Rolldown). Its stricter optimisation makes the older crash-causing patterns surface immediately, not in production.' },
            ]}
          />
        </RefSection>
      </section>
    </div>
  );
}
