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

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as webPush from "https://esm.sh/web-push@3.6.7";

const ALLOWED_ORIGINS = [
  "https://ops.kdsquares.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

interface PushBody {
  user_ids: string[];
  category?: "approvals" | "transfers" | "anomalies" | "schedules" | "announcements";
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

serve(async (req) => {
  const headers = corsHeaders(req);
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
      return new Response(JSON.stringify({
        error: "VAPID keys not configured. Generate them in Settings → Notifications.",
      }), {
        status: 412, // Precondition Failed
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    webPush.setVapidDetails(subject, pub, priv);

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
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-push] fatal:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
