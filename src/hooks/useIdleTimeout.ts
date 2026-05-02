// Idle session timeout
//
// Reads `company_settings.session_timeout_minutes` once and signs the user
// out after that many minutes of inactivity. A 60-second warning toast
// appears just before the cut so the user can move the mouse / keystroke
// to keep their session alive.
//
// Mounted once per authed session inside AppLayout. Never runs on /login.
//
// Activity events: mousemove, keydown, scroll, touchstart, click. Throttled
// to once per second so we don't spam state updates.

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;
const WARNING_BEFORE_MS = 60_000; // 1 minute warning before sign-out
const ACTIVITY_THROTTLE_MS = 1000;

export function useIdleTimeout() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { toast } = useToast();
  const navigate = useNavigate();

  const lastActivityRef = useRef<number>(Date.now());
  const checkerRef = useRef<number | null>(null);
  const timeoutMsRef = useRef<number>(60 * 60_000); // default 60min until settings load
  const warnedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    // ── Load configured timeout (then fall back to 60min) ────────────────
    void (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('session_timeout_minutes')
        .eq('id', SETTINGS_ID)
        .maybeSingle();
      if (cancelled) return;
      const mins = Number((data as any)?.session_timeout_minutes);
      if (Number.isFinite(mins) && mins > 0) {
        timeoutMsRef.current = mins * 60_000;
      }
    })();

    // ── Activity tracker (throttled) ─────────────────────────────────────
    let lastTick = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastTick < ACTIVITY_THROTTLE_MS) return;
      lastTick = now;
      lastActivityRef.current = now;
      if (warnedRef.current) {
        // User came back — dismiss the warning state silently.
        warnedRef.current = false;
      }
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    // ── Periodic checker (every 10s) ─────────────────────────────────────
    const tick = () => {
      const idle = Date.now() - lastActivityRef.current;
      const limit = timeoutMsRef.current;
      if (idle >= limit) {
        // Time's up — sign out.
        toast({
          title: 'Signed out for inactivity',
          description: 'For security, KD Ops signs you out after a period of no activity.',
        });
        void signOut().then(() => navigate('/login', { replace: true }));
        return;
      }
      if (!warnedRef.current && idle >= limit - WARNING_BEFORE_MS) {
        warnedRef.current = true;
        toast({
          title: 'Still there?',
          description: 'You\'ll be signed out in about 1 minute. Move the mouse or press a key to stay logged in.',
        });
      }
    };
    checkerRef.current = window.setInterval(tick, 10_000);

    return () => {
      cancelled = true;
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      if (checkerRef.current) window.clearInterval(checkerRef.current);
    };
  }, [user, signOut, navigate, toast]);
}
