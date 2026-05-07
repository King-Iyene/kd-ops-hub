# AI Assistant — KD Ops Hub

How the in-app chat works, what the n8n workflow does, where the internal
knowledge base fits in, and what to check when something breaks.

## TL;DR

The little chat widget at the bottom-right of the platform is wired to **one of
two backends** at any time, controlled by a single Vercel env var:

| Env var present?                          | Backend that handles the message |
|-------------------------------------------|----------------------------------|
| `VITE_N8N_CHAT_WEBHOOK_URL` is set        | n8n cloud workflow               |
| `VITE_N8N_CHAT_WEBHOOK_URL` is empty/unset| Supabase edge function `chatbot-chat` |

So today, with the env var set, **every** user message goes to n8n. The
internal Supabase edge function (`chatbot-chat`) is **not running** at all —
it is the legacy fallback. It only takes over if you blank the env var on
Vercel and redeploy.

`src/components/ChatWidget.tsx` is where the routing decision happens (search
for `n8nUrl`).

## The n8n workflow — stage by stage

Workflow name in n8n: **KD Ops AI Assistant — Advanced**.

It runs in three stages. Every chat message flows top-to-bottom through them.

### Stage 1 — Input & Auth

| Node | What it does |
|------|--------------|
| `Webhook (POST)` | Receives the message from the platform. Header Auth requires `x-kd-secret` to match `VITE_N8N_CHAT_SECRET` on Vercel — anything else is rejected with 403. |
| `Parse & Trim Input` | Pulls `message`, `user_id`, `session_id` out of the body, trims whitespace, defaults missing fields. The output of this node is referenced by every downstream node, so if its output is empty everything else breaks. |
| `Has Message?` | Branch. **True**: continue. **False**: respond `{"reply": "(empty)"}` — short-circuits the rest so we don't burn tokens on empty input. |

### Stage 2 — Memory & Context

| Node | What it does |
|------|--------------|
| `Rate Limit Check` | Postgres query that counts requests per user in the last 60 seconds. Returns `allowed: true/false`. |
| `Rate OK?` | Branch. **True**: continue. **False**: respond "Slow down — try again in a minute." |
| `Load User Profile` | Postgres `SELECT` from `profiles` for the user_id — pulls role, name, email so the agent can address them and respect role permissions. |
| `Load History` | Postgres `SELECT role, content FROM chat_messages WHERE session_id = … ORDER BY created_at DESC LIMIT 10`. Loads the last 10 turns so the agent has continuity. |
| `Build Context` | A Set node that combines profile + history + current message into a single object the agent receives. **This is the node that did not run in your test** — see "Troubleshooting" below. |

### Stage 3 — Master Agent + Tools

| Node | What it does |
|------|--------------|
| `Master Agent (Sonnet 4.6)` | Anthropic Claude Sonnet 4.6 with 9 tools attached. It reads the context object from Build Context and decides whether to answer directly or to call one of its tools. |
| Tools | Calculator, `payment_batches.getAll`, `batch_items.getAll`, `employees.getAll`, `expenses.getAll`, plus a few more Supabase row-readers. All wired to the same Postgres credential. |
| `Respond` | Returns the agent's final text as `{"reply": "...", "session_id": "..."}` to the platform. |

## "Why didn't Build Context run during my test?"

Short version: the node *executed successfully* but its **SQL query returned
zero rows**, and n8n's default rule is "no rows out → stop the chain". The
green tick means "the database accepted my query"; it does **not** mean
"there was data". The next node never receives an item to act on, so it
never starts.

The badge "**2**" on the node means it ran twice during your test session
(once per `Execute step` click). Both runs returned 0 rows, so both runs
halted the chain. That's why Build Context, Master Agent, and everything
downstream sat idle even though the upstream nodes are all green.

### Why zero rows?

`Load History` runs:

```sql
SELECT role || ': ' || content AS line
FROM   public.chat_messages
WHERE  session_id = '{{ $("Parse & Trim Input").item.json.session_id }}'
ORDER BY created_at DESC LIMIT 10
```

A test message comes in with a brand-new `session_id` that has never been
saved to `chat_messages`. The `WHERE` clause matches nothing → 0 rows →
no output item → n8n stops. This is correct n8n behaviour, not a bug —
the workflow author has to opt-in to "always emit an item even on empty
results".

You'd see the same thing on `Load User Profile` if the user_id you sent
doesn't exist in `profiles` yet.

### Fix (one of the following)

1. Open `Load History` in n8n → **Settings** tab → set **Always Output Data**
   to **On**. Now it emits a single empty item even when the SQL returns
   nothing, and Build Context (plus the rest of the chain) runs. Repeat for
   `Load User Profile` for the same reason. This is the recommended fix.
2. Or: rewrite the SQL to always return at least one row, e.g.
   ```sql
   SELECT COALESCE(string_agg(line, E'\n'), '') AS history
   FROM (
     SELECT role || ': ' || content AS line
     FROM   public.chat_messages
     WHERE  session_id = '...'
     ORDER  BY created_at DESC LIMIT 10
   ) t;
   ```
   This always returns one row (possibly an empty string), so the chain
   never stops.

Option 1 is lower-risk and a 5-second toggle. Do that first, then re-run.

## "Is the internal knowledge base useless? Can I delete it?"

**No, don't delete it.** Here's the situation:

The `chatbot_knowledge` Postgres table (with pgvector embeddings) **still
exists and still works** — it's just not being *queried* right now because
chat traffic is going to n8n, and the n8n workflow doesn't have a node
wired to that table. The data is intact. The retrieval function
`match_chatbot_knowledge` is intact. The admin UI at `/assistant/admin`
still lets you add, edit, and delete entries.

Your options:

1. **Keep it as-is (recommended for now).** Costs nothing — pgvector data
   sits in Postgres at near-zero storage cost. If you decide to wire it
   into n8n later (a Postgres node that calls `match_chatbot_knowledge`
   before Build Context), the entries are ready.
2. **Switch back to the legacy edge function.** Blank `VITE_N8N_CHAT_WEBHOOK_URL`
   on Vercel → redeploy. The edge function reads from `chatbot_knowledge`
   on every chat. You lose Sonnet 4.6 + structured tool-calling but gain
   semantic search over your runbooks.
3. **Both (the proper end-state).** Add a Postgres node in n8n that does
   a pgvector match against `chatbot_knowledge` and feeds the top hit
   into Build Context as additional context. About a 30-minute n8n
   change.

If you delete the table:
- All curated knowledge entries (whatever you've added under Assistant
  Admin) are lost.
- The legacy edge function will throw on its RAG step.
- You'd need a migration to re-create the table + index + function before
  re-enabling the legacy path.

So the answer is: **leave it alone**. It's cheap insurance.

### What about combining n8n + KB?

We considered it (option 3 above) and decided **not** to wire them
together for now. The agent's existing nine Postgres tools already let
it answer most platform questions by reading the live database directly
(payment_batches, batch_items, employees, expenses, etc.), and adding a
fourth Postgres call per message just to fetch curated text increases
the workflow's surface area without unlocking new capability. The KB
stays as searchable archive accessible through `/assistant/admin` and
the legacy edge function — that path can be revived any time by
blanking `VITE_N8N_CHAT_WEBHOOK_URL` on Vercel.

If a clear gap shows up later that the live-data tools can't answer (e.g.
"how do I onboard an approver?" with the answer living in a runbook the
agent doesn't otherwise see), wiring the KB in is a ~30-minute n8n
change.

## Where does the "internal KB" come in?

The codebase has a separate Supabase edge function called `chatbot-chat`
(at `supabase/functions/chatbot-chat/`). That function is the **legacy AI
assistant** built before n8n. It uses:

- Groq Llama 3.3 70B for text answers
- Gemini 1.5 Flash for image/PDF understanding
- Tavily for web search
- pgvector RAG retrieval from the `chatbot_knowledge` table — **this is the
  internal knowledge base.** Documents (runbooks, SOPs, etc.) live in that
  table as embeddings, and the function does similarity search before
  answering.

**Today, the internal KB is not being queried.** Because `VITE_N8N_CHAT_WEBHOOK_URL`
is set on Vercel, every chat goes to n8n and never touches `chatbot-chat`.
The n8n agent has its own tool list (Postgres row-readers for batches, items,
employees, expenses), but it does NOT have access to `chatbot_knowledge`.

You have three choices:

1. **n8n only** (current state): platform-data answers are excellent;
   long-form runbook answers are not. The agent only knows what its 9 tools
   can fetch.
2. **Edge function only**: blank `VITE_N8N_CHAT_WEBHOOK_URL` on Vercel and
   redeploy. You lose Sonnet 4.6 quality and the structured tool-calling but
   regain the internal KB / web search / vision.
3. **Both** (recommended long-term): add a Postgres node in n8n that does a
   pgvector `<=>` search against `chatbot_knowledge` and feed the top match
   into Build Context. Then the n8n agent can cite the KB. This is a
   ~30-minute n8n change; not done yet.

## What does the n8n agent search?

- **Platform data**: Postgres tables — `payment_batches`, `batch_items`,
  `employees`, `expenses`, etc. The agent decides which `getAll` tool to call
  based on the question, runs a SQL `SELECT` through the configured Postgres
  credential, and includes the rows in its answer.
- **Code in this repository**: **No.** The agent does not search the
  GitHub repo, branches, or commits. There is no GitHub tool wired into
  the workflow. (The "Tools — connected" panel labelled "GitHub" in the
  workflow card is a description, not an actual node — confirm by inspecting
  the master-agent's tool list inside n8n if you want to wire one up later.)
- **Knowledge base / runbooks**: **No.** As above.
- **The web**: **No.** No Tavily / Brave / SerpAPI tool is wired in n8n.

So today, the answer to "ask it about a technical error on the platform"
depends:

- "Why is batch X showing partial?" → it can answer, because it queries
  `payment_batches` and `batch_items`.
- "Why is the n8n webhook returning 403?" → it cannot, because that
  knowledge is not in any database the agent has access to.

## Layman's summary

> The chat asks the agent. The agent decides "do I need to look something
> up?". If yes, it picks one of nine database tools and pulls data straight
> from your Supabase tables. It does **not** read this codebase or the
> internet — only your live data. Anything you want it to know about
> *workflows, errors, processes* either has to be in the database, or has to
> be added to its tool list.

## Troubleshooting checklist

| Symptom | Cause | Fix |
|---|---|---|
| `403 Forbidden` from n8n | `x-kd-secret` header doesn't match the Header Auth credential in n8n | Compare `VITE_N8N_CHAT_SECRET` on Vercel with the credential value in n8n. They must match exactly. |
| `Unexpected end of JSON input` in browser | Workflow stopped mid-flow and returned no body | Open the workflow's "Executions" tab, find the failing run, and look for the first node that errored. Usually `Load History` (see Build Context section above). |
| Workflow runs but Build Context skipped | Upstream node returned no rows | Enable "Always Output Data" on `Load History` and `Load User Profile`. |
| Chat works locally but not on Vercel | Env vars not set in production | Vercel Project → Settings → Environment Variables → ensure both `VITE_N8N_CHAT_WEBHOOK_URL` and `VITE_N8N_CHAT_SECRET` are set for **Production** and redeploy. |
| Agent gives stale answers | n8n holds no cache; the issue is your Postgres credential is pointing at a stale replica or the read-only role can't see recent rows | Check the Postgres credential in n8n. |

## Files of interest

- `src/components/ChatWidget.tsx` — the widget UI and the routing decision
  between n8n and the edge function.
- `supabase/functions/chatbot-chat/index.ts` — the legacy edge function,
  including the FTS RAG against `chatbot_knowledge`.
- `supabase/migrations/20260730000001_fts_knowledge.sql` — the
  `match_chatbot_knowledge` function (kept available for any future
  caller; currently used only by the legacy edge function).
- n8n workspace: **Personal → King Squares ~ Nodes → KD Ops AI Assistant — Advanced**.
