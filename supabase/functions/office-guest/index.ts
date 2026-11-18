// supabase/functions/office-guest/index.ts
//
// Guests for the Virtual Office. A guest has no account: they get an emailed link with a long random token.
//
//   Members (a signed-in KD Ops user who is in the office):
//     { action: 'create', spaceId, duration, autoAdmit?, guestId? | (email, name) }   invite (or invite again) a guest
//     { action: 'decide', inviteId, decision }        'approve' | 'deny' | 'end'  (the person who invited, or an admin)
//     { action: 'forget', guestId }                   remove someone from the guest list (admins)
//   Guests (no sign-in; only the link token):
//     { action: 'knock',  token }                     open the link: ask to come in (or walk straight in if the host allowed it)
//     { action: 'status', token }                     check whether they have been let in
//
// How long a link works: one visit, 1 day, 7 days, 30 days or 90 days. Each visit lasts 2 hours. By default every visit
// needs the host (or an admin) to say yes; the host can instead let a trusted guest in without asking until the link ends.
//
// What a guest can ever learn: their own name, the host's first name, the space's name, and, once let in, the secret
// name of the private visitor room. Nothing else in the database is reachable from here.
//
// Deploy: supabase functions deploy office-guest --no-verify-jwt   (it authenticates in code, below)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const SESSION_HOURS = 2;
const MAX_ACTIVE_PER_PERSON = 40;
const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://ops.kdsquares.com";

type Duration = "once" | "1d" | "7d" | "30d" | "90d";
const DURATIONS: Record<Duration, { days: number; maxVisits: number | null; label: string }> = {
  once: { days: 7, maxVisits: 1, label: "one visit (the link works for 7 days)" },
  "1d": { days: 1, maxVisits: null, label: "1 day" },
  "7d": { days: 7, maxVisits: null, label: "7 days" },
  "30d": { days: 30, maxVisits: null, label: "30 days" },
  "90d": { days: 90, maxVisits: null, label: "90 days" },
};

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const validEmail = (e: string) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e) && e.length <= 200;
const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "your host";

// a gentle limit on the public actions, per address, kept in memory (it resets when the function restarts)
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n += 1;
  return h.n > 90;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const action = String(body.action ?? "");

  // ---- who is calling, for the member actions
  const memberOf = async (): Promise<{ id: string; admin: boolean; name: string } | null> => {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return null;
    const { data, error } = await db.auth.getUser(jwt);
    if (error || !data?.user) return null;
    const id = data.user.id;
    const { data: ids } = await db.rpc("office_member_ids");
    const list = ((ids ?? []) as unknown[]).map((x) => (typeof x === "string" ? x : String((x as Record<string, unknown>).office_member_ids ?? x)));
    if (!list.includes(id)) return null;
    const { data: p } = await db.from("profiles").select("full_name, role").eq("id", id).maybeSingle();
    return { id, admin: p?.role === "admin" || p?.role === "super_admin", name: (p?.full_name as string) ?? "A colleague" };
  };

  /** Let a guest in for one visit: a fresh private room that lasts two hours. */
  const admit = async (inviteId: string, visits: number, by: string | null) => {
    const now = new Date();
    await db.from("office_guest_invites").update({
      status: "approved", room_secret: randomToken(24), approved_by: by, approved_at: now.toISOString(), visits: visits + 1,
      session_until: new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString(),
    }).eq("id", inviteId);
  };

  try {
    // ===================== member actions =====================
    if (action === "create") {
      const me = await memberOf();
      if (!me) return json({ error: "not allowed" }, 403);
      const spaceId = String(body.spaceId ?? "");
      const duration = (String(body.duration ?? "7d") in DURATIONS ? String(body.duration ?? "7d") : "7d") as Duration;
      const autoAdmit = body.autoAdmit === true;
      const { data: space } = await db.from("office_spaces").select("id, name, kind").eq("id", spaceId).maybeSingle();
      if (!space || space.kind !== "team") return json({ error: "That space cannot have guests." }, 400);

      // a guest we have invited before (picked from the list), or a new one
      let guestId: string | null = null;
      let email = String(body.email ?? "").trim().toLowerCase();
      let name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (body.guestId) {
        const { data: g } = await db.from("office_guests").select("id, name, email, space_id").eq("id", String(body.guestId)).maybeSingle();
        if (!g || g.space_id !== space.id) return json({ error: "That guest was not found." }, 404);
        guestId = g.id as string; email = g.email as string; name = g.name as string;
      }
      if (!validEmail(email) || !name) return json({ error: "Enter the guest's name and a valid email." }, 400);
      if (!guestId) {
        // the same email (any capitals) is the same guest: reuse them, otherwise add them to the list
        const { data: found } = await db.from("office_guests").select("id").eq("space_id", space.id).eq("email", email).maybeSingle();
        if (found) {
          guestId = found.id as string;
          await db.from("office_guests").update({ name, last_invited_at: new Date().toISOString() }).eq("id", guestId);
        } else {
          const { data: made, error: ge } = await db.from("office_guests").insert({ space_id: space.id, name, email, created_by: me.id }).select("id").single();
          if (ge || !made) return json({ error: "Could not save the guest." }, 500);
          guestId = made.id as string;
        }
      } else {
        await db.from("office_guests").update({ last_invited_at: new Date().toISOString() }).eq("id", guestId);
      }

      const { count } = await db.from("office_guest_invites").select("id", { count: "exact", head: true })
        .eq("invited_by", me.id).in("status", ["invited", "waiting", "approved"]).gt("expires_at", new Date().toISOString());
      if ((count ?? 0) >= MAX_ACTIVE_PER_PERSON) return json({ error: "You have too many open invitations. End some first." }, 429);

      const d = DURATIONS[duration];
      const token = randomToken();
      const { data: row, error } = await db.from("office_guest_invites").insert({
        space_id: space.id, guest_id: guestId, invited_by: me.id, email, name, token_hash: await sha256(token),
        duration, max_visits: d.maxVisits, auto_admit: autoAdmit,
        expires_at: new Date(Date.now() + d.days * 86400_000).toISOString(),
      }).select("id").single();
      if (error || !row) return json({ error: "Could not create the invitation." }, 500);

      const link = `${APP_URL}/visit/${token}`;
      let emailed = false;
      try {
        const how = autoAdmit ? `You can come in whenever you open the link.` : `When you open it you wait outside until ${escapeHtml(firstName(me.name))} lets you in.`;
        const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2733">
          <h2 style="margin:0 0 12px">${escapeHtml(me.name)} invited you to visit ${escapeHtml(space.name as string)}</h2>
          <p style="line-height:1.55">Hi ${escapeHtml(name)}, you can drop into a private visitor room and meet ${escapeHtml(firstName(me.name))} on video. No account or download is needed.</p>
          <p style="margin:24px 0"><a href="${link}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open your visitor link</a></p>
          <p style="font-size:13px;color:#5b6b7b;line-height:1.5">${how} Your link works for ${escapeHtml(d.label)}, and each visit lasts ${SESSION_HOURS} hours. Please do not share it: it is only for you.</p></div>`;
        const r = await fetch(`${url}/functions/v1/send-email`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "email", to: email, subject: `${me.name} invited you to visit ${space.name}`, html }),
        });
        const out = await r.json().catch(() => ({}));
        emailed = r.ok && out?.ok !== false && !out?.dev_skip;
      } catch { emailed = false; }
      return json({ ok: true, inviteId: row.id, guestId, link, emailed });
    }

    if (action === "decide") {
      const me = await memberOf();
      if (!me) return json({ error: "not allowed" }, 403);
      const decision = String(body.decision ?? "");
      const { data: inv } = await db.from("office_guest_invites").select("*").eq("id", String(body.inviteId ?? "")).maybeSingle();
      if (!inv) return json({ error: "not found" }, 404);
      if (inv.invited_by !== me.id && !me.admin) return json({ error: "Only the person who invited them, or an admin, can do that." }, 403);
      const now = new Date();
      if (decision === "approve") {
        if (new Date(inv.expires_at as string) < now) return json({ error: "That invitation has expired." }, 400);
        if (inv.max_visits !== null && (inv.visits as number) >= (inv.max_visits as number)) return json({ error: "That was a one-visit link and it has been used. Invite them again." }, 400);
        await admit(inv.id as string, inv.visits as number, me.id);
        return json({ ok: true });
      }
      if (decision === "deny") {
        await db.from("office_guest_invites").update({ status: "denied", room_secret: null, session_until: null }).eq("id", inv.id);
        return json({ ok: true });
      }
      if (decision === "end") {
        await db.from("office_guest_invites").update({ status: "ended", room_secret: null, session_until: null }).eq("id", inv.id);
        return json({ ok: true });
      }
      return json({ error: "bad decision" }, 400);
    }

    if (action === "forget") {
      const me = await memberOf();
      if (!me || !me.admin) return json({ error: "Only admins can do that." }, 403);
      await db.from("office_guests").delete().eq("id", String(body.guestId ?? ""));
      return json({ ok: true });
    }

    // ===================== guest actions (only the link token) =====================
    if (action === "knock" || action === "status") {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
      if (limited(ip)) return json({ status: "slow" }, 429);
      const token = String(body.token ?? "");
      if (token.length < 30 || token.length > 120) return json({ status: "invalid" });
      const { data: inv } = await db.from("office_guest_invites").select("*").eq("token_hash", await sha256(token)).maybeSingle();
      if (!inv) return json({ status: "invalid" });
      const now = new Date();
      const stillRunning = inv.status === "approved" && inv.session_until && new Date(inv.session_until as string) > now;
      if (new Date(inv.expires_at as string) < now && !stillRunning) return json({ status: "expired" });

      const { data: host } = await db.from("profiles").select("full_name").eq("id", inv.invited_by).maybeSingle();
      const { data: space } = await db.from("office_spaces").select("name").eq("id", inv.space_id).maybeSingle();
      const base = { name: inv.name, host: firstName(host?.full_name as string), space: (space?.name as string) ?? "the office" };

      let status = inv.status as string;
      let visits = inv.visits as number;
      let secret = inv.room_secret as string | null;
      let until = inv.session_until as string | null;
      // a visit that ran its two hours is over
      if (status === "approved" && !stillRunning) {
        status = "ended";
        await db.from("office_guest_invites").update({ status: "ended", room_secret: null, session_until: null }).eq("id", inv.id);
      }
      const used = inv.max_visits !== null && visits >= (inv.max_visits as number);
      // a finished visit on a link that allows more starts a new one, but only when the guest knocks
      if (status === "ended" && action === "knock") {
        if (used) return json({ ...base, status: "used" });
        status = "invited";
      }
      if (status === "ended" && used) return json({ ...base, status: "used" });
      if (status === "invited" && action === "knock") {
        if (inv.auto_admit && !used) {
          // the host said this guest may walk in
          await admit(inv.id as string, visits, null);
          const { data: again } = await db.from("office_guest_invites").select("room_secret, session_until, visits").eq("id", inv.id).maybeSingle();
          status = "approved"; secret = (again?.room_secret as string) ?? null; until = (again?.session_until as string) ?? null; visits = (again?.visits as number) ?? visits;
        } else {
          status = "waiting";
          await db.from("office_guest_invites").update({ status: "waiting", waiting_at: now.toISOString() }).eq("id", inv.id);
        }
      }
      if (status === "approved") return json({ ...base, status, secret, until });
      return json({ ...base, status });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[office-guest]", e);
    return json({ error: "Something went wrong." }, 500);
  }
});
