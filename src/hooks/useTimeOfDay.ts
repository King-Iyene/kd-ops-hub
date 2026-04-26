import { useEffect, useState } from 'react';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function classify(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

/**
 * Returns the current part of the day and writes it to the <html data-tod="…">
 * attribute so CSS can pick up ambient palette shifts (--tod-aurora-*, --tod-glow).
 * Re-evaluates every 5 minutes — cheap, no listeners.
 */
export function useTimeOfDay(): TimeOfDay {
  const [tod, setTod] = useState<TimeOfDay>(() => classify(new Date().getHours()));

  useEffect(() => {
    document.documentElement.setAttribute('data-tod', tod);
  }, [tod]);

  useEffect(() => {
    const tick = () => setTod(classify(new Date().getHours()));
    tick();
    const interval = window.setInterval(tick, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  return tod;
}

/** Smart greeting that matches the time of day with a touch of personality. */
export function greetingFor(tod: TimeOfDay): string {
  switch (tod) {
    case 'morning':   return 'Good morning';
    case 'afternoon': return 'Good afternoon';
    case 'evening':   return 'Good evening';
    case 'night':     return 'Working late';
  }
}
