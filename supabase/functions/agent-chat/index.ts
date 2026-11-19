// Ops Agent: chat.
//
// Deploy: supabase functions deploy agent-chat --no-verify-jwt   (it checks the JWT and the role itself)
//
// POST { message, thread_id? }  Super Admin only
//   -> { ok: true, thread_id, reply, tools_used, title, memory_suggestions: [{ id, type, content, detail, scope, scope_ref }] }
//      or { ok: false, reason, message }.  A suggestion is already saved as a proposed memory; the person answers Yes or No.
//
// The thread, the person's message and the title are written as the caller (row level security makes the thread
// private). The assistant's reply is written by the service role. Data comes only through agent_chat_tool.

import { getCorsHeaders } from '../_shared/cors.ts';
import { authenticateAgentCaller, jsonResponse } from '../_shared/agent-auth.ts';
import { serviceClient } from '../_shared/agent-claude.ts';
import { chatFailureMessage, runChat, type ChatTurn } from '../_shared/agent-chat.ts';

const cors = (req: Request) => ({ ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
const MAX_MESSAGE = 4000;
const HISTORY_TURNS = 12;
const PER_MINUTE = 12;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return jsonResponse(cors(req), { error: 'method_not_allowed' }, 405);

  const auth = await authenticateAgentCaller(req);
  if (!auth.ok) return jsonResponse(cors(req), { error: auth.error }, auth.status);
  const { caller } = auth;

  let body: { message?: unknown; thread_id?: unknown } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return jsonResponse(cors(req), { ok: false, reason: 'empty', message: 'Type a question first.' }, 400);
  if (message.length > MAX_MESSAGE) return jsonResponse(cors(req), { ok: false, reason: 'too_long', message: `Please keep it under ${MAX_MESSAGE} characters.` }, 400);

  const db = serviceClient();
  const user = caller.asUser;
  try {
    // Throttle per person: a runaway loop or a pasted script cannot spend the budget.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db.from('agent_chat_messages').select('id, agent_chat_threads!inner(user_id)', { count: 'exact', head: true })
      .eq('role', 'user').gte('created_at', since).eq('agent_chat_threads.user_id', caller.userId);
    if ((count ?? 0) >= PER_MINUTE) return jsonResponse(cors(req), { ok: false, reason: 'rate_limited', message: 'Slow down a little: too many questions in a minute.' }, 429);

    // The thread: an existing one of theirs (row level security hides everyone else's) or a new one.
    let threadId = typeof body.thread_id === 'string' ? body.thread_id : '';
    let title = 'New chat';
    if (threadId) {
      const { data: t } = await user.from('agent_chat_threads').select('id, title').eq('id', threadId).maybeSingle();
      if (!t) return jsonResponse(cors(req), { ok: false, reason: 'no_thread', message: 'That conversation was not found.' }, 404);
      title = t.title;
    } else {
      const { data: t, error } = await user.from('agent_chat_threads').insert({ user_id: caller.userId }).select('id, title').single();
      if (error || !t) return jsonResponse(cors(req), { error: 'server_error' }, 500);
      threadId = t.id; title = t.title;
    }

    const { data: prior } = await user.from('agent_chat_messages').select('role, content').eq('thread_id', threadId)
      .in('role', ['user', 'assistant']).order('created_at', { ascending: false }).limit(HISTORY_TURNS);
    const history: ChatTurn[] = (prior ?? []).reverse().filter((m: { content: string }) => m.content).map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }));
    // The API needs the turns to alternate and to start with the person.
    while (history.length && history[0].role !== 'user') history.shift();
    const clean: ChatTurn[] = [];
    for (const h of history) { if (clean.length && clean[clean.length - 1].role === h.role) clean[clean.length - 1] = h; else clean.push(h); }
    if (clean.length && clean[clean.length - 1].role === 'user') clean.pop(); // a question that never got an answer

    await user.from('agent_chat_messages').insert({ thread_id: threadId, role: 'user', content: message });

    const result = await runChat({ db, asUser: user, userId: caller.userId, threadId, history: clean, message });
    if (!result.ok) {
      return jsonResponse(cors(req), { ok: false, reason: result.reason, thread_id: threadId, message: chatFailureMessage(result.reason) });
    }

    await db.from('agent_chat_messages').insert({ thread_id: threadId, role: 'assistant', content: result.reply, tool_calls: result.toolsUsed.length ? result.toolsUsed : null });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title === 'New chat') { title = message.replace(/\s+/g, ' ').slice(0, 60); patch.title = title; }
    await user.from('agent_chat_threads').update(patch).eq('id', threadId);

    return jsonResponse(cors(req), { ok: true, thread_id: threadId, reply: result.reply, tools_used: result.toolsUsed, title, memory_suggestions: result.memorySuggestions });
  } catch (e) {
    console.error('agent-chat error', e instanceof Error ? e.message : e);
    return jsonResponse(cors(req), { error: 'server_error' }, 500);
  }
});
