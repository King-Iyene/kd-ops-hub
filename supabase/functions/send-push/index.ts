// supabase/functions/send-push/index.ts
//
// Web Push sender. Takes a target user_id (or a list) + a payload,
// looks up their active push subscriptions, signs each payload with the
// configured VAPID keys, and POSTs to the corresponding push service
// (Mozilla, Google, Apple, Edge).
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
//
// Auth: requires a valid Supabase JWT. Internal callers (other edge
// functions, triggers) can also use the SERVICE_ROLE key — anything that
// bypasses RLS is allowed to enqueue pushes for any user.
//
// Body shape:
//   {
//     user_ids:     string[],       // who to notify (one or more)
//     category?:    'approvals' | 'transfers' | 'anomalies' | 'schedules' | 'announcements',
//     title:        string,
//     body:         string,
//     url?:         string,         // path to navigate to on click
//     icon?:        string,
//     tag?:         string,         // de-dupe key for the OS notification stack
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// Use the `npm:` specifier instead of esm.sh: web-push depends on Node's
// native crypto/http modules and the esm.sh polyfill build has historically
// thrown at runtime inside Deno (the source of the noisy `send-push 500`s).
// Deno's native npm support (enabled by Supabase Edge Functions) handles
// Node compat correctly for this package.
import webPush from "npm:web-push@3.6.7";
import { constantTimeEquals } from "../_shared/timing.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface PushBody {
  user_ids: string[];
  category?: "approvals" | "transfers" | "anomalies" | "schedules" | "announcements";
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

Deno.serve(async (req) => {
  const headers = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const payload: PushBody = await req.json();
    if (!Array.isArray(payload.user_ids) || payload.user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids required" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── AUTH GATE ────────────────────────────────────────────────────────
    // Deploy uses --no-verify-jwt (Supabase's recommended pattern for edge
    // functions that authenticate in code). Without this block anyone with
    // the function URL could POST arbitrary title/body/URL to any subscribed
    // user — a phishing surface, since the OS-level push looks like it came
    // from KDOps. Accept three paths:
    //   1. Internal cross-function / cron caller with X-Cron-Secret
    //   2. Service-role bearer (used by future server-side workers)
    //   3. Authenticated staff JWT (browser callers via supabase-js)
    // Anonymous / anon-key requests are rejected.
    const authHeader = req.headers.get("authorization") || "";
    const bearer     = authHeader.replace(/^Bearer\s+/i, "");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCron   = Deno.env.get("CRON_SHARED_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey        = Deno.env.get("SUPABASE_ANON_KEY");

    const isCronCall    = constantTimeEquals(cronSecret, expectedCron);
    const isServiceRole = constantTimeEquals(bearer, serviceRoleKey);

    let authorized = isCronCall || isServiceRole;

    if (!authorized) {
      // A raw anon-key bearer is NOT a real user session — reject it explicitly
      // so we don't fall through into getUser with a token that will fail
      // cleanly but confusingly.
      if (!bearer || (anonKey && bearer === anonKey)) {
        return new Response(JSON.stringify({ error: "unauthorized: staff sign-in required" }), {
          status: 401,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      // Validate the JWT against auth.users. Pass the token explicitly —
      // supabase-js v2 otherwise looks for an internal session that doesn't
      // exist server-side and returns "Auth session missing!".
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        anonKey!,
        { global: { headers: { Authorization: `Bearer ${bearer}` } } },
      );
      const { data: userRes, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !userRes?.user) {
        return new Response(JSON.stringify({ error: "unauthorized: invalid session" }), {
          status: 401,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      // Any active staff profile can enqueue pushes to teammates; deactivated
      // accounts cannot. We deliberately do NOT restrict by role here — every
      // module in the app has a legitimate reason to notify (approvals, HR,
      // fleet alerts, expense-side, chatbot handoff), and the per-user push
      // preference table already lets recipients opt out.
      const { data: profile } = await service
        .from("profiles")
        .select("id, status")
        .eq("id", userRes.user.id)
        .maybeSingle();
      if (!profile || ((profile as any).status && (profile as any).status !== "active")) {
        return new Response(JSON.stringify({ error: "forbidden: inactive account" }), {
          status: 403,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      authorized = true;

      // Rate limit: max 20 push sends per staff user per 60 seconds.
      // Cron/service-role callers skip this (trusted backend code). Any
      // active staff JWT can target any teammate (see the comment above),
      // so without a limit here a phished or abused low-privilege account
      // could blast every subscribed device — mirrors send-email's
      // identical audit-log-based limiter.
      try {
        const since = new Date(Date.now() - 60_000).toISOString();
        const { count } = await service
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userRes.user.id)
          .eq("action", "send_push")
          .gte("created_at", since);
        if ((count ?? 0) >= 20) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded — max 20 push sends per minute" }), {
            status: 429,
            headers: { ...headers, "Content-Type": "application/json" },
          });
        }
        await service.from("audit_logs").insert({
          user_id: userRes.user.id,
          action: "send_push",
          table_name: "push_subscriptions",
        });
      } catch (_) {
        // Fail open — don't block a legitimate push on rate-limit check failure.
      }
    }

    // VAPID keys live on company_settings — single-tenant for now.
    const { data: settings } = await service
      .from("company_settings")
      .select("vapid_public_key, vapid_private_key, vapid_subject")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    const pub = (settings as any)?.vapid_public_key;
    const priv = (settings as any)?.vapid_private_key;
    const subject = (settings as any)?.vapid_subject ?? "mailto:support@kdsquares.com";

    if (!pub || !priv) {
      // Return 200 ok:false rather than 412 — keeps the browser console clean
      // for the fire-and-forget caller; the diagnostic body still surfaces in
      // dev tools and in the function logs.
      return new Response(JSON.stringify({
        ok: false,
        error: "VAPID keys not configured. Generate them in Settings → Notifications.",
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    try {
      webPush.setVapidDetails(subject, pub, priv);
    } catch (vapidErr) {
      const m = vapidErr instanceof Error ? vapidErr.message : String(vapidErr);
      console.error("[send-push] invalid VAPID config:", m);
      return new Response(JSON.stringify({
        ok: false,
        error: `VAPID config invalid: ${m}. Regenerate keys in Settings → Notifications.`,
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Filter by user-level category preference. If a user has muted
    // 'transfers' in their prefs, skip them for transfer pushes.
    let targetUserIds = payload.user_ids;
    if (payload.category) {
      const { data: prefs } = await service
        .from("push_preferences")
        .select(`user_id, ${payload.category}`)
        .in("user_id", payload.user_ids);
      const allowed = new Set<string>(payload.user_ids); // default: opt-in
      for (const row of prefs ?? []) {
        if ((row as any)[payload.category!] === false) {
          allowed.delete((row as any).user_id);
        }
      }
      targetUserIds = [...allowed];
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "all recipients muted" }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await service
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh_key, auth_key")
      .in("user_id", targetUserIds);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no subscriptions" }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/",
      icon: payload.icon ?? "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag,
    });

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];
    for (const s of subs) {
      const subscription = {
        endpoint: (s as any).endpoint,
        keys: { p256dh: (s as any).p256dh_key, auth: (s as any).auth_key },
      };
      try {
        await webPush.sendNotification(subscription, notificationPayload, { TTL: 3600 });
        sent++;
      } catch (err: any) {
        failed++;
        // 410 Gone or 404 Not Found = subscription dead, clean it up.
        const code = err?.statusCode ?? err?.status ?? 0;
        if (code === 410 || code === 404) expired.push((s as any).id);
        console.warn("[send-push] delivery failed:", code, err?.body || err?.message);
      }
    }

    if (expired.length > 0) {
      await service.from("push_subscriptions").delete().in("id", expired);
    }

    // Touch last_seen_at on the survivors so we know which devices are still alive.
    const surviving = subs
      .filter((s: any) => !expired.includes(s.id))
      .map((s: any) => s.id);
    if (surviving.length > 0) {
      await service
        .from("push_subscriptions")
        .update({ last_seen_at: new Date().toISOString() })
        .in("id", surviving);
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, expired: expired.length }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    // send-push is a fire-and-forget delivery side-effect — never return 500.
    // The originating action (batch approval, expense submission, etc.) doesn't
    // depend on this call succeeding, and a 500 just clutters every operator's
    // browser console with a red error. Log the real cause to the function
    // log and return ok:false 200 instead.
    // Full message + stack stay server-side only — this function is callable
    // by any active staff JWT (see the auth comment above), so returning raw
    // internal detail here would leak file paths and call structure to any
    // logged-in account.
    const message = err instanceof Error ? `${err.message}${err.stack ? "\n" + err.stack : ""}` : String(err);
    console.error("[send-push] fatal:", message);
    return new Response(JSON.stringify({ ok: false, error: "Could not send notification." }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
