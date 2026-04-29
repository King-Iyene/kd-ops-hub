-- Comprehensive KD-Ops knowledge seed.
-- Embeddings start NULL — run bulk-embed from AssistantAdmin after Gemini key is configured.
-- Replaces the thin 30-entry seed with full platform documentation.

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

-- ═══════════════════════════════════════════════════════════════
-- PLATFORM OVERVIEW & NAVIGATION
-- ═══════════════════════════════════════════════════════════════

('KD-Ops Platform Overview',
'KD-Ops is an all-in-one business operations hub built for Nigerian SMBs and enterprises. It combines Finance, HR, Operations, CRM, and AI into a single platform. All data is scoped to your organisation and protected by row-level security (RLS) in Supabase.

Finance modules: Payments, Payment Schedule, Transactions, Payroll, Subscriptions, Budgets, Virtual Cards, Invoices, Assets, Compliance.
Operations modules: Expenses, Fleet, Contractors, Employees, Leave, Performance Reviews, Training, Benefits, Onboarding/Offboarding, Recruitment, Attendance, Disciplinary, Vendors.
Workspace modules: AI Assistant, Tasks, Projects, Goals, Knowledge Base, Documents, Reports.
CRM modules: Clients, Contacts, Referrals.
Admin modules: Audit Log, Settings.

The platform runs on React + Supabase (PostgreSQL with pgvector), with Paystack for payment processing. All times are displayed in your organisation''s configured timezone (set in Settings). Dates are shown as DD/MM/YYYY. Currency is Naira (₦) by default.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['overview','platform','navigation']),

('User Roles and Permissions',
'KD-Ops has five roles, each with different access levels:

1. super_admin — Full access to everything including Settings, AI Assistant admin, and the ability to simulate other roles (View As). Only super_admin can manage company settings, change Paystack keys, and configure the AI assistant.

2. admin — Full access to all operational modules except Settings. Can manage employees, approve payments, view all HR data, and access the audit log.

3. finance — Access to all financial modules: payments, payroll, invoices, budgets, subscriptions, virtual cards, transactions, compliance, assets, reports, expenses, documents. Cannot access Settings, Employees, or sensitive HR modules.

4. operations — Access to Fleet, Expenses, Contractors, Employees, Leave, Performance, Training, Benefits, Onboarding, Recruitment, Attendance, Disciplinary, Vendors, Projects, Tasks, Goals, Knowledge, Documents. Cannot access financial payment modules.

5. field_staff — Limited access: Dashboard, Fleet (start/end trips), Expenses (own only), Leave (own), Tasks (assigned), Goals, Knowledge Base, Referrals, Profile.

Role is assigned per user and controls which sidebar items appear. Super admin can also grant extra granular permissions via the permissions JSONB column on profiles (e.g. giving an operations user access to payments.view).

APPROVER_ROLES (can approve payments/expenses/budgets): super_admin, admin, finance.
MANAGER_ROLES (can manage HR and operational modules): super_admin, admin, finance, operations.
ALL_AUTH_ROLES: all five roles.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['roles','permissions','access','security']),

('Sidebar Navigation Structure',
'The KD-Ops sidebar is organised into five groups:

FINANCE group: Payments (/payments), Payment Schedule (/payments/schedule), Transactions (/transactions), Payroll (/payroll), Subscriptions (/subscriptions), Budgets (/budgets), Cards (/cards), Invoices (/invoices), Assets (/assets), Compliance (/compliance).

OPERATIONS group: Expenses (/expenses), Fleet (/fleet), Contractors (/contractors), Employees (/employees), Leave (/leave), Performance (/performance), Training (/training), Benefits (/benefits), Onboarding (/onboarding), Recruitment (/recruitment), Attendance (/attendance), Disciplinary (/disciplinary), Vendors (/vendors).

WORKSPACE group: Assistant (/assistant), Tasks (/tasks), Projects (/projects), Goals (/goals), Knowledge (/knowledge), Documents (/documents), Reports (/reports).

CRM group: Clients (/clients), Contacts (/contacts), Referrals (/referrals).

ADMIN group: Audit Log (/audit), Settings (/settings — super_admin only).

The sidebar collapses on mobile. Each item is only shown to roles that have access to it. Active route is highlighted. The sidebar trigger (hamburger) is in the top-left header.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['navigation','sidebar','routes']),

-- ═══════════════════════════════════════════════════════════════
-- PAYMENTS MODULE
-- ═══════════════════════════════════════════════════════════════

('Payments Module Overview',
'The Payments module (/payments) lets finance users create, approve, and disburse payment batches via Paystack. Accessible to super_admin, admin, finance roles only.

The page shows:
- Paystack wallet balance card with a low-balance alert when below ₦50,000.
- Stats cards: Pending Approval (count + amount), Processing (count), Paid This Month (total).
- Status tabs: All, Pending, Processing, Completed, Partial, Rejected, Draft.
- Search by batch name.
- A "New batch" button to create a payment batch.
- A "Reconcile" button to check for stuck/failed transfers.

Each batch card shows: batch name, type badge (Contractor/Salary Run/Advance/Bonus), beneficiary count, payment date, creation date, total amount, and status badge. A pulsing green dot indicates actively processing batches.

Batch types: Contractor (payments to contractors), Salary Run (payroll disbursement), Advance (salary advance), Bonus/Prize (bonuses and KD Star prizes).

Navigation: Click any batch to go to its detail page at /payments/{id}.',
ARRAY['super_admin','admin','finance'], ARRAY['payments','batches','overview']),

('Creating a Payment Batch',
'To create a payment batch, click "New batch" on the Payments page, or go to /payments/new.

Required fields:
- Batch name (e.g. "April Contractor Pay")
- Payment date (when funds should be disbursed)
- Batch type: contractor, salary_run, advance, bonus_prize

Beneficiary rows — each row requires:
- Full name (required)
- Bank name (select from list of Nigerian banks)
- Account number (10 digits, auto-verifies via Paystack to fetch account name)
- Amount (₦)
- Reference (optional, auto-generated if blank)
- Notes (optional)

You can add rows manually or import from a CSV. The CSV format for bulk import: full_name, bank_name, account_number, amount_ngn, reference (optional).

After filling all rows, click "Save as draft" to save without submitting, or "Submit for approval" to send directly to the approval queue. The total and beneficiary count are shown at the bottom.

Editing: Drafts can be edited at /payments/{id}/edit. Once submitted, the batch cannot be edited.',
ARRAY['super_admin','admin','finance'], ARRAY['payments','create','batch','csv']),

('Payment Batch Status Workflow',
'Payment batches move through these statuses:

1. draft — Created but not submitted. Can be edited or deleted. Only visible to finance team.

2. pending_approval — Submitted and awaiting review. Appears in the Approvals queue. Cannot be edited.

3. approved — Approved by an approver (finance/admin/super_admin). The approved_by and approved_at fields are set. Ready to be funded.

4. funded — Finance has confirmed the Paystack wallet has been topped up. Triggers the "Process Payments" button.

5. processing — Paystack transfers are being initiated one by one. A progress indicator shows "Processing payment X of Y — [Name]". The page auto-refreshes.

6. processed — All transfers succeeded. Receipt generation is available.

7. partially_processed — Some transfers succeeded and some failed. Failed items can be individually retried or bulk-retried.

8. rejected — Rejected by an approver with a mandatory reason (min 10 characters). The rejection reason is shown on the batch detail page. A notification is sent to the submitter.

Transition rules: Only APPROVER_ROLES (finance, admin, super_admin) can approve/reject. Only the batch creator or a manager can submit a draft. The funded → processing step requires someone to click "Process Payments" after confirming the wallet is funded.',
ARRAY['super_admin','admin','finance'], ARRAY['payments','status','workflow','approval']),

('Batch Detail Page',
'The Batch Detail page (/payments/{id}) shows full information about a payment batch and allows all status transitions.

Top section: batch name, type, period, payment date, total amount, beneficiary count, status badge, notes, rejection reason (if rejected), scheduled date alert (if future-dated).

Action buttons (depend on status):
- Draft: "Edit Batch" → /payments/{id}/edit, "Submit for Approval"
- Pending Approval: "Approve Batch", "Reject" (opens rejection reason dialog, min 10 chars)
- Approved: "Confirm Funded" (confirms wallet is topped up)
- Funded: "Process Payments" (initiates Paystack transfers)
- Processing/Partially Processed: "Refresh status", "Retry all failed"

Beneficiary table columns: Name, Bank, Account (masked), Amount (₦), Fee (₦), Reference, Paystack Ref, Status (pending/processing/succeeded/failed), Actions.

Row actions: "Retry" button for failed items, "Download receipt" for succeeded items (generates printable HTML receipt with Paystack fee breakdown).

Paystack fees: ₦10 for transfers ≤₦5,000; ₦25 for ≤₦50,000; ₦50 for >₦50,000. Fees are capped and shown per item.

Polling: The page uses exponential backoff polling (15s → 30s → 60s → 120s) to verify Paystack transfer status. Polling pauses when the browser tab is hidden. Times out after 30 minutes with a manual refresh option.

Make Recurring: A "Make Recurring" button opens a dialog to set frequency (weekly, biweekly, monthly, custom interval) and next run date. Recurring schedules appear on the Payment Schedule page.',
ARRAY['super_admin','admin','finance'], ARRAY['payments','batch','detail','processing','receipt']),

('Payment Schedule and Recurring Batches',
'The Payment Schedule page (/payments/schedule) gives a forward-looking view of all upcoming financial obligations.

Upcoming payments section groups items by: Overdue (past due date), Today, Tomorrow, This Week, Next Week, Later. Clicking a batch item navigates to /payments/{id}. Clicking a payroll item navigates to /payroll. Clicking subscriptions navigates to /subscriptions.

Summary cards show: Next 7 Days obligations (total ₦), Next 30 Days obligations (total ₦), Overdue count and amount.

Surplus/shortfall alert: Compares Paystack wallet balance against 7-day obligations and shows a green surplus or red shortfall banner.

Recurring schedules table shows: Batch name, Frequency (weekly/biweekly/monthly/custom), Next Run date, Last Run date, Status (active/paused), Actions.

Actions per recurring schedule: Edit (pencil icon — change frequency and next run date), Pause/Resume (toggle), Delete (with confirmation).

Item colour coding: Blue = scheduled batch, Purple = recurring, Green = payroll, Amber = subscription.',
ARRAY['super_admin','admin','finance'], ARRAY['payments','schedule','recurring']),

('Transactions Ledger',
'The Transactions page (/transactions) is a read-only ledger of all financial movements across the platform. Accessible to super_admin, admin, finance.

Columns: Date, Type, Description, Reference (click to copy), Amount (₦), Status, Receipt link.

Transaction types: payment_batch (payments to beneficiaries), quick_pay (ad-hoc transfers), charge (Paystack fees).

Filters:
- Type tabs: All, Quick Pay, Batches, Fees
- Category filter (dynamic from data)
- Status filter: draft, pending, pending_approval, approved, funded, processing, processed, partially_processed, rejected, failed, reversed
- Date range (From / To)
- Search by reference, description, bank, account name, batch name

Actions: Export CSV (with masked account numbers for privacy), Print.

Data source: transactions_view (a Supabase view that aggregates payment_batches and batch_items). Pagination: 25 per page.

Account numbers are masked in the export (e.g. ****1234) to protect beneficiary privacy.',
ARRAY['super_admin','admin','finance'], ARRAY['transactions','ledger','export']),

('Approvals Queue',
'The Approvals page (/approvals) is a unified queue for all items pending review. Accessible to super_admin, admin, finance only.

Item types with their own tabs: Payment Batches, Expenses, Fuel Requests, Budgets, Leave Requests. Each tab shows a count badge of pending items.

For each item the queue shows: submitter name, title/description, amount (where applicable), submission date, urgency indicators.

Actions:
- Approve: Single click. For batches sets approved_by and approved_at. For expenses triggers reimbursement workflow if applicable. For leave updates the balance.
- Reject: Opens a dialog requiring a reason (minimum 10 characters). The reason is stored and shown to the submitter in a notification.
- Bulk approve: Check multiple items → "Approve selected" button with confirmation dialog. Does not support bulk rejection (each rejection needs a reason).

Search: Filter by title, description, or submitter name across all tabs.

Dual approval for expenses: If a company''s dual_approval_threshold_ngn is set in company_settings, expenses above that threshold require two separate approvals. The first approval changes status to pending_second_approval, the second changes it to approved.

Notifications: Submitters receive an in-app notification (and optionally email) when their item is approved or rejected.',
ARRAY['super_admin','admin','finance'], ARRAY['approvals','workflow','queue']);


-- ═══════════════════════════════════════════════════════════════
-- INVOICES, PAYROLL, BUDGETS, SUBSCRIPTIONS, CARDS, EXPENSES
-- ═══════════════════════════════════════════════════════════════

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

('Invoices Module',
'The Invoices page (/invoices) lets finance users create and track outgoing invoices to clients. Accessible to super_admin, admin, finance.

Invoice fields: Invoice number (auto-generated or manual), Client (linked from Clients CRM or free-text name + email), Issue date, Due date, Payment terms (Due on receipt / Net 7 / Net 14 / Net 30 / Net 60), VAT rate (0%, 5%, 7.5%, or 10%), Line items (each with description, quantity, unit price — amount auto-calculates), Notes, Paid date (set when marking as paid.

Invoice statuses: draft → sent → paid (or overdue if past due date and unpaid) → cancelled.

Status tabs: All, Draft, Sent, Overdue, Paid, Cancelled.

Summary stats: Total outstanding (sum of sent + overdue invoices), Total paid this period, Overdue count.

Actions:
- Create new invoice (dialog with all fields + line items)
- Edit invoice (only draft status)
- Send invoice (draft → sent; optionally emails the client)
- Mark as paid (sets paid_date, moves to paid status)
- Cancel invoice
- Delete (draft only)
- Print / Download as printable HTML with company branding, logo, and itemised breakdown

Line items: Add as many rows as needed. Each row: description (required), quantity, unit price (₦). Row amount = quantity × unit price. Subtotal, VAT, and grand total auto-calculate at the bottom.

Filters: Status tab, search by client name or invoice number, date range. Pagination 20 per page.',
ARRAY['super_admin','admin','finance'], ARRAY['invoices','billing','clients','vat']),

('Payroll Module Overview',
'The Payroll page (/payroll) manages monthly salary runs for all employees. Accessible to super_admin, admin, finance.

Payroll run statuses: draft → pending_approval → approved → paid.

Stats shown: Total payroll this month, Employee count, Pending approvals.

Payroll run table columns: Period (YYYY-MM), Employees count, Contractor total (₦), Expenses total (₦), PAYE (₦), Pension — employee share (₦), Pension — employer share (₦), Total burn (₦), Status, Actions.

Actions per run: Submit (draft → pending_approval), Approve (pending_approval → approved), Generate payslips (bulk PDF generation stored in Supabase Storage), Disburse via Paystack (creates a Salary Run batch and initiates transfers), Record as manually paid (marks paid without Paystack), Export CSV, Print HTML summary.',
ARRAY['super_admin','admin','finance'], ARRAY['payroll','salary','overview']),

('Drafting a Payroll Run',
'To draft a new payroll run, click "Draft payroll" on the Payroll page. The system automatically pulls in all approved expenses, active payment batches for the period, and each active employee''s salary from their profile.

Draft payroll dialog fields:
- Period: month in YYYY-MM format (e.g. 2026-04)
- Period type: monthly, quarterly, or annual
- Bonuses: dynamic list — add bonus rows each with a type and amount. Types: Performance Bonus, 13th Month, Christmas Bonus, Ramadan Bonus, Annual Leave Allowance, KD Star Prize, Other
- Housing allowance: percentage of gross salary (applied to all employees)
- Transport allowance per employee: fixed ₦ amount
- Meal subsidy per employee: fixed ₦ amount

The system then calculates for each employee:
- Gross = base salary + housing allowance + transport + meal subsidy + bonuses
- PAYE using Nigerian tax bands: first ₦300k at 7%, next ₦300k at 11%, next ₦500k at 15%, next ₦500k at 19%, next ₦1.6M at 21%, above ₦3.2M at 24%
- Pension: 8% employee contribution, 10% employer contribution (if pension_enabled on employee profile)
- NHF: 2.5% of basic salary (if nhf_enabled)
- NHIS deductions (if nhis_enabled)
- Advances: deducts outstanding salary advance amounts (up to deduction_per_month cap)
- Other deductions: any active employee_deductions for the employee

Net pay = Gross - PAYE - Pension (employee) - NHF - NHIS - Advances - Other deductions.',
ARRAY['super_admin','admin','finance'], ARRAY['payroll','draft','calculations','paye','pension']),

('Budgets Module',
'The Budgets page (/budgets) lets finance teams create department or project budgets and track spend against them. Accessible to super_admin, admin, finance.

Budget fields:
- Name (required)
- Period start date and end date (required; end must be after start)
- Department (optional — link to a department)
- Line items: each with category (autocomplete), description, and planned amount (₦). At least one line item required. Total auto-sums.
- Notes (optional)

Budget statuses: draft → pending_approval → approved → (locked or unlocked).

Actions:
- Submit for approval (draft only)
- Approve (pending_approval; sets approved_by and approved_at)
- Lock / Unlock (approved budgets only — lock prevents new expense submissions in those categories)
- Delete (soft delete via deleted_at)

Utilisation: The progress bar shows actual spend (sum of approved expenses + processed payment batches within the period that match the budget categories) as a percentage of planned total.
- Green: under 80%
- Amber: 80–100%
- Red: over 100% (overspent)

Auto-notifications: System sends an alert when a budget reaches 80% utilisation and another when it exceeds 100%.

Budget lock enforcement: When a budget category is locked, employees cannot submit new expenses in that category — they get a toast error. This is checked at expense submission time.',
ARRAY['super_admin','admin','finance'], ARRAY['budgets','planning','utilisation','lock']),

('Subscriptions Module',
'The Subscriptions page (/subscriptions) tracks recurring software and service subscriptions. Accessible to super_admin, admin, finance.

Fields per subscription:
- Name (e.g. "Slack", "AWS", "Adobe CC")
- Vendor (free text)
- Category: software, hosting, office, telecom, finance, other
- Amount (₦)
- Billing cycle: monthly, quarterly, yearly
- Next renewal date (required)
- Last renewed date (auto-set when marking renewed)
- Status: active or cancelled
- Notes

Stats cards: Total monthly spend (quarterly/yearly amounts are normalised to monthly equivalent), Active subscription count, Due in next 30 days count.

Renewal badge on each row: colour-coded by urgency — red = overdue, amber = due today or within 7 days, accent = within 30 days, grey = further out.

Actions:
- Add new subscription
- Edit subscription
- Mark renewed (sets last_renewed_at to today, auto-calculates next renewal date based on billing cycle)
- Cancel subscription (status → cancelled, can be reactivated)
- Delete subscription (permanent, requires confirmation)
- Export CSV with all subscription details

Auto-notifications: System sends alerts at 7 days, 3 days, and 1 day before each renewal date.

Pagination: 20 per page.',
ARRAY['super_admin','admin','finance'], ARRAY['subscriptions','saas','renewals','billing']),

('Virtual Cards',
'The Virtual Cards page (/cards) tracks per-vendor spending controls for credit/debit card expenses. Accessible to super_admin, admin, finance.

This is a manual tracking register — it does not connect live to a card provider. You record card details and manually update spend amounts.

Fields per card:
- Card name (required, e.g. "Figma Subscription Card")
- Vendor (e.g. "Figma Inc.")
- Last 4 digits of the card number (for identification)
- Monthly limit (₦)
- Current spend (₦) — updated manually
- Linked subscription (optional — dropdown of active subscriptions)
- Notes

Statuses: active (green), paused (amber), deactivated (grey).

Actions:
- Create card record
- Edit card record (update spend, limit, etc.)
- Pause card (active → paused)
- Resume card (paused → active)
- Deactivate card (toggle to deactivated — hides from active list but not deleted)
- Delete card record (permanent, with confirmation — note: does NOT cancel the physical card)

Utilisation bar: Shows current_spend / monthly_limit as a progress bar. Green under 80%, amber at 80%+, red at 100%+. Warning triangle icon appears at 80%+.',
ARRAY['super_admin','admin','finance'], ARRAY['cards','virtual','spending','limits']),

('Expenses Module',
'The Expenses page (/expenses) handles expense claims for all employees. All authenticated users can submit their own expenses. Approvers (finance/admin/super_admin) can see all expenses.

Submitting an expense — required fields:
- Category: select from company expense categories (fuel, maintenance, travel, meals, accommodation, office_supplies, entertainment, training, medical, utilities, subscriptions, repairs, other)
- Payment type: Reimbursement (company owes you money) or Company charge (already paid by company card)
- Amount (₦) — or auto-calculated for mileage claims
- Date
- Description (required, free text)

Optional fields:
- Receipt upload (JPEG/PNG/PDF, auto-compressed). Required for repairs >₦10,000.
- For reimbursements: bank name, account number, account name (for payment processing)
- Mileage claim: enter km travelled and rate per km (₦). Default rate ₦100/km. Amount = km × rate.

Business rules:
- Budget lock enforcement: If a budget with a locked category covers the expense date, submission is blocked with a toast message.
- Policy limits: If company_settings has an expense_limits cap for that category, submissions above the cap are blocked.
- Dual approval threshold: If the amount exceeds dual_approval_threshold_ngn in company_settings, two separate approvals are required.
- Self-approval block: Non-admin users cannot approve their own expenses.

Expense statuses: pending → approved (or rejected, or pending_second_approval if dual-approval required).

After approval, reimbursement expenses can be paid out via Paystack — this creates a payment batch and initiates a transfer to the employee''s bank account.

Filters: Status tabs (All/Pending/Approved/Rejected), category filter, search, date range. Export CSV of approved expenses. Trend chart shows 6-month approved spend by category.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['expenses','reimbursement','mileage','approval']);


-- ═══════════════════════════════════════════════════════════════
-- FLEET, COMPLIANCE, ASSETS, VENDORS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

('Fleet Management Overview',
'The Fleet page (/fleet) manages company vehicles, trip logs, live GPS tracking, and fuel requests. Accessible to all authenticated roles (field_staff can start/end their own trips; managers see all).

The page has five tabs:
1. Trips — Log and view all trip records
2. Vehicles — Manage the vehicle register
3. Live Tracking — Real-time map of active trips
4. Anomalies — Detected driving irregularities
5. Fuel — Fuel request submissions and approvals

Stats shown at the top: Active trips (count), Trips today, Total distance this month (km), Fuel spend this month (₦).',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['fleet','overview','trips','vehicles']),

('Starting and Ending a Trip',
'To log a trip, go to /fleet and click "Start Trip" (or the Start Trip strip at the bottom of mobile screens).

Start Trip form fields:
- Vehicle (required — must select a vehicle from the registered fleet; cannot start without selecting one)
- Odometer start reading (km, required)
- Start location (auto-populated via GPS geocoding to a readable address + coordinates)
- Fuel level at start (optional)
- Notes (optional)

Once started, the trip is recorded as active. The platform begins collecting GPS breadcrumbs every 20 seconds when the device is moving (speed > 3 km/h). GPS fixes with accuracy worse than 50 metres are discarded to prevent jitter.

To end the trip, click "End Trip":
- Odometer end reading (km, required)
- End location (auto-populated via GPS)
- Fuel level at end (optional)
- Notes (optional)
- Summary shows: distance driven (km), estimated fuel used (litres), trip duration

After ending, the trip is saved with start/end coordinates, geocoded addresses, breadcrumb trail, and calculated metrics.

Location display: All location cells show both the geocoded place name (using Google Maps Geocoder or Nominatim as fallback) and the raw GPS coordinates below it in small monospace text.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['fleet','trips','start','end','gps']),

('Fleet Live Tracking and GPS',
'The Live Tracking tab on the Fleet page shows all currently active trips on an interactive Google Map.

Each active trip appears as a moving marker with the driver name, vehicle, current speed, and last update time. Clicking a marker opens a popup with trip details.

GPS breadcrumb trail: Each breadcrumb records latitude, longitude, accuracy (metres), speed (km/h), heading, and timestamp. Breadcrumbs are stored in the breadcrumbs table linked to the trip.

GPS accuracy filtering: Fixes with accuracy > 50 metres are automatically discarded. This prevents the zigzag effect seen when a device is stationary but GPS drifts due to satellite cycling or WiFi triangulation. Only movement-based fixes (speed > 3 km/h) trigger periodic saves.

Trip replay: In the Trip detail modal (TripMapModal), you can replay the route — the marker moves along the breadcrumb trail. The replay uses the raw breadcrumb count for timing but displays a smoothed polyline (points within 15 metres of the previous kept point are skipped) to remove jitter artefacts from older trips.

The map header shows the trip date, driver name, and start → end locations with coordinates.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['fleet','live','tracking','gps','map']),

('Fleet Anomaly Detection',
'The Anomalies tab on the Fleet page lists automatically detected driving irregularities. Managers and admins review these.

Anomaly types detected:
- Sudden stop: Vehicle stopped abruptly (speed drop > threshold in short time)
- Excessive speed: Speed exceeded the configured limit
- Idle time: Vehicle stationary for extended period during an active trip
- Off-route deviation: Vehicle moved outside expected route or geofence

Each anomaly row shows: Trip, Vehicle, Driver, Type, Date/Time, Start location → End location (with coordinates), Severity, and a link to view the full trip on the map.

Anomalies are generated automatically from the breadcrumb data during trip processing. Managers can acknowledge or dismiss anomalies.',
ARRAY['super_admin','admin','operations'], ARRAY['fleet','anomalies','driving','safety']),

('Fleet Geofences',
'Geofences on the Fleet page allow managers to define geographic boundaries and get alerts when vehicles enter or exit them.

Creating a geofence: On the Fleet map, draw a polygon or circle around the area of interest. Give it a name, type (allowed_zone or restricted_zone), and configure alerts (on_enter, on_exit, or both).

Geofence alert types:
- on_enter: Alert when a vehicle enters the zone
- on_exit: Alert when a vehicle leaves the zone
- Both: Alert on both

Each geofence has: name, type, geometry (GeoJSON polygon or circle), status (active/inactive), and alert configuration.

When a trip''s breadcrumb crosses a geofence boundary, a trip_event is created and an in-app notification is sent to the fleet manager. Geofences can be activated or deactivated without deleting them.',
ARRAY['super_admin','admin','operations'], ARRAY['fleet','geofences','alerts','zones']),

('Fleet Fuel Management',
'The Fuel tab on the Fleet page manages fuel requests and approvals.

Submitting a fuel request:
- Vehicle (required)
- Litres requested
- Estimated cost (₦)
- Station/vendor name
- Notes

Fuel request statuses: pending → approved → rejected.

Approved fuel requests are linked to expense records — approving a fuel request can automatically create a corresponding expense entry.

The Fleet stats card shows total fuel spend this month (₦), calculated from approved fuel expenses linked to trips.

Fuel estimates: When a trip ends, the system estimates fuel used based on the distance driven and the vehicle''s configured fuel consumption rate (litres per 100 km), stored in the vehicles table.',
ARRAY['super_admin','admin','operations','field_staff'], ARRAY['fleet','fuel','requests']),

('Compliance Centre',
'The Compliance page (/compliance) tracks statutory filing obligations. Accessible to super_admin, admin, finance.

Filing types: PAYE (monthly payroll tax), Pension (monthly pension remittance), VAT (monthly value added tax), WHT (quarterly withholding tax), TCC (annual tax clearance certificate), CAC (annual corporate affairs filing), ITF (industrial training fund — annual), NSITF (social insurance — monthly).

Statuses: upcoming (due in the future), due (within 3 days of due date — amber), overdue (past due date — red), filed (completed — green).

Default due dates (auto-calculated when adding a filing):
- PAYE: 10th of next month
- Pension: 7th of next month
- VAT: 21st of next month
- WHT (quarterly): 21st after quarter end
- NSITF: 15th of next month
- TCC, CAC, ITF (annual): 31 January next year

Adding a filing: Select filing type, enter period (YYYY-MM or YYYY for annual), optional due date override, optional amount (₦), notes.

Actions: Add, Edit, Mark as filed (records filed_at date and filed_by user), Delete, Export calendar as CSV.

Table columns: Filing type, Period, Due date (with countdown or overdue indicator), Amount, Status.',
ARRAY['super_admin','admin','finance'], ARRAY['compliance','paye','vat','pension','statutory']),

('Asset Register',
'The Assets page (/assets) tracks company physical and digital assets with depreciation calculations. Accessible to super_admin, admin, finance.

Asset categories with CITA (Companies Income Tax Act) depreciation rates:
- Plant & Machinery: 50% initial, 25% annual, 5-year life
- Motor Vehicle: 50% initial, 25% annual, 4-year life
- Furniture & Fittings: 25% initial, 20% annual, 5-year life
- IT Equipment: 50% initial, 25% annual, 3-year life
- Land & Building: 10% initial, 10% annual, 25-year life
- Leasehold Improvement: 25% initial, 20% annual, 5-year life
- Other: 0% rates, 5-year life

Asset fields: Asset number, Name, Category, Description, Purchase date, Cost (₦), Useful life (years), Salvage value (₦), Depreciation method (straight-line or reducing balance), Initial allowance rate, Annual allowance rate, Location, Assigned to (employee), Department, Insurer, Insurance policy number, Insurance expiry, Insurance value (₦), Status, Disposal date, Disposal proceeds (₦), Notes.

Depreciation is calculated live in the UI: Book value = Cost minus accumulated depreciation (straight-line or reducing balance based on months since purchase date).

Statuses: active, disposed, written_off.

Insurance expiry alerts: Badge shows "Expired" (red) or "Ins. expires Xd" (amber) when insurance is within 30 days of expiry.

Actions: Add asset, Edit, change status to disposed/written_off, Delete (soft delete), Export CSV. Filters: status tab (active/disposed/written_off), category, search.',
ARRAY['super_admin','admin','finance'], ARRAY['assets','depreciation','inventory','cita']),

('Vendor Registry',
'The Vendors page (/vendors) manages approved suppliers and service providers. Accessible to super_admin, admin, finance, operations.

Vendor fields:
- Name (required)
- Category: utilities, software, services, supplies, logistics, professional services, other
- Status: active, inactive, blacklisted
- Contact name, email, phone
- Address
- CAC RC Number (Corporate Affairs Commission registration)
- TIN (Tax Identification Number)
- Bank name, account number, account name (for payment reference)
- Payment terms: Immediate, Net 7, Net 14, Net 30, Net 60, Net 90
- Contract value (₦, optional)
- Contract start date, Contract end date
- Notes

Stats cards: Active count, Inactive count, Blacklisted count, Contracts expiring within 30 days.

Contract expiry badge: "Expired" (red) or "Expires in Xd" (amber) when contract end is within 30 days.

Filters: Search by name/contact/email, category filter, status filter (active/inactive/blacklisted/all). Export CSV.

Delete is soft-delete (sets deleted_at). Blacklisting a vendor does not delete it — it stays visible with a destructive badge as a record that this vendor should not be used.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['vendors','suppliers','contracts','procurement']);


-- ═══════════════════════════════════════════════════════════════
-- HR: EMPLOYEES, LEAVE, CONTRACTORS, ATTENDANCE
-- ═══════════════════════════════════════════════════════════════

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

('Employees Module',
'The Employees page (/employees) manages all staff profiles and invitations. Accessible to super_admin, admin, operations, field_staff (field_staff have limited view).

Employee statuses: active, inactive, invited (pending first login).

Inviting an employee: Click "Add employee". Fields: First name, Last name (required), Email (required), Phone, Role (super_admin/admin/finance/operations/field_staff), Department (Finance/Operations/Engineering/People/Sales), Employment type (full_time/part_time/contract/intern), Start date, Tags.

An invitation sends a magic link / password reset email to the employee. The employee appears with status "invited" until they log in for the first time.

Table columns: Name (with tags), Role, Email, Phone, Joined date, Status, Actions.

Actions: Add/Invite, Resend invite, Edit profile, Deactivate (active → inactive), Reactivate (inactive → active), View full profile (/employees/{id}).

Filters: Search by name/email/role/phone, Role dropdown, Show inactive toggle. Results are paginated.',
ARRAY['super_admin','admin','operations'], ARRAY['employees','invite','staff','hr']),

('Employee Profile — Tabs and Sections',
'The Employee Profile page (/employees/{id}) has multiple tabs covering all employee data. Accessible to super_admin and admin only.

Tabs:
1. Job & Pay — Employment details: first/last name, email (read-only), role, department, salary (₦), job title, start date, annual leave days, pension/NHF/NHIS toggles, bank account (verified via Paystack).
2. Personal — Personal info: full name, email, phone, date of birth, gender, marital status, address.
3. Kin — Next of kin: name, phone, email, relationship.
4. Statutory — Pension PIN, NIN (National ID Number), NHF number, NHIS number, TIN.
5. Documents — Upload and view employee documents (employment contract, ID, certificates, etc.).
6. Tasks — Tasks assigned to this employee.
7. Logs — Audit trail of actions on this employee''s record.
8. Leave — Leave request history for this employee.
9. Expenses — Expenses submitted by this employee.
10. Payroll — Payslips for this employee (view and download as HTML).
11. Increments — Salary increment history.
12. Permissions — Extra granular permissions beyond their role.
13. Advances — Salary advances outstanding.
14. Deductions — Active recurring deductions.

Photo upload: Click avatar to upload photo (auto-compressed). Anonymise button (super_admin only): soft-deletes the employee and clears PII after typing "DELETE" to confirm.',
ARRAY['super_admin','admin'], ARRAY['employees','profile','tabs','hr']),

('Salary Increments and Deductions',
'Salary increments are recorded on the employee profile under the Increments tab.

Adding a salary increment: new_salary (₦, required), reason (required), effective_date. This creates a salary_increments record and updates the employee''s salary_ngn. Full history is preserved.

Employee deductions are recurring amounts subtracted from payroll. Managed under the Deductions tab on the employee or contractor profile.

Deduction fields:
- Description (e.g. "Laptop recovery", "Staff loan repayment")
- Amount per period (₦)
- Frequency: monthly, per_payroll_run, or one_time
- Start date
- End date (optional)
- Total deductible amount / cap (optional — deduction stops once this total is reached)
- Status: active, completed, paused

The payroll calculation automatically applies all active deductions for the period. When the total_deductible_amount cap is reached, the deduction status is automatically set to completed.',
ARRAY['super_admin','admin','finance'], ARRAY['salary','increments','deductions','payroll']),

('Leave Management',
'The Leave page (/leave) handles time-off requests for all staff. All roles can submit requests; approvers (finance/admin/super_admin) review and act on them.

Leave types: annual, sick, unpaid.

Submitting a leave request:
- Leave type (required)
- Start date (required)
- End date (required)
- Reason (required)
- Days calculated automatically (end - start + 1)

Statuses: pending → approved or rejected or cancelled.

Actions: Submit request, Approve (manager/admin), Reject (requires reason, min 10 chars), Cancel own pending request, Revert approval (restores leave balance — admin only), Delete (admin only).

Leave balance tracking: Each employee has a leave_balances record per year with: annual_quota (default 12 days), annual_used, sick_used, unpaid_used. Approving annual leave decrements annual_used. Revoking an approval restores the days.

Views: "My Leave" tab shows only the logged-in user''s requests. "Team Leave" tab (managers) shows all employees'' leave with filters.

Filters: Search by employee name, reason, leave type. Status tabs: All, Pending, Approved, Rejected. Date range filter.

Notifications: Employee notified when leave is approved or rejected (in-app + optional SMS).',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['leave','time-off','annual','sick','balance']),

('Contractors Module',
'The Contractors page (/contractors) manages freelancers and external workers paid through batches. Accessible to super_admin, admin, finance, operations.

Two tabs: Contractors (main list) and Applications (pending contractor applications).

Contractor fields:
- First name, Last name (required)
- Email, Phone/WhatsApp
- Bank account: bank name, account number (10 digits, verified via Paystack), account name (auto-fetched)
- LinkedIn Profile URL, LinkedIn email, LinkedIn password (encrypted, admin-only view)
- LinkedIn ID, Default payment amount (₦)
- Date onboarded
- Tags (multi-select)

Onboarding score (0–5): Tracks completeness — points for: name filled, bank verified, LinkedIn ID set, default amount set, agreement/KYC document uploaded. Shown as a progress bar.

CSV bulk import: Upload a CSV with headers: full_name, email, whatsapp_phone, bank_name, account_number, default_amount_ngn, linkedin_id, linkedin_url, heyreach_email, onboarded_at. The system validates each row (checks name required, account number is 10 digits, bank name canonicalization). A preview dialog shows valid and invalid rows before import.

Actions: Add, Edit, Deactivate/Reactivate, Export CSV, Import CSV, View contractor profile (/contractors/{id}). Table columns: Name (with LinkedIn ID and tags), Bank, Account (masked), Default amount, Onboarding progress bar, Status.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['contractors','freelancers','linkedin','onboarding']),

('Contractor Profile',
'The Contractor Profile page (/contractors/{id}) has tabs: Overview, Payments, Onboarding, Documents, Activity, Deductions.

Overview tab: Edit details form — first/last name, phone/WhatsApp, LinkedIn email, LinkedIn password (show/hide toggle, admin-only visibility), LinkedIn URL, default payment amount, internal notes. Separate bank details form — account number (re-verifiable via Paystack), bank (autocomplete combobox), verified account name shown.

Payments tab: Full payment history from batch_items linked to this contractor — date, batch name, amount, status, Paystack reference.

Onboarding tab: Shows the onboarding score checklist. Mark steps complete (agreement signed, KYC uploaded, etc.).

Documents tab: Upload and view documents specific to this contractor (contracts, ID, etc.).

Activity tab: Audit log of all changes to this contractor''s record.

Deductions tab: Same recurring deduction management as employees — description, amount, frequency, dates, cap. Deductions are applied in payroll runs when the contractor is included.

Actions: Edit details, Edit bank details, Deactivate/Reactivate, Delete & Anonymise (super_admin only — soft-deletes and clears PII after confirmation).',
ARRAY['super_admin','admin','finance','operations'], ARRAY['contractors','profile','payments','deductions']),

('Attendance Records',
'The Attendance page (/attendance) tracks daily attendance for employees. Accessible to super_admin, admin, operations.

Attendance statuses: present, absent, late, half_day, remote, on_leave, public_holiday.

Record fields: Employee (required), Work date (required), Clock-in time, Clock-out time, Status (required), Overtime minutes, Notes.

The page defaults to the current month. Use the month picker (start/end date inputs) to view any period.

Filters: Employee filter, Status filter, Search by employee name. Export CSV of filtered records.

Stats shown: Present count, Absent count, Late count, Total overtime minutes for the selected period.

Actions: Add record (manual entry), Edit record, Delete record. Records can be added retroactively.',
ARRAY['super_admin','admin','operations'], ARRAY['attendance','timesheets','clock','overtime']);


-- ═══════════════════════════════════════════════════════════════
-- PERFORMANCE, TRAINING, BENEFITS, ONBOARDING, RECRUITMENT, DISCIPLINARY
-- ═══════════════════════════════════════════════════════════════

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

('Performance Reviews',
'The Performance page (/performance) manages structured review cycles and individual reviews. Accessible to super_admin, admin, finance, operations.

Review cycles — fields: name, cycle type (annual/mid_year/quarterly/probation), period start, period end, due date, status (active/closed).

Individual reviews — fields: cycle, employee, reviewer, review type (manager/self/peer), competency ratings (1–5 stars each for: delivery, communication, teamwork, initiative, leadership), overall rating, strengths (text), areas for growth (text), development plan items, status (draft/submitted/acknowledged).

Development plan items: Each item has a goal, action, due date, and status (open/in_progress/done).

Workflow: Manager creates review → fills ratings and comments → submits → employee acknowledges. Self and peer reviews follow the same flow.

Actions: Create review cycle, Close cycle, Create individual review, Edit review (draft only), Submit review (draft → submitted), Acknowledge review (submitted → acknowledged).',
ARRAY['super_admin','admin','finance','operations'], ARRAY['performance','reviews','cycles','ratings']),

('Training and Certifications',
'The Training page (/training) tracks employee learning and professional certifications. Accessible to super_admin, admin, finance, operations.

Record type: training or certification.

Training/certification fields: Employee, Type (training or certification), Title, Provider, Category (professional_development/compliance/safety/technical/leadership/software/other), Mandatory toggle, Start date, Completion date, Expiry date (for certifications), Score (%), Certificate URL, Cost (₦), Status, Notes.

Statuses: completed, in_progress, pending, expired (auto-set when expiry date is in the past).

Expiry alert: Badge shows when a certification expires within 30 days.

Filters: Type, Status, Category, Employee, Search by title/provider/employee name. Export CSV. Soft delete (deleted_at). Pagination.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['training','certifications','learning','compliance']),

('Employee Benefits',
'The Benefits page (/benefits) tracks employee benefit packages like health insurance, pension, and life assurance. Accessible to super_admin, admin, finance, operations.

Benefit types: hmo (Health/Medical), pension_pfa (Pension PFA), group_life (Life Assurance), other.

Fields per benefit: Employee, Type, Provider (required), Plan name, Policy number, PFA RSA PIN (for pension), Premium (₦), Premium frequency (monthly/quarterly/annually — normalised to monthly equivalent for display), Enrollment date, Expiry date, Status (active/suspended/expired), Notes.

Stats: Total monthly benefits cost, counts by type, expiring soon count.

Actions: Add benefit, Edit, Delete, Export CSV. Filters: Type, Status, Employee, Search by provider.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['benefits','hmo','pension','insurance']),

('Onboarding and Offboarding',
'The Onboarding page (/onboarding) manages structured checklists for new hires and departing employees. Accessible to super_admin, admin, operations.

Checklist types: onboarding or offboarding.

Creating a checklist: Select employee, type, target completion date, notes. Toggle "Seed defaults" to pre-populate with standard items.

Default onboarding items automatically added: Collect signed employment contract (documentation), Obtain valid ID and passport photos (documentation), Register employee on HRIS (hr_admin), Enrol on HMO/NHIS scheme (hr_admin), Set up pension PFA account (hr_admin), Collect bank account details for payroll (finance), Create corporate email account (it_setup), Set up laptop/workstation (it_setup), Issue ID card and access pass (equipment), Introduce to team and line manager (introduction), Complete company policy induction (training).

Default offboarding items: Collect resignation/termination letter, Process final salary computation, Issue certificate of employment, Revoke system/email access, Retrieve company devices, Collect ID card and access pass, Settle outstanding advances, Complete exit interview.

Item categories: documentation, it_setup, hr_admin, finance, training, equipment, introduction, other. Each item has: title, description, assigned_to (employee responsible), due date, completed toggle.

Progress bar: Shows percentage of items completed (0% = Pending, 1-99% = In Progress, 100% = Completed).

Actions: Create checklist, Add custom items, Toggle item complete/incomplete, Edit item, Delete item, Delete checklist.',
ARRAY['super_admin','admin','operations'], ARRAY['onboarding','offboarding','checklist','hr']),

('Recruitment Pipeline',
'The Recruitment page (/recruitment) manages job openings and candidate applications. Accessible to super_admin, admin, operations.

Job Opening fields: Title (required), Department, Description, Requirements, Employment type (full_time/part_time/contract/intern), Location, Salary range (min/max ₦), Number of openings, Closing date, Status (draft/published/closed/filled), Notes.

Opening statuses: draft → published → closed or filled.

Applicant fields: Full name (required), Email, Phone, CV URL, Cover letter, Source (job_board/referral/walk_in/internal/linkedin/other), Stage, Stage notes, Assigned reviewer, Interview date, Offer amount (₦), Offered date, Rejection reason.

Applicant pipeline stages (in order): new → screening → interview_1 → interview_2 → offer → hired or rejected.

Stage badges: new (grey), screening (outline), interview_1 (outline), interview_2 (outline), offer (default/blue), hired (default/blue), rejected (destructive/red).

Actions: Create opening, Edit opening, Publish/Close/Mark filled, Add applicant to opening, Advance applicant stage, Move to rejected, Record interview details and offer amount, Delete applicant, Delete opening, Export applicants CSV.',
ARRAY['super_admin','admin','operations'], ARRAY['recruitment','hiring','applicants','pipeline','jobs']),

('Disciplinary Records',
'The Disciplinary Records page (/disciplinary) is a confidential HR module for recording workplace incidents. Accessible to super_admin and admin ONLY.

Incident types: verbal_warning, written_warning, final_warning, query (Show Cause), suspension, termination, counselling, other.

Record fields: Employee (required), Incident date (required), Incident type (required), Subject (required, brief description), Description (detailed narrative), Outcome, Suspension days (for suspension type), Issued by (HR officer), Acknowledged by (employee), Acknowledged date.

Expungement: Records can be expunged (hidden from view) after a redemption period. Expunging requires a reason and sets is_expunged=true and expunged_at. Expunged records are hidden by default — toggle "Show expunged" to view them.

Employee responses: Each record can have one or more written responses from the employee (response_text, responded_by, responded_at). Useful for show-cause queries.

Filters: Search by employee name or subject, filter by incident type, filter by employee. "Show expunged" toggle. Export CSV.

All access to disciplinary records is logged in the audit trail.',
ARRAY['super_admin','admin'], ARRAY['disciplinary','warnings','hr','confidential','sensitive']);


-- ═══════════════════════════════════════════════════════════════
-- TASKS, GOALS, KNOWLEDGE BASE, DOCUMENTS, REPORTS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

('Tasks Module',
'The Tasks page (/tasks) is a shared task management board for all authenticated users. All roles can view and create tasks; each user sees tasks assigned to them or created by them, plus managers see all tasks.

Task fields: Title (required), Description, Assignee (employee dropdown), Due date, Priority, Status, Tags (multi-select from the tags system), Created by.

Priority levels (highest to lowest): critical (red), high (amber), normal (blue), low (grey).
Status values: open (grey), in_progress (blue), blocked (red), complete (green).

Comments: Each task has a comment thread. Click a task row to see details and add comments. Comments show author name and timestamp.

Stats cards: Open tasks, In Progress, Blocked, Completed today.

Table columns: Title, Assignee, Due date (with overdue indicator), Priority badge, Status badge, Tags, Actions (edit, delete).

Actions: Create task, Edit task, Mark complete (status → complete, sets completed_at), Delete task (with confirmation). Tasks can be filtered by status, priority, assignee, and searched by title.

Due date colouring: Overdue tasks show the due date in red. Tasks due today show in amber.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['tasks','todo','assignments','productivity']),

('Goals and OKRs',
'The Goals page (/goals) tracks company, team, and individual objectives. All authenticated users can view and create goals.

Goal fields: Title (required), Description, Scope (company/team/individual), Owner (employee), Department (for team-scoped goals), Quarter (format: YYYY-Q1/Q2/Q3/Q4), Status, Progress percentage (0–100), Notes.

Scopes: company (building icon — visible to all), team (group icon — departmental), individual (person icon — personal goal).

Statuses: open (grey), in_progress (blue), complete (green), missed (red).

Quarter selector: Dropdown showing current quarter and surrounding quarters (e.g. 2026-Q1, 2026-Q2, 2026-Q3, 2026-Q4).

Progress: Manually updated percentage. Shows as a progress bar in the goal card. When progress hits 100%, the status can be set to complete.

Stats cards: Total goals this quarter, Complete count, In Progress count, Missed count.

Actions: Create goal, Edit goal (title, description, progress, status, scope, owner, quarter), Delete goal (with confirmation), Export CSV of all goals.

Field staff can track their personal goals. Managers can see all goals across scopes.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['goals','okr','objectives','progress']),

('Internal Knowledge Base',
'The Knowledge page (/knowledge) stores company how-to articles, policies, and SOPs accessible to all staff. All authenticated users can read articles; super_admin, admin, finance, and operations users can create and edit articles.

Article fields: Title (required), Category (finance/hr/operations/compliance/general/engineering), Body (rich text / markdown), Published toggle (unpublished articles are only visible to authors and admins), Version number (auto-incremented on save).

Categories and their badge colours: Finance Policies (green), HR Policies (blue), Operations (purple), Compliance (red), General (grey), Engineering (accent).

Versioning: Every save creates a version snapshot in knowledge_article_versions. Click the history icon on an article to view previous versions and restore them.

Actions: Create article, Edit article, Delete article, Publish/Unpublish, View version history, Restore a previous version.

Search: Real-time search by title with debouncing. Filter by category.

This is the internal knowledge base for company policies and SOPs — it is separate from the AI chatbot''s knowledge base (which is managed in /assistant/admin).',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['knowledge','articles','policies','sop','documentation']),

('Documents Module',
'The Documents page (/documents) is a centralised file store for company documents. Accessible to finance/admin/super_admin for upload/edit/delete; all roles can view/download.

Document fields: Title (required), Category (contract/receipt/invoice/id_document/policy/report/other), File upload (PDF/PNG/JPG/JPEG/WEBP/DOC/DOCX/XLS/XLSX/CSV/TXT — max 25MB), Expiry date (optional, for contracts and licences), Description, Tags, Visible to roles (access control per document).

File storage: Files are uploaded to Supabase Storage. The storage_path, mime_type, and file_size_bytes are recorded.

Expiry alerts: Documents with expiry dates approaching within 30 days show an amber badge. Expired documents show a red badge.

File type icons: PDF (document icon), images (image icon), spreadsheets (spreadsheet icon), Word docs (document icon), other (file icon).

Actions: Upload document, Edit metadata (title, category, tags, expiry, visibility), Download (signed URL from Supabase Storage), Delete (super_admin/admin only). Pagination 20 per page. Search by title, filter by category.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['documents','files','storage','contracts','policies']),

('Reports — All Nine Report Tabs',
'The Reports page (/reports) provides cross-module analytics with a configurable date range. Accessible to super_admin, admin, finance. Date range defaults to start of current year to today.

The nine report tabs:

1. P&L (Profit & Loss): Total income (invoices marked paid) vs. total expenditure (processed payment batches + approved expenses + payroll disbursements). Shows net profit/loss, month-by-month bar chart, and key metrics.

2. Cash Flow: Monthly cash in vs. cash out line chart. Shows opening balance, closing balance, and net movement per month. Sourced from transactions_view.

3. Concentration Risk: Pie chart showing spend distribution by vendor/beneficiary. Flags if any single payee receives >30% of total spend (concentration risk alert). Also shows top 10 beneficiaries by amount.

4. Payments: Payment batch analysis — total disbursed, success rate, failed count, average batch size. Bar chart of disbursements by month. Paystack fee summary. Batch status breakdown.

5. Expenses: Expense breakdown by category (pie chart + table). Month-by-month spend trend. Top submitters. Reimbursement vs. company charge split.

6. Fleet: Fleet utilisation — trips count, total km, fuel consumption, fuel cost. Per-vehicle breakdown. Month-by-month trip activity.

7. Contractors: Contractor payment summary — total paid per contractor, payment count, average payment. Month-by-month contractor spend.

8. Budgets: Budget vs. actual comparison. For each approved budget: planned total, actual spend, utilisation %, over/under budget status.

9. Reconciliation: Compares payment_batches records against Paystack transfer records. Flags discrepancies between batch amounts and actual transfers processed. Shows unmatched items requiring manual review.

All tabs support CSV export of the underlying data.',
ARRAY['super_admin','admin','finance'], ARRAY['reports','analytics','pnl','cashflow','finance','fleet']);


-- ═══════════════════════════════════════════════════════════════
-- CRM, PROJECTS, SETTINGS, PROFILE, AUDIT LOG, AI ASSISTANT
-- ═══════════════════════════════════════════════════════════════

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

('Contacts CRM',
'The Contacts page (/contacts) is a general-purpose contact directory for leads, partners, and external contacts. Accessible to super_admin, admin, finance, operations.

Contact types: lead, student, contact, partner.
Contact statuses: new, contacted, qualified, converted, lost.

Fields: Full name (required), First/last name, Email, Phone, Contact type, Source (where the contact came from), Status, Company, Job title, Address, LinkedIn URL, Notes, Tags, Linked client (optional — connect to a client record).

Two tabs: Contacts list (table view) and a pipeline/board view grouped by status.

Table columns: Name, Type, Email, Phone, Status badge, Company, Tags, Actions.

Actions: Add contact, Edit contact, Delete contact (with confirmation), View contact profile (/contacts/{id}), Export CSV. Filters: Type, Status, Search by name/email/company. Pagination 20 per page.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['contacts','crm','leads','directory']),

('Contact Profile',
'The Contact Profile page (/contacts/{id}) shows full details for a single contact and their interaction history.

Profile sections: Contact details (all fields from the Contacts form), Activity timeline showing all notes and interactions, Linked client record (if any).

Actions: Edit contact details, Add interaction note (free text, timestamped), Link to a client record, Delete contact.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['contacts','profile','crm','activity']),

('Clients CRM',
'The Clients page (/clients) manages client accounts and relationships. Accessible to super_admin, admin, finance, operations.

Client statuses: prospect (not yet active), active (current client), inactive (churned or paused).

Fields: Name (required), Industry, Status, Contract value (₦), Contact person name, Email, Phone, Website, Address, Start date, Notes.

Stats: Active clients count, Prospect count, Total contract value (₦) of active clients.

Table columns: Name, Industry, Status badge, Contract value, Contact person, Actions.

Actions: Add client, Edit client, Delete client (with confirmation), View client profile (/clients/{id}), Export CSV. Filters: Status tabs (All/Active/Prospects/Inactive), Search by name/email/industry. Pagination 20 per page.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['clients','crm','accounts','revenue']),

('Client Profile',
'The Client Profile page (/clients/{id}) shows full client details plus linked invoices.

Sections: Client details (all fields), Linked invoices (list of invoices associated with this client — amounts, dates, statuses), Interaction timeline (notes and activity log).

Actions: Edit client details, Add interaction note, View linked invoices, Navigate to a specific invoice.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['clients','profile','invoices','crm']),

('Referrals',
'The Referrals page (/referrals) manages the platform''s referral programme. Accessible to all authenticated users.

Each user has a unique referral code and link. When someone signs up using the link, a referral record is created.

Referral record fields: Referrer, Referred email, Status (pending/active/inactive), Is affiliate (toggle for affiliate partners), Commission percentage, Commission earned (₦).

Regular users see only their own referrals and total commission earned. Admin/super_admin can see all referrals, toggle affiliate status, and edit commission rates.

Actions (admin only): Add referral manually, Edit referral (commission rate, affiliate toggle), Delete referral. Actions (all users): View own referrals, copy referral link. Export CSV (admin). Pagination 20 per page.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['referrals','commission','affiliate','growth']),

('Projects Module',
'The Projects page (/projects) tracks internal and client projects with milestones and linked tasks. Accessible to super_admin, admin, finance, operations.

Project fields: Name (required), Description, Client (linked from CRM), Owner (employee), Department, Status, Priority, Budget (₦), Start date, End date, Notes.

Project statuses: planning (blue), active (green), on_hold (amber), completed (green outline), cancelled (grey).
Project priorities: critical (red), high (amber), normal (grey), low (light grey).

Milestones: Each project can have milestones with title, due date, and status (pending/complete). Milestones show as a sub-list under the expanded project row. A "Mark complete" button sets completed_at.

Linked tasks: Tasks with project_id set to this project are shown in the expanded project view.

Progress bar: Calculated from completed milestones / total milestones.

Actions: Create project, Edit project, Add milestone, Toggle milestone complete, Delete project (with confirmation). Filter by status, search by name. Expand row to see milestones and tasks.',
ARRAY['super_admin','admin','finance','operations'], ARRAY['projects','milestones','management','planning']),

('Settings Page',
'The Settings page (/settings) is accessible to super_admin ONLY. It controls all platform-wide configuration.

Settings tabs:

Organisation: Company name, trading name, logo upload (displayed on receipts and payslips), address, registration number, website URL, social media links (LinkedIn, Instagram, Facebook, Twitter), timezone (IANA timezone string — e.g. Africa/Lagos — affects all date/time displays across the platform).

Finance & Banking: Current cash balance (manually updated, shows staleness warning if >7 days old), external monthly burn (₦ — off-platform costs not tracked in KDOps, used for runway calculation), monthly revenue estimate (₦ — optional, used for runway), dual approval threshold (₦ — expenses above this require two approvals), expense category limits (per-category caps that block submissions above the limit).

Paystack: Integration mode (test or live), public key, secret key (encrypted). Validation enforces that live mode keys must start with pk_live_ and sk_live_. Test keys start with pk_test_ and sk_test_.

Payroll: Default annual leave days, probation period (months), default pension rate, default NHF rate.

Notifications (per-user): Toggle email notifications per event type — approval requests, payment status changes, compliance deadlines, expense updates, fleet activity, leave requests. Digest frequency: immediate, hourly, daily, or never.

Security: Session timeout (minutes), audit log retention (days).

Fleet: Weekly fuel budgets per vehicle category.

Tags: Create and manage tags used across modules (employees, contractors, tasks, contacts). Tags have a name, colour, and module scope.',
ARRAY['super_admin'], ARRAY['settings','configuration','paystack','organisation','timezone']),

('User Profile Page',
'The Profile page (/profile) is accessible to all authenticated users to view and update their own information.

Editable fields: Full name, Phone number.
Read-only: Email address (cannot be changed from here), Role (shown as a badge), Join date.

Password change: Enter current password, new password, confirm new password. Uses Supabase Auth''s updateUser method.

Payslips section: Lists all payslips generated for this user (most recent first). Each row shows: Period (e.g. "April 2026"), Gross pay, PAYE deducted, Pension deducted, NHF deducted, Net pay. Download button opens a signed URL to the stored HTML payslip or re-generates it on the fly.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['profile','account','password','payslips']),

('Audit Log',
'The Audit Log page (/audit) is accessible to super_admin and admin only. It records every significant action taken on the platform.

Each log entry shows: Action type (e.g. batch_approved, expense_rejected, employee_deactivated), Description (human-readable summary), Performed by (name), Date and time, Entity ID (the record that was changed), IP address (where available).

Filters: Search by action type, description, or performer name. Date range filter. Export CSV.

All audit entries are created via the logAudit() function called throughout the codebase after every significant operation. This cannot be disabled and cannot be edited or deleted — it is an immutable record.',
ARRAY['super_admin','admin'], ARRAY['audit','security','logging','compliance','trail']),

('AI Assistant — User Guide',
'The AI Assistant (/assistant) is available to all authenticated users. It can answer questions about the KD-Ops platform, your company data, and general business topics.

Features:
- Chat with Groq Llama 3.3 70B (fast, free) for text conversations
- Upload images or PDFs and ask questions about them (uses Google Gemini 1.5 Flash for vision)
- Toggle the globe icon to enable real-time web search via Tavily (current news, rates, etc.)
- Live NGN/USD exchange rates are auto-fetched when you ask about currency (via open.er-api.com, no key needed)
- Platform knowledge base search — the bot automatically searches the internal knowledge base for relevant articles

The floating chat widget (violet bot icon, bottom-right of every page) gives quick access without leaving your current page. Click the expand icon to open the full /assistant view.

Conversation history: All conversations are saved. The left sidebar shows your conversation list with timestamps. Click any conversation to resume it. Pin important conversations. Delete old ones.

File uploads: Supported formats — images (PNG, JPG, JPEG, WEBP, GIF), PDFs, text files (TXT, CSV, MD). Max 10MB per file. Files are processed in-memory and not stored in the database.

Daily usage limit: Configured by your super admin (default 50 messages per user per day). Your usage counter is shown in the header.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['assistant','ai','chatbot','help']),

('AI Assistant Admin Configuration',
'The AI Assistant Admin page (/assistant/admin) is accessible to super_admin ONLY. It has three tabs:

Brain tab (configuration):
- System prompt: The base instructions the AI follows for every conversation. Customise the bot''s persona, tone, and knowledge boundaries.
- Text model: Groq model name (default: llama-3.3-70b-versatile)
- Vision model: Gemini model name (default: gemini-1.5-flash)
- Daily message limit per user (default: 50)
- Toggle switches: Enable web search (Tavily), Enable FX rates (open.er-api.com), Enable knowledge base search (RAG via pgvector)
- Master enable/disable switch: Turns the entire chatbot on or off for all users

Knowledge tab:
- Add knowledge articles (title, content, visible_to_roles — controls which roles see this knowledge)
- Edit existing entries
- Delete entries
- Embed single entry (runs through Gemini text-embedding-004 to generate the vector)
- Re-embed all (bulk regenerates all embeddings — use after adding many entries)
- Embedding status badge: shows "Embedded" (green) or "Not embedded" (amber/grey) per entry

Usage tab:
- Per-user message counts for today and this month
- Total API calls and estimated token usage across all users

The knowledge base here is separate from the internal Knowledge Base (/knowledge). This is specifically for training the AI assistant on company-specific information.',
ARRAY['super_admin'], ARRAY['assistant','admin','ai','configuration','knowledge','embeddings']),

('Dashboard',
'The Dashboard (/ or /dashboard) is the first page after login. All authenticated roles see a personalised view.

Field staff view: KPI cards showing their own pending expenses count, remaining annual leave days, assigned open tasks count, and pending fuel requests. Quick links to submit a new expense or request leave.

Finance/Admin view:
- KPI cards: Total headcount, Total disbursed this month (₦), Pending approvals count, Fleet fuel spend this month (₦).
- Budget utilisation donut chart with spend vs. planned.
- Quick action buttons: Create batch, Go to Approvals, View Clients, Check Subscriptions, Open Reports, Run Payroll.
- Financial Health score card (based on cash runway, budget adherence, overdue invoices).
- Cash Burn card (monthly burn rate from Settings).
- Compliance card (upcoming statutory filing deadlines).
- Upcoming subscriptions due in 30 days.
- Upcoming payment batches due in 7 days.
- Recent activity (last 15 audit log entries).

The greeting changes based on time of day: Good morning / afternoon / evening / night.

Data auto-refreshes when you switch back to the browser tab.',
ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['dashboard','home','overview','kpi']);
;
