# Ops Agent: decisions on the Phase 0 questions

Date: 19 Nov 2026 · Decided by: Denzel (COO) delegated the answers ("answer all questions, be intelligent"); recorded by Claude Code.
These answers drive the build. Change any of them and the affected phase is adjusted.

| # | Question | Decision | What it means in the build |
|---|---|---|---|
| Q1 | Report form has no hours or blocker | **Add "Total hours" (number) and "Blocker" (long text, optional)** to the Report table and the Daily Report form. TK12 (hours per task) is dropped | Rules that need them (TR08, RP03 zero hours, RP04 blockers) are built but stay **"waiting for field"** until the Report table has a number field named like "hours" and a long text field named like "blocker". The agent finds them by name and type, so no code change when you add them. I will not edit the live public form myself |
| Q2 | `agent_read` views instead of policies on existing tables | **Yes** | `ops_agent_reader` can only read views in schema `agent_read`. No business table, policy or grant is touched |
| Q3 | How groups are set | Leadership = pay group "KDS - Directors". Placement = an active row in `placements`, or Team = Placement on the report. Core = everyone else in a KD Squares or NDI pay group | A Settings button **"Fill from pay groups and placements"** proposes groups. It never overwrites a group you set by hand. Nothing is assumed silently |
| Q4 | Modules the agent may read | **Task, Track, Reports, Leave, People (safe columns)**. Payroll, payslips, bank, salary, loans, disciplinary, grievances, HR letters, performance, contractors' banking are marked **sensitive: no views exist, they cannot be switched on** | The module catalog shows sensitive modules as locked |
| Q5 | TR07 "no project" | **Dropped** (Track makes a project mandatory) | Rule code stays reserved and disabled |
| Q6 | Leave source | **Both**: HR leave (`leave_requests`, approved) is primary, Track leave (`time_leave_requests`, approved) adds to it | A person on leave in either system is suppressed |
| Q7 | Domain lists | Seed from `time_productivity_rules` on demand, then use the unknown queue | Button in Settings, nothing automatic |
| Q8 | Holidays | **NG default** for every company, optional country per person | `agent_person_profile.country_code` default `NG` |
| Q9 | TK02 and TK10 | First time a due date is set is **not** a change. Subtasks **do not count** for TK10 | |
| Q10 | Who is Siye, who are the managers | HR contact is a **Setting** (`hr_contact_id`), not hardcoded. PP02 lists everyone with no manager | You pick Siye in Settings. Managers come from `profiles.reporting_manager_id` |
| Q11 | SY05 data quality | **Left out of v1** until you define it | Code reserved |
| Q12 | Placement staff and required tasks | **Team = Placement is excluded from every Task rule and from "no tasks" in RP03.** Recommended form change for you: make "Tasks Worked on Today" not required when Team = Placement (form conditions already support it) | |
| Q13 | Legacy tasks table | **Task module (`tm_*`) only** | |
| Q14 | Admins and their scope | Every Admin defaults to **all covered companies and modules**. Defaults on: Admins cannot see flags about themselves, leadership flags are Super Admin only | Settings lists current Admins so you can narrow each one |
| Q15 | `profiles.timezone` migration | **Yes**, `ADD COLUMN IF NOT EXISTS` (no-op where it already exists) | Keeps the repo in line with the live database |

## Doing the Q1 form change (1 minute, in the app)
1. Task → table **Report** → click **+** at the end of the header → add **Total hours** (type Number) and **Blocker** (type Long text, leave "required" off).
2. Table toolbar → **Forms** → open **Daily Report** → tick the two new fields so they appear on the form.

## About the API key
The Anthropic key you pasted in chat is **not stored anywhere in the repo** and never will be. It has to live only as the Supabase secret `ANTHROPIC_API_KEY` (Supabase dashboard → Edge Functions → Secrets). Because it now exists in a chat transcript, **create a new key in the Claude Console, set the new one as the Supabase secret, and delete the pasted one.** Keep auto reload off so spend cannot pass the included credit. Until the secret is set, the agent runs on templates (the spec's fallback) and the Settings page shows "AI key not configured".

## How the build proceeds
The spec's phase order and acceptance checklists are kept. Things the build cannot do on its own and where it stops:
- **Setting the Supabase secret** (above).
- **Phase 2 observation:** the spec asks for 3 working days in Observe mode before Phase 3. The AI layer is built and shipped switched **off** until you review false positives and turn it on.
- **Phase 5 and 7** need Zoho Cliq and Slack credentials (Appendix A items 7 and 8). Email and the signed webhook are built; Cliq and Slack are built against their documented APIs but cannot be connected or tested until you supply the credentials.
