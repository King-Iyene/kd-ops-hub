# Ops Agent v2: always on, Chat, Connections

What changed after Phase 1 review.

## Changes

- **No Mode, no AI switch.** The agent always works. Claude runs whenever a working key is saved. Spending is still capped by the daily and monthly budgets in Settings. Nothing is ever sent by the agent on its own; a person presses Send or Test.
- **Sections moved to the sidebar.** Inbox, Chat, Summaries, Memory, Connections (Super Admin), Settings are links under the Ops Agent hub (desktop sidebar and mobile menu). The Inbox link shows the open count. The page has no tab bar.
- **Claude key is write only.** Settings, AI and budget has a box. The key is sent to Claude once to check it works, saved encrypted in Vault only if Claude accepts it, and never shown, logged or audited again. A Supabase secret named `ANTHROPIC_API_KEY` still works and wins over the saved one.
- **Chat works.** `/agent/chat` -> `agent-chat` edge function -> Claude (smart model) with eight tools. Each tool is one call to `agent_chat_tool` as the signed-in person, so every row passes `agent_in_scope`: a limited Admin only sees their companies and modules, never their own rows or other Admins'. Tools: people, tasks, task_summary, daily_reports, hours, leave, flags, request_human_action. Chat cannot change anything; a request to becomes a "Human action required" Inbox item.
- **Inbox actions.** Handled, Snooze a day, Dismiss, Reopen, through `agent_flag_set_status` (scope checked, leaves an event).
- **Connections.** Slack, Zoho Cliq, email (through `send-email`), webhook, n8n, generic API. Add, edit, test, delete. Addresses must be HTTPS and public (internal hosts, metadata addresses and redirects are refused). Webhook secrets sign every call (`X-KDOps-Signature`, HMAC-SHA256). Secrets live in Vault and are never returned.
- **Inbound API.** `POST/GET {project}/functions/v1/agent-inbound` with `Authorization: Bearer kdagent_...`. Keys are created by a Super Admin (shown once, stored as a hash, 60 calls a minute, revocable). A POST adds or updates an Inbox item; a GET lists open ones.
- **Diagnose workflow can call functions.** `http://localhost:4173` was added to the shared CORS list.

## About the key that was pasted in chat

It is a user-scoped Anthropic key (`sk-ant-usr-...`). It can read organisation details but **cannot run messages**: the API says it is not scoped to a workspace, and with the only workspace it can see ("Claude Code") inference returns "Workspace not found". Create an API key inside a workspace in the Anthropic Console (Workspaces, pick one, API keys), paste it in Settings, and rotate the pasted one. It was used for those checks only and is stored nowhere.

## Verified

- SQL: 20 earlier contract checks and 10 new groups (secrets, API keys, inbound items, every chat tool, scope for a limited Admin, a disabled module, bad arguments, human action, Inbox actions).
- Edge functions (Deno, fake Claude and fake network): 12 + 6 + 10 scenarios.
- Vitest: 939 tests across the project, 100 for the agent.
- Not verified: a real Claude answer (no working key), a real Slack or Cliq delivery (no credentials).

## Not built yet

Rules (Phase 2), summaries and enrichment (Phase 3), memory editing and agent questions (Phase 4), one-click send from the Inbox, and the schema scan (Phase 5 to 7). Summaries and Memory show what exists and say so.
