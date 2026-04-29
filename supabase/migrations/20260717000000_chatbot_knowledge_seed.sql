-- Seed the chatbot knowledge base with platform documentation.
-- Embeddings are initially NULL — run a bulk embed from AssistantAdmin once the
-- GEMINI_API_KEY secret is configured.

INSERT INTO chatbot_knowledge (title, content, visible_to_roles, tags) VALUES

-- ── Platform overview ────────────────────────────────────────────────────────
('KD-Ops Platform Overview',
 'KD-Ops is an all-in-one business operations hub for Nigerian SMBs and enterprises. It covers Finance (payments, payroll, budgets, invoices, expenses, virtual cards), HR (employees, contractors, leave, attendance, recruitment, onboarding, performance, benefits, disciplinary), Operations (fleet, tasks, projects, compliance, assets, training), and CRM (clients, contacts, referrals, vendors). All data is scoped to your organisation and protected by role-based access control.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['overview','platform']),

-- ── Roles ────────────────────────────────────────────────────────────────────
('User Roles & Permissions',
 'KD-Ops has five roles: super_admin (full access including settings and AI config), admin (full access except settings), finance (payments, payroll, budgets, invoices, compliance, reports), operations (fleet, expenses, contractors, vendors, projects), field_staff (fleet, expenses, leave, tasks, goals, referrals). Roles are assigned per-user and control which sidebar items and routes are visible. Super admin can also grant extra permissions via the permissions JSONB column on profiles.',
 ARRAY['super_admin','admin'], ARRAY['roles','permissions','access']),

-- ── Payments ─────────────────────────────────────────────────────────────────
('Payments & Payment Batches',
 'The Payments module lets finance users create payment batches (groups of individual payments to vendors, employees, or contractors). A batch starts in draft, moves to pending_approval, then approved, and finally processed/failed. Approvers (finance, admin, super_admin) can approve or reject from the Approvals page. Payments support Naira (NGN) and USD. You can schedule a batch for a future date using Payment Schedule. Each batch records the amount, currency, beneficiary, reference, and status history.',
 ARRAY['super_admin','admin','finance'], ARRAY['payments','batches','approval']),

-- ── Payroll ──────────────────────────────────────────────────────────────────
('Payroll Intelligence',
 'The Payroll module calculates and tracks employee salary runs. It supports gross salary, deductions (tax, pension, NHF), net pay, and bank details per employee. Payroll runs are created monthly and go through a review → approve → disburse cycle. It integrates with the employee profiles for salary data. Finance and admin roles can manage payroll; employees can view their own payslips via their profile.',
 ARRAY['super_admin','admin','finance'], ARRAY['payroll','salary','deductions']),

-- ── Fleet ────────────────────────────────────────────────────────────────────
('Fleet Management',
 'Fleet covers vehicles, trip logs, live GPS tracking, geofences, fuel management, and maintenance schedules. Field staff can start and end trips from the mobile-friendly Fleet page. Each trip records start/end location (geocoded address + coordinates), odometer readings, fuel used, distance (km), and breadcrumb trail. The Live Tracking tab shows active trips on a map. Anomaly detection flags sudden stops, excessive speed, idle time, and off-route deviations. Geofences can be drawn on the map and alert when vehicles enter or exit.',
 ARRAY['super_admin','admin','operations','field_staff'], ARRAY['fleet','vehicles','trips','gps']),

-- ── Expenses ─────────────────────────────────────────────────────────────────
('Expenses',
 'Any authenticated user can submit expense claims with a category, amount, currency, description, and optional receipt attachment. Expenses flow through submitted → approved/rejected by managers. Finance can see all expenses; field staff see only their own. Reports show expense totals by category and date range.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['expenses','reimbursement']),

-- ── Budgets ──────────────────────────────────────────────────────────────────
('Budgets',
 'The Budgets module lets finance create department or project budgets with a total amount, period (monthly/quarterly/annual), and category. Actual spend is tracked automatically from approved payments and expenses. Budget cards show progress bars with spent vs. remaining. Alerts fire when a budget reaches 80% or 100% utilisation.',
 ARRAY['super_admin','admin','finance'], ARRAY['budgets','spend','departments']),

-- ── Invoices ─────────────────────────────────────────────────────────────────
('Invoices',
 'Create and manage outgoing invoices to clients. Each invoice has line items, tax rate, due date, and status (draft/sent/paid/overdue). Invoices can be linked to a client record in the CRM. Finance can record payments against invoices to mark them paid.',
 ARRAY['super_admin','admin','finance'], ARRAY['invoices','billing','clients']),

-- ── Virtual Cards ────────────────────────────────────────────────────────────
('Virtual Cards',
 'Issue and manage virtual payment cards for team members. Each card has a spending limit, category restrictions, and can be frozen or cancelled instantly. Transactions against each card are logged automatically.',
 ARRAY['super_admin','admin','finance'], ARRAY['cards','virtual','spending']),

-- ── Employees & HR ───────────────────────────────────────────────────────────
('Employee Management',
 'The Employees module (admin/super_admin only) stores full employee profiles: personal info, job title, department, start date, salary, bank details, role, emergency contacts, and documents. From an employee profile you can view payslips, leave history, performance reviews, attendance records, and disciplinary records. Employees can view and update their own profile via the Profile page.',
 ARRAY['super_admin','admin'], ARRAY['employees','hr','profiles']),

('Leave Management',
 'All employees can submit leave requests with type (annual, sick, maternity/paternity, unpaid), start/end dates, and reason. Managers approve or reject via the Leave page. Each employee has an annual leave balance that decrements when leave is approved. A calendar view shows who is on leave each day.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['leave','time-off','approval']),

('Recruitment Pipeline',
 'Manage job postings and candidate applications. Each job has a title, department, required skills, and pipeline stages (applied → screening → interview → offer → hired/rejected). You can add notes and scorecards per candidate.',
 ARRAY['super_admin','admin','operations'], ARRAY['recruitment','hiring','candidates']),

('Attendance & Timesheets',
 'Clock-in and clock-out records for employees. Managers can view daily and weekly attendance summaries, flag lateness or absences, and export timesheets for payroll reconciliation.',
 ARRAY['super_admin','admin','operations'], ARRAY['attendance','timesheets','hours']),

('Performance Reviews',
 'Structured performance review cycles with goal ratings, competency scores, and manager comments. Reviews can be 360° (peer + manager + self) or manager-only. Historical reviews are stored on the employee profile.',
 ARRAY['super_admin','admin','operations'], ARRAY['performance','reviews','kpis']),

-- ── Tasks & Goals ────────────────────────────────────────────────────────────
('Tasks',
 'A shared task board for all authenticated users. Tasks have title, description, priority (low/medium/high/urgent), due date, assignee, and status (todo/in_progress/done). You can filter by assignee, priority, or due date. Tasks can be linked to projects.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['tasks','todo','productivity']),

('Goals & OKRs',
 'Set personal and company-wide goals with measurable key results. Each goal has a target, current value, owner, and deadline. Progress is tracked as a percentage. Goals are visible to all authenticated users.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['goals','okr','targets']),

-- ── CRM ──────────────────────────────────────────────────────────────────────
('Clients CRM',
 'Manage client relationships. Each client record has contact details, company, industry, tier (prospect/active/churned), and linked invoices. The timeline shows all interactions. Managers and above can access Clients.',
 ARRAY['super_admin','admin','finance','operations'], ARRAY['clients','crm','accounts']),

('Contacts',
 'A general-purpose contact book for vendors, partners, and leads. Contacts can be linked to client records. Supports custom tags and notes.',
 ARRAY['super_admin','admin','finance','operations'], ARRAY['contacts','directory']),

('Referrals',
 'Any authenticated user can generate a referral link. When someone signs up via their link, the referrer earns credit. The Referrals page shows your referral code, link, and all successful referrals.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['referrals','growth']),

-- ── Compliance & Documents ───────────────────────────────────────────────────
('Compliance Centre',
 'Track regulatory and internal compliance items: licenses, certifications, filings, and policy acknowledgements. Each item has a due date, responsible owner, and status (compliant/at_risk/overdue). Dashboard shows upcoming deadlines.',
 ARRAY['super_admin','admin','finance'], ARRAY['compliance','regulatory','risk']),

('Documents',
 'Centralised document store for policies, contracts, templates, and shared files. Documents have categories, tags, and access controls. Finance, admin, and super_admin roles can manage documents.',
 ARRAY['super_admin','admin','finance'], ARRAY['documents','files','storage']),

-- ── Knowledge Base ───────────────────────────────────────────────────────────
('Internal Knowledge Base',
 'The Knowledge Base (accessible to all authenticated users) stores how-to guides, SOPs, and FAQs. Each article has a title, body, category, and access level. Super admins can add articles via AssistantAdmin. The AI assistant retrieves relevant knowledge articles automatically when answering your questions.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['knowledge','documentation','sop']),

-- ── AI Assistant ─────────────────────────────────────────────────────────────
('AI Assistant — How to Use',
 'The AI assistant (powered by Groq Llama 3.3 70B) can answer questions about KD-Ops, search the web for current information (click the globe icon), analyse uploaded images and PDFs, look up live NGN/USD exchange rates automatically, and retrieve knowledge from the internal knowledge base. Every authenticated user can chat. Super admins manage the assistant from /assistant/admin — they can edit the system prompt, set daily message limits per user, add knowledge articles, and toggle features on/off.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['assistant','ai','chatbot']),

-- ── Settings & Profile ───────────────────────────────────────────────────────
('Settings (Super Admin)',
 'The Settings page is accessible only to super admins. It covers: Organisation profile (name, logo, timezone, currency), billing, integrations, notification preferences, and security settings (2FA enforcement, session timeout). The timezone set here is used across all date/time displays in the platform.',
 ARRAY['super_admin'], ARRAY['settings','organisation','config']),

('User Profile',
 'Every authenticated user has a Profile page (/profile) where they can update their display name, avatar, phone number, and notification preferences. Employees can also view their payslips and leave balance here. The profile page does not expose sensitive HR data like salary to non-admin roles.',
 ARRAY['super_admin','admin','finance','operations','field_staff'], ARRAY['profile','account','settings']),

-- ── Audit ────────────────────────────────────────────────────────────────────
('Audit Log',
 'The Audit Log (admin and super_admin only) records every significant action in the platform: logins, data changes, approvals, deletions. Each entry shows who did what, when, and from which IP. Useful for compliance investigations and security reviews.',
 ARRAY['super_admin','admin'], ARRAY['audit','security','logging']),

-- ── Vendors ──────────────────────────────────────────────────────────────────
('Vendor Registry',
 'Manage approved suppliers and vendors. Each vendor has contact details, payment terms, category (fuel/maintenance/services/etc.), and linked payment history. Managers and above can add and edit vendors.',
 ARRAY['super_admin','admin','finance','operations'], ARRAY['vendors','suppliers','procurement']),

-- ── Assets ───────────────────────────────────────────────────────────────────
('Asset Register',
 'Track physical and digital company assets: laptops, vehicles, equipment, software licences. Each asset has acquisition cost, current value, depreciation schedule, assigned user, and maintenance history. Finance and admin roles manage the register.',
 ARRAY['super_admin','admin','finance'], ARRAY['assets','inventory','depreciation']),

-- ── Subscriptions ────────────────────────────────────────────────────────────
('Subscriptions',
 'Monitor recurring software and service subscriptions. Each subscription has vendor, amount, billing cycle (monthly/annual), renewal date, and status. Finance can see upcoming renewals and cancel or renew directly from the list.',
 ARRAY['super_admin','admin','finance'], ARRAY['subscriptions','saas','renewals']),

-- ── Projects ─────────────────────────────────────────────────────────────────
('Project Tracker',
 'Manage internal projects with milestones, tasks, and team assignments. Each project has a budget, timeline, status (planning/active/on_hold/completed), and linked tasks. Managers can create and oversee projects.',
 ARRAY['super_admin','admin','operations'], ARRAY['projects','milestones','management']),

-- ── Training ─────────────────────────────────────────────────────────────────
('Training & Certifications',
 'Track employee training programmes and professional certifications. Each record shows course name, provider, completion date, expiry date, and who it applies to. Managers get alerts when certifications are about to expire.',
 ARRAY['super_admin','admin','operations'], ARRAY['training','certifications','learning']),

-- ── Onboarding ───────────────────────────────────────────────────────────────
('Onboarding & Offboarding',
 'Structured checklists for bringing new employees in and exiting departing ones. Each checklist step has an owner, due date, and completion status. Templates can be reused across hires.',
 ARRAY['super_admin','admin','operations'], ARRAY['onboarding','offboarding','hr']),

-- ── Benefits ─────────────────────────────────────────────────────────────────
('Employee Benefits',
 'Manage employee benefits packages: health insurance, pension (PENCOM), life assurance, allowances. Each benefit can be assigned to individual employees or groups. Finance can see total benefit cost per month.',
 ARRAY['super_admin','admin','operations'], ARRAY['benefits','pension','insurance']),

-- ── Disciplinary ─────────────────────────────────────────────────────────────
('Disciplinary Records',
 'Sensitive HR records for warnings, suspensions, and terminations. Accessible only to admin and super_admin. Each record links to an employee, date, type, and outcome. All access is logged in the Audit Log.',
 ARRAY['super_admin','admin'], ARRAY['disciplinary','hr','confidential']),

-- ── Transactions ─────────────────────────────────────────────────────────────
('Transactions',
 'A read-only ledger of all financial movements: payments out, receipts in, card transactions, and payroll disbursements. Finance, admin, and super_admin can view and export transactions. Each row shows date, amount, currency, counterparty, reference, and linked batch/invoice.',
 ARRAY['super_admin','admin','finance'], ARRAY['transactions','ledger','accounting']),

-- ── Reports ──────────────────────────────────────────────────────────────────
('Reports',
 'Generate and export financial and operational reports: P&L summary, expense breakdown by category, payroll cost, budget vs actual, fleet utilisation, and headcount. Reports can be filtered by date range and exported as CSV or PDF.',
 ARRAY['super_admin','admin','finance'], ARRAY['reports','analytics','exports']);
