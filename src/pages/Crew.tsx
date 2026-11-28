import { HqShell } from '@/features/crew/hq/HqShell';

/**
 * Crew HQ: mission control for the AI executives. Super Admin only (the route guard and every database policy check the role).
 * They read, advise and propose; nothing they propose changes anything until you approve it. The screens live in features/crew/hq.
 */
export default function Crew() {
  return <HqShell />;
}
