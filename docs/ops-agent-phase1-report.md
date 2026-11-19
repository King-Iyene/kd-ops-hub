# Ops Agent, Phase 1 report: foundation

Status: built, tested locally, on branch `feature/ops-agent-phase1`. Stops here for your review (spec rule).

## What was built

| Spec item | Where | State |
|---|---|---|
| 1. `agent_*` tables, RLS, `agent_can_access`, `agent_can_configure`, `agent_in_scope` | migrations `20261408000000` to `…000200` | Done |
| 2. `ops_agent_reader` role, SELECT only, plus test that writes fail | `…000300`, `supabase/tests/agent_foundation.sql` | Done |
| 3. Task field history trigger | Not needed: `tm_task_activity` already records status, due date, assignee, rename and priority changes with from/to and actor (Phase 0 finding) | Skipped on purpose |
| 4. `/agent` shell, six tabs, sidebar entry, role guard | `src/pages/OpsAgent.tsx`, `navConfig.ts`, `App.tsx` | Done |
| 5. Settings tab | `src/features/ops-agent/settings/*` | Done |
| 6. Claude wrapper (aliases, caching, usage log, budget guard, fallback) | `supabase/functions/_shared/agent-claude*.ts`, `agent-ai` | Done |
| 7. Audit log writer | `agent_audit_trg`, `agent_audit`, `agent_audit_write` | Done |

Settings covers: mode, AI on/off, budgets with usage meters, model names and editable prices, key status and a test button, business calendar (time zone, report deadline, working days and hours, country), report table, HR contact, company scope, module access (sensitive modules locked), people profiles (group, manager, time zone, hours, exemptions, notes) with "Fill from pay groups and placements", admin scope editor (Super Admin only), Operating Rules editor, privacy switches, site list seeding, and a change log.

## Acceptance checklist

| Check | Result | How it was checked |
|---|---|---|
| Non-Super/Admin users are refused on every agent table, function and route | PASS in database and screen. Edge function not yet live-tested | SQL tests (member refused on every table and function); route uses `RoleGuard`; `agent-ai` checks the role in code and returns 403 |
| Admin gets refused on every configure action | PASS | SQL test attempts every configure action as Admin; all refused. Screen shows Admin everything read only (page test) |
| Admin scoped to one company cannot see another company's flags, summaries or chat results | PASS for flags and summaries. Chat results are not built yet (Phase 4) | SQL test: Admin limited to KD company sees only its rows |
| Admin cannot see flags about themselves | PASS | SQL test, plus flags about any Admin or Super Admin, and leadership flags, per the two switches |
| Reader role cannot write | PASS | SQL test: INSERT, UPDATE, DELETE and DDL all denied; no pay, bank or personal columns exist in its views |
| Settings persist | PASS in tests, not seen on production data yet | Page test checks only the changed field is written; SQL tests cover the tables |
| A test Claude call logs tokens and cost | PASS against a fake provider. Not yet against real Claude | 10-scenario test: tokens, cache tokens, cost, failed calls, budget stop, no key |
| Opening the screen never writes | PASS | Page test records every write and expects none |

What was not verified: nothing was run against the live Supabase project or the real Claude API (no key available to me, and migrations only reach production when merged to `main`). The first real run happens after merge: see "After merge" below.

## Tests

- SQL contract tests: 19 checks (`supabase/tests/agent_foundation.sql`), run on a local Postgres replay.
- Edge function: `callClaude` against a fake provider, 10 scenarios; type-checked with Deno.
- Vitest: 877 tests pass in the whole project (33 new for the agent).
- Lint clean on all changed files. `npm run build` passes.

## Things I decided that you may want to change

- Model prices are estimates (Haiku 1/5, Sonnet 3/15 dollars per million tokens, cache read and write included). They are editable in Settings.
- Budgets default to $5 a day and $50 a month. At 80% background AI pauses and chat continues; at 100% all AI stops. Rules never stop.
- AI is shipped **off** and mode starts in **Observe**.
- The SDK sends the key as an `Authorization: Bearer` header. That is expected.
- `profiles.timezone` already exists in production without a migration; the migration adds it only if missing.

## What you need to do

1. **Rotate the Claude key** you pasted in chat, then set the new one as the Supabase secret `ANTHROPIC_API_KEY` (Supabase dashboard, Edge Functions, Secrets). I never stored it in the repo, a file or a commit, and I cannot set secrets for you.
2. In the Report table, add the **Total hours** and **Blocker** fields (Q1). Report rules in Phase 2 wait for fields with those names.
3. In Ops Agent, Settings: pick the **HR contact** (Siye), press **Fill from pay groups and placements**, then check each person's group and manager, and set any Admin limits.
4. Leave the mode on Observe.

## After merge

The migrations run on production automatically on merge to `main` (the repo has no staging database). They only add tables, functions, a role and views, plus one `IF NOT EXISTS` column. A rollback script is in `supabase/rollbacks/20261408_agent_down.sql`. After the merge I check the migration workflow, the edge function deploy, and the live site.
