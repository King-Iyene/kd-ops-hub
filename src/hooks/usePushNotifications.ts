/**
 * usePushNotifications
 *
 * Manages the browser PushSubscription lifecycle:
 *   - asks the browser for the current subscription
 *   - subscribes (with permission prompt) using the company VAPID public key
 *   - persists / removes the subscription on the server via push_subscriptions
 *
 * The actual notification UI is handled in the service worker (src/sw.ts).
 * This hook is purely the client-side bookkeeping for the subscription
 * itself plus the user-facing "are you subscribed?" state.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Status = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'loading';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushNotifications(userId: string | null | undefined) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const refresh = useCallback(async () => {
    if (!supported) { setStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'subscribed' : 'unsubscribed');
    } catch (err: any) {
      setError(err?.message || 'Could not check push state');
      setStatus('unsubscribed');
    }
  }, [supported]);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supported || !userId) return { ok: false, error: 'Not supported on this device' };
    setError(null);
    try {
      // Ask for permission first.
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'unsubscribed');
        return { ok: false, error: perm === 'denied' ? 'Permission denied' : 'Permission not granted' };
      }

      // Pull the VAPID public key via the vapid-keys edge function so the
      // private key is never exposed even if company_settings RLS slips up.
      const { data, error: edgeErr } = await supabase.functions.invoke('vapid-keys', {
        body: { action: 'status' },
      });
      if (edgeErr) throw edgeErr;
      const vapidPublic = (data as any)?.public_key;
      if (!vapidPublic) {
        throw new Error('Push not configured yet — an Admin needs to click "Generate keys" in Settings → Notifications.');
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic),
        });
      }

      const json: any = sub.toJSON();
      const p256dh = json?.keys?.p256dh;
      const auth = json?.keys?.auth;
      if (!p256dh || !auth) throw new Error('Subscription missing keys — try again.');

      // Upsert by (user_id, endpoint) — same device twice is one row.
      const { error: dbErr } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh_key: p256dh,
        auth_key: auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' });
      if (dbErr) throw dbErr;

      setStatus('subscribed');
      return { ok: true };
    } catch (err: any) {
      const message = err?.message || 'Could not enable push notifications';
      setError(message);
      await refresh();
      return { ok: false, error: message };
    }
  }, [supported, userId, refresh]);

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supported || !userId) return { ok: false, error: 'Not supported on this device' };
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint);
      }
      setStatus('unsubscribed');
      return { ok: true };
    } catch (err: any) {
      const message = err?.message || 'Could not disable push notifications';
      setError(message);
      return { ok: false, error: message };
    }
  }, [supported, userId]);

  return { status, supported, error, subscribe, unsubscribe, refresh };
}
