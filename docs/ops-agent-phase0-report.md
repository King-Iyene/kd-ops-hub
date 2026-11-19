# Ops Agent: Phase 0 Discovery Report

Date: 19 Nov 2026 · For: Denzel (COO) · Spec: `docs/ops-agent-spec.md` v1.1
Scope: inspection only. No feature code, no migrations, nothing deployed.

## How this was done (and its limits)

- **Schema:** `src/integrations/supabase/types.ts` (regenerated from the live database by CI: 254 tables, 7 views, 235 functions) and all migrations under `supabase/migrations`.
- **Code:** edge functions (40), shared modules, `src/lib/roles.ts`, `src/lib/navConfig.ts`, `src/App.tsx`, the Task and Track modules.
- **Live data:** about a dozen small read-only reads of production through the existing Ops Diagnose workflow (companies, pay groups, departments, task tables, report fields, forms, cron expectations, and the role / employment values of profiles). No staff names or personal data were pulled into this report.
- **Not possible from here:** the Supabase connector in this session cannot see the production project, so I could not run `pg_policies`, `cron.job`, `pg_roles` or row counts. Items that need those are marked **verify in Phase 1**.

---

## 1. Headline findings

1. **The production Daily Report has no hours field and no blocker field.** The "Report" table has exactly: Name, Report Date, Team (Ops Team / Placement), Tasks Worked on Today, Report, Additional Content. So TR08, TK12, the "zero hours" part of RP03 and the blocker part of RP04 cannot be built until the form captures hours and a blocker (section 5).
2. **Task history already exists.** `tm_task_activity` records status, due date, assignee, title and priority changes with old value, new value, who and when, written by a trigger. The spec's `task_field_history` table is **not needed** for the Task module. TK02, TK08, TK09 and TK11 are buildable now.
3. **Track time cannot have "no project".** `time_entries.project_id` and `task_id` are both `NOT NULL`. TR07 can never fire as written (section 5).
4. **There is no "group" (leadership / core / placement) and no per person working hours.** Candidates exist (pay groups, the `placements` table, the report form's Team field) but none is authoritative. This is the biggest data gap (section 4).
5. **Company is not on the person.** A person's company comes from their pay group (`profiles.pay_group_id` → `pay_groups.company_id` → `companies`). Tasks, time entries and reports have no company column. Company scope must be derived through the person.
6. **The module registry is code, not data.** Modules live in `src/lib/navConfig.ts` (TypeScript). An edge function cannot read it, so the Settings module list and the nightly scan need a database side catalog (section 6).
7. **Two leave systems, plus the Cliq OOO channel.** `leave_requests` (HR) and `time_leave_requests` (Track). Which one is the source of truth must be decided.
8. **Track activity data is kept for 30 days by default** (`time_agent_settings.retention_days`, purged daily). TR04 and TR05 can only look back that far.
9. **No Cliq, Slack or Anthropic code exists yet.** There is no `ANTHROPIC_API_KEY` use anywhere (the current `/assistant` chatbot uses Groq and Gemini). Email (Resend), SMS and WhatsApp (Termii), push, signed outbound webhooks and an API-key REST pattern do exist and can be reused.
10. **B11 (report chase) does not exist.** Nothing in the repo chases missing reports. The table page now has an Inbox of who has not reported, but it is a screen, not a job. RP01 becomes B11.
11. **Migrations deploy straight to production on merge to `main`** (no staging). Every Phase 1 migration needs extra care and a paired rollback script.
12. **`profiles.timezone` exists in the live schema but no migration creates it.** Types show it as `string`, not null. Someone added it outside migrations. Its default and contents need checking.

---

## 2. Roles and access

| Need | Real source |
|---|---|
| Role column | `profiles.role` (text). Values in code: `super_admin`, `admin`, `finance`, `operations`, `field_staff` (+ `candidate` in CSV import) |
| Super Admin / Admin | `super_admin`, `admin`. Constants `ADMIN_ONLY_ROLES` in `src/lib/roles.ts` |
| Active check | `profiles.status = 'active'` (`RoleGuard` redirects others to `/unauthorized`) |
| SQL check | `public.current_user_role()` (SECURITY DEFINER, reads `profiles` by `auth.uid()`) and `current_user_is_active()` |
| Route guard | `src/components/RoleGuard.tsx` with `roles={ADMIN_ONLY_ROLES}` |
| Per person overrides | `profiles.permissions` (jsonb) and `permissions-config.ts` keys |
| "View As" | Super Admin role simulation (`viewAsRole`, edge function `impersonate-user`) |

**Two things to design around**
- `RoleGuard` has a `permission` option that can **grant** access to a role not in the list. The `/agent` route must not use it, or a flagged `operations` user could open the module. Server side checks must use the real `profiles.role`, never View As.
- Super Admin is exempt from most guards, so the agent's own functions (`agent_can_access()` etc.) must read the role from the database, not from the client.

**Admin scope (section 4 of the spec):** there is no existing scope concept. `tenants` is a white label table, not a company scope. `agent_admin_scope` is new.

---

## 3. Data source map

| Spec need | Table / column (real) | Notes |
|---|---|---|
| Companies | `companies` (id, name, short_code, is_active). Production: **KD Squares Ltd**, **NDI** | |
| Person → company | `profiles.pay_group_id` → `pay_groups.company_id` | 6 pay groups: NDI Staffs; KDS Directors; KDS Administrative (excl. Directors); KDS Support & Time Tracking Team; Non-administrative; TEST |
| Manager | `profiles.reporting_manager_id` | Coverage not checked (Appendix A item 2 covers it) |
| Timezone | `profiles.timezone` | Live column, no migration (finding 12) |
| Employment | `profiles.employment_type`, `job_title`, `department_id`, `start_date`, `status` | Salary and bank columns are on the same table (see section 7) |
| Tasks (Task module) | `tm_tasks`: id, list_id, parent_id, title, description, status (`to_do`, `in_progress`, `in_review`, `blocked`, `done`), assignee_id, due_date, completed_at, created_at, updated_at, priority, recurrence | Statuses match the Blueprint |
| Legacy tasks | `tasks`, `task_assignees`, `task_lists` | Older module, still used by Dashboard and Projects. **Out of scope unless you say otherwise** |
| Task comments | `tm_task_comments` (task_id, author_id, body, created_at) | |
| Task history | `tm_task_activity` (task_id, actor_id, kind, detail jsonb, created_at). Kinds: created, status, due_date, assigned, renamed, priority, description, tags, subtask_added, recurred, repeated | Detail holds `{from, to}`. A description change is logged without the old text |
| Time entries | `time_entries` (employee_id, project_id, task_id, start_time, end_time, duration_minutes, entry_source, notes) | **Running timer = `end_time IS NULL`**. Track has its own `time_tasks` and `time_projects`, not linked to `tm_tasks` |
| Track activity | `time_activity_logs` (employee_id, captured_at, app_name, window_title, **url**, productivity_category, active_seconds, window_seconds, input_events, mouse_events) | Full URL is stored; domain must be derived in SQL. Capture cadence is per person in `time_agent_settings.capture_interval_minutes` |
| Site / app rules | `time_productivity_rules` (app_name_contains, title_contains, category, priority) | Already classifies captures. `agent_domain_list` would sit beside it |
| Agent on/off | `time_agent_settings` (is_enabled, last_login_at, login_count, retention_days) | Useful for PP01 |
| Track working hours | `time_agent_tracking_hours` (weekday, from_time, to_time) | **Global per weekday, not per person** |
| Shifts | `shift_definitions`, `shift_assignments` | Possible per person hours for shift workers |
| Daily reports | Rows of the Task module table named **Report** (`tm_tables` id `25fd5530…`, `tm_table_records`, form `Daily Report`, public). Fields: Name (person), Report Date (date), Team (single select: Ops Team, Placement), Tasks Worked on Today (task, multiple), Report (long text), Additional Content (long text) | `tm_tables.report_date_field` is already set to the Report Date field |
| Leave (HR) | `leave_requests` (employee_id, start_date, end_date, days_requested, is_half_day, status pending/approved/rejected/cancelled), `leave_balances`, view `leave_calendar_v` | |
| Leave (Track) | `time_leave_requests`, `time_leave_types` | Second system |
| Holidays | `public_holidays` (country_code, holiday_date, is_observed) | Per country. Nothing on a person says which country |
| Placements | `placements` (employee_id, client_id, status, placement_type, placement_category, start_date, end_date) | Strongest candidate for "placement" group |
| Module registry | `src/lib/navConfig.ts` (`SIDEBAR_HUBS`, ~25 groups) | Code only |
| Routes | `src/App.tsx` | Code only |
| Edge functions | 40 in `supabase/functions` | List in section 6 |
| Cron jobs | 23 `cron.schedule` calls in migrations; `kdops_cron_health_check` every 15 min; `cron_job_expectations` (18 jobs) | |
| Email / notifications | `send-email` (Resend email, Termii SMS and WhatsApp), `send-push`, `notifications` (in app, realtime), `notifications_log`, `notification_preferences` | |
| Audit | `audit_logs` (hash chained) | |
| Anthropic | none | New secret and SDK |

---

## 4. Gaps and corrections to the spec's assumptions

| # | Spec expects | Reality | Proposed fix |
|---|---|---|---|
| G1 | New `task_field_history` table | `tm_task_activity` already does this for `tm_tasks` | **Skip the new table.** Read `tm_task_activity`. The legacy `tasks` table has no history |
| G2 | Group per person | None. Candidates: pay group name, active row in `placements`, the report's Team field | `agent_person_profile.group`, seeded by a proposed mapping you approve (Q3) |
| G3 | Working hours and timezone per person | Timezone column exists (verify). Hours are global per weekday | `agent_person_profile.working_hours` with one default (Mon to Fri) plus exceptions |
| G4 | Leave inside KD Ops | Exists twice (HR and Track) | Pick one source (Q6). Cliq OOO channel stays Phase 7 |
| G5 | Hours and blocker in the daily report | Not on the form | Add two fields to the Report table (hours per task and a Blocker) before Phase 2 (Q1) |
| G6 | Domain data in Track | Present as full `url` plus `app_name` and `window_title`, 30 day retention | Domain extraction view in SQL. Never send URLs to Claude |
| G7 | Module registry table | Code only | `agent_module_catalog` seeded by migration, plus table prefix grouping for the scan (section 6) |
| G8 | Company on records | Only on the person (via pay group) | Derive. Unassigned tasks and lists have no company, so company filters exclude them (or show them as "unassigned") |
| G9 | Holidays per person | By country only | Default country `NG` per company, optional per person (Q8) |
| G10 | Task "manager" for "only the manager sets Complete" | The app allows anyone to set Complete. There is no manager concept on a task | Manager = assignee's `reporting_manager_id`. TK11 flags when the assignee set it |
| G11 | `ops_agent_reader` SELECT on business tables | Business tables have RLS with policies for `authenticated`. A new role sees **zero rows** unless policies are added to those tables or it bypasses RLS | **Recommended: read only views** in a new `agent_read` schema (see section 7). No change to any business table or policy |
| G12 | Staging | None. Migrations go to production on merge | Each migration idempotent, additive, with a rollback script in `supabase/rollbacks/` (not auto run) |

---

## 5. Rule by rule buildability (acceptance for Phase 0)

Legend: **Buildable** now · **After fix** needs a listed gap closed · **Not buildable** as written

### Track
| Rule | Verdict | Why and dependencies |
|---|---|---|
| TR01 Not tracking | After fix (G2, G3, G4) | `time_entries.start_time` is available. Needs working day start per person, leave and holidays for suppression |
| TR02 Forgotten timer | **Buildable** | Running = `end_time IS NULL`. "No activity" from `time_activity_logs` (only for people with the desktop agent) |
| TR03 Work without tracking | **Buildable** (person level) | Task activity from `tm_task_activity`, comments, report rows vs `time_entries`. Track tasks are not linked to Task module tasks, so it compares times, not tasks |
| TR04 Low activity | **Buildable** (agent users only) | `active_seconds / window_seconds`, `input_events`. Depends on `time_agent_settings.is_enabled`. 30 day lookback |
| TR05 Unusual sites | After fix (G6, Q7) | Needs domain extraction view and the approved / unproductive lists. `time_productivity_rules` can seed them |
| TR06 Under hours | After fix (G3) | Needs expected hours per person |
| TR07 No project | **Not buildable as written** | `project_id` is `NOT NULL`. Redefine (for example "time on a catch all project") or drop (Q5) |
| TR08 Report vs Track mismatch | **Not buildable until G5** | Report has no hours |

### Task
| Rule | Verdict | Why and dependencies |
|---|---|---|
| TK01 Overdue | **Buildable** | `tm_tasks.due_date`, `status <> 'done'`. Leadership exclusion needs G2 |
| TK02 Due date changed | **Buildable** | `tm_task_activity` kind `due_date` with `from` not null (first time a date is set has no `from` and is not a "move"). Needs your decision on "first set" (Q9) |
| TK03 No action verb | **Buildable** | Title text, verb list. AI only for unknown words (Phase 3) |
| TK04 Weak description | **Buildable** (length) · AI for "no success definition" in Phase 3 | |
| TK05 Vague task | Phase 3 (AI) | |
| TK06 No open tasks | After fix (G2) | Needs the core group |
| TK07 Gone quiet | **Buildable** | `tm_tasks.updated_at`, `tm_task_activity.actor_id`, `tm_task_comments.author_id` |
| TK08 Stuck in review | **Buildable** | Time of the last `status` → `in_review` event. Manager from `reporting_manager_id` (coverage unknown) |
| TK09 Blocked too long | **Buildable** | Same plus `tm_task_comments` |
| TK10 Missing owner or due date | **Buildable** | Decide whether subtasks count (Q9) |
| TK11 Self completed | **Buildable** | `status` → `done` event where `actor_id = assignee_id`. Recurring task spawns and bulk moves need care |
| TK12 In Progress, no hours | **Not buildable until G5** | Report has no hours per task |

### Reports
| Rule | Verdict | Why and dependencies |
|---|---|---|
| RP01 Missing daily report | After fix (G2) | Report rows keyed by person and Report Date. **B11 does not exist**, so this rule becomes B11, including notifying Siye (need Siye's account, Q10) |
| RP02 Late report | **Buildable** | `created_at` (submitted) vs 6PM EST on the Report Date |
| RP03 Thin report | **Partly** | "No tasks selected" is buildable (the task field is required today). "Zero hours" needs G5 |
| RP04 Repeated blocker | **Partly** | "Same task in 3+ reports" is buildable. Blockers need G5 (a Blocker field), or AI reading the free text in Phase 3 |

### People and System
| Rule | Verdict | Why |
|---|---|---|
| PP01 Not set up | **Buildable** (Cliq part waits for Phase 5) | Tasks, `time_agent_settings.login_count / last_login_at`, `agent_identity_map` |
| PP02 Missing agent data | **Buildable** | `profiles.reporting_manager_id`, `timezone`, `agent_person_profile.group` |
| SY01 New module or table | **Buildable** (Phase 6) | Scan `information_schema` with table prefix families (`tm_`, `time_`, `office_`, `ndi_`, `chatbot_`…). Needs G7 |
| SY02 Monitored table changed | **Buildable** (Phase 6) | Diff of column lists |
| SY03 Rule run failed | **Buildable** | `agent_rule_runs` |
| SY04 Integration failure | Phase 5 | |
| SY05 Data quality warning | **Needs definition** | "Finance inputs not updated" has no clear source. Which table and how stale (Q11) |

**Totals (31 rules):** 18 buildable now (TR02, TR03, TR04, TK01, TK02, TK03, TK04, TK07 to TK11, RP02, PP01, PP02, SY01 to SY03), 5 after a gap fix (TR01, TR05, TR06, TK06, RP01), 2 partly (RP03, RP04), 3 not buildable as written (TR07, TR08, TK12), and 3 that wait for a later phase or a definition (TK05 needs the AI layer, SY04 needs Phase 5, SY05 needs a definition).

---

## 6. Platform building blocks already in the repo

- **Cron pattern:** `pg_cron` calls a SECURITY DEFINER function that reads the function URL and `cron_shared_secret` from **Vault** and POSTs with `pg_net` and header `X-Cron-Secret` (see `payroll_scheduler_cron`). Extensions `pg_cron`, `pg_net`, `pgcrypto`, `http`, `vector` are enabled.
- **Cron health:** `kdops_cron_health_check` and `cron_job_expectations` alert when a job stops running. The agent's jobs should be registered there.
- **Edge functions (40):** automation-runner, batch-worker, bulk-email-sender, campaign-scheduler, chatbot-chat, chatbot-embed, data-api, data-retention-runner, ddl-executor, export-transfer-audit, extract-receipt, fleet-alerts, flutterwave-*, fx-rate-sync, heyreach-sync, impersonate-user, message-campaign-sender, office-*, payroll-*, paystack-*, provider-switch, record-failed-login, rest-api, send-email, send-push, site-icons, timetrack-export-runner, vapid-keys, webhook-*.
- **Reusable:** `_shared/cors.ts`, `_shared/timing.ts` (constant time compare), `_shared/webhook-signing.ts` and `webhook-retry.ts` (for the signed outbound webhook), `rest-api` (hashed `kdops_` API keys, direct Postgres pool via `SUPABASE_DB_URL`) as the pattern for the Agent API and `run_readonly_query`.
- **Realtime:** `notifications` and `trip_logs` are in the `supabase_realtime` publication. `agent_flags` would be added the same way.
- **SQL tests:** `supabase/tests/*.sql` are run by hand with `psql` (not in CI). Phase 1 acceptance needs a CI job against a disposable Postgres.
- **Existing AI:** `/assistant` (chatbot) uses Groq and Gemini through `chatbot_config`. The Ops Agent chat is a separate thing with its own key and tables.

---

## 7. Security design recommendation (needs your approval, question Q2)

**The problem:** the spec asks for a role with SELECT on business tables. Those tables have row level security with policies written for `authenticated`. A new role would see nothing, and the two ways around that are both uncomfortable:
- Give the role `BYPASSRLS`: normally only a superuser can grant it, and the `postgres` user on hosted Supabase is not one (to be confirmed in Phase 1).
- Add a `TO ops_agent_reader USING (true)` policy to every business table: that changes the RLS of existing tables.

**Recommendation:** create a schema `agent_read` of **read only views**, owned by the table owner (views run with owner rights, as `profiles_directory` already does in this repo), and `GRANT SELECT` on those views to `ops_agent_reader` only.
- No existing table, policy or grant is touched.
- The views expose only the columns the agent needs. `profiles` carries salary, bank account, BVN, NIN, TIN and pension fields; the view will not.
- URLs are reduced to domains in the view, so full URLs never leave the database.
- Module toggles map to which views exist for a module, and `run_readonly_query` can only name `agent_read.*`.
- The edge function connects with `SUPABASE_DB_URL` and `SET LOCAL ROLE ops_agent_reader` (same Postgres pool approach as `rest-api`), with `statement_timeout` 5s and a 200 row cap.
- The write test the spec asks for (INSERT, UPDATE, DELETE must fail) passes by construction: the role has no grant on anything but those views.

**Sensitive modules I recommend never exposing:** payroll, payslips, bank, salary, loans, disciplinary, grievances, HR letters, performance reviews, contractors' bank data. The spec says "read everything in scope"; I suggest the default module list is Task, Track, Reports, Leave, People (safe columns) and nothing financial (Q4).

---

## 8. Proposed Phase 1 migration list (all additive, all with a rollback script)

| # | Migration | Contents |
|---|---|---|
| 1 | `agent_foundation_tables` | `agent_settings`, `agent_company_scope`, `agent_module_access`, `agent_module_catalog`, `agent_admin_scope`, `agent_person_profile`, `agent_audit_log`, `agent_ai_usage` |
| 2 | `agent_inbox_tables` | `agent_rules`, `agent_rule_runs`, `agent_flags`, `agent_flag_events`, `agent_messages`, `agent_questions`, `agent_memory`, `agent_text_checks`, `agent_domain_list` (tables the later phases write to; empty until then) |
| 3 | `agent_access_functions` | `agent_can_access()`, `agent_can_configure()`, `agent_in_scope(company, module, person)`, `agent_company_of(person)` (pay group → company) |
| 4 | `agent_rls` | RLS on every `agent_*` table using the functions above. Includes the self visibility and leadership rules |
| 5 | `agent_reader_role_and_views` | `ops_agent_reader` (NOLOGIN), schema `agent_read`, the views, grants, and the INSERT / UPDATE / DELETE denial test |
| 6 | `agent_writer_functions` | SECURITY DEFINER functions the edge functions use to write `agent_*` rows (flags, events, usage, audit) |
| 7 | `agent_realtime_and_cron_registry` | Add `agent_flags` to `supabase_realtime`; register agent jobs in `cron_job_expectations` (jobs themselves are scheduled in Phase 2) |
| 8 | `agent_seed` | Default settings (Observe mode, `fast` / `smart` aliases, budgets), default rules (disabled until Phase 2), the module catalog, the Operating Rules text from spec section 7 |

**Not in Phase 1 (skipped from the spec):** `task_field_history` (G1). **Possible, if you approve:** a small migration adding Hours and Blocker fields to the Report table (a data change, not schema, done in the app) and a `profiles.timezone` migration to bring the migrations in line with the live schema.

**Outside migrations in Phase 1:** `ANTHROPIC_API_KEY` secret (your item 1), `/agent` route and sidebar entry (code), edge function `agent-ai` shared module (code), the CI job that runs the SQL tests.

---

## 9. Open questions

Each has my recommended answer so you can reply with just "yes" or a change.

| # | Question | My recommendation |
|---|---|---|
| Q1 | The Report form has no hours and no blocker. Add two fields (hours per task and an optional Blocker) before Phase 2? Hours per task needs a different shape than one multi select. Is **one total hours number per report** enough for v1? | Add **Total hours** (number) and **Blocker** (long text, optional). Then TR08, RP03 (zero hours) and RP04 work. TK12 (hours per task) is dropped or rewritten |
| Q2 | Use the `agent_read` views approach for `ops_agent_reader` (section 7) instead of policies on existing tables? | Yes |
| Q3 | How should "group" be set? Options: (a) pay group "KDS - Directors" = leadership; (b) people with an active `placements` row = placement; (c) everyone else at KD Squares = core; NDI Staffs = ? | Use (a), (b), (c) as the proposed default, I list every person with their proposed group for you to correct in Settings |
| Q4 | Which modules may the agent read by default? | Task, Track, Reports (the Report table), Leave, People (safe columns). No payroll, bank, salary, loans, disciplinary, grievances, HR letters, performance |
| Q5 | TR07 "no project" cannot happen. Drop it, or replace it with something real (for example "time on a catch all project", "billable time without a client")? | Drop it for v1 |
| Q6 | Which leave source is real: `leave_requests` (HR), `time_leave_requests` (Track), or both? | Read both. HR leave is primary |
| Q7 | Approved and unproductive domain lists: seed from `time_productivity_rules`, or start empty and use the unknown queue? | Seed from the rules, then use the queue |
| Q8 | Public holidays: default country NG for KD Squares and NDI? Anyone employed elsewhere? | NG default, override per person |
| Q9 | TK02: is the first time a due date is set a "change"? TK10: do subtasks count? | First set is **not** a change. Subtasks do not count |
| Q10 | Who is "Siye" (HR) in KD Ops (account)? Who is each person's manager (Appendix A item 2)? | I will list people with no manager so you can fill them in |
| Q11 | SY05 "finance inputs not updated": which table and how stale? | Leave out of v1 until defined |
| Q12 | Placement staff are on the Report form (Team = Placement) and the form requires Tasks Worked on Today, but the Blueprint says placement staff have no KD Ops tasks. Do placement staff submit this report, and with tasks? | Make the task field not required for Placement (form logic already supports it) |
| Q13 | Task module only, or also the legacy `tasks` table? | Task module (`tm_*`) only |
| Q14 | Who are the Admins and what is each one's scope (Appendix A item 9)? And Siye: Admin or Super Admin? | I will list current `admin` accounts for you to confirm |
| Q15 | `profiles.timezone`: should I add a migration so the repo matches the live database? | Yes, in migration 1, `ADD COLUMN IF NOT EXISTS` so it is safe |

---

## 10. What I need from you to start Phase 1

1. Answers to Q1 to Q15 (a "yes to all recommendations" is fine).
2. `ANTHROPIC_API_KEY` set as a Supabase secret (Appendix A item 1).
3. Confirmation that migrations can be merged to `main` as usual (they go to production directly).

I will not start Phase 1 until you confirm.
