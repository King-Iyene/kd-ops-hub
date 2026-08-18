// FAQ & Troubleshooting — the closing section of the guide. Plain Q&A for
// the questions people actually raise (access, deletes, approvals), plus a
// short technical pointer for developers touching this codebase.
import { HelpCircle, Code } from 'lucide-react';
import { SectionIntro, RefSection, RefTable } from '@/components/guide/shared';

interface QA {
  q: string;
  a: string;
}

const FAQS: QA[] = [
  {
    q: "I can't see a page other people can see",
    a: "That's almost certainly by design, not a bug. Every page in KDOps is role-gated, and access is based on the role assigned to your account in Settings → Employees. If you think you should have access, ask your manager or an admin to check your role there — they can change it if it's wrong.",
  },
  {
    q: 'I forgot my password',
    a: "Use \"Forgot password\" on the login screen — it sends a reset link to your account email. Check spam if it doesn't arrive within a few minutes. If nothing shows up at all, ask an admin to confirm the email address on your account is actually correct; a reset link can't reach an email that's misspelled or out of date.",
  },
  {
    q: 'My invite link says it\'s expired, or doesn\'t work',
    a: 'Invite and reset links are single-use and time-limited by design, so this happens more often than it should feel like it does. Clicking an already-used or expired link takes you to a "Link no longer works" screen with a form to email yourself a fresh one on the spot — no admin needed. If the new one fails too, ask an admin to hit "Resend invite" next to your name in Employees. One common cause worth knowing about: some companies\' email security automatically "pre-clicks" links to scan them for malware, which can burn the single-use link before you ever open the email.',
  },
  {
    q: "Why can't I sign up myself?",
    a: 'KDOps is invite-only. Self-service signup is intentionally disabled — there is no public "create account" flow. An admin has to send you an invite before you can create a login.',
  },
  {
    q: 'I deleted something by mistake — is it gone forever?',
    a: 'Usually not. Most deletes in KDOps are "soft deletes": the record disappears from every screen you can see, but it is kept in the database rather than actually destroyed, and an admin can recover it from the backend. This applies to expenses, documents, budgets, leave requests, fuel requests, employees, contractors, and clients. If you delete one of these by mistake, tell an admin quickly rather than trying to recreate it from scratch.',
  },
  {
    q: 'A page shows a red error instead of loading',
    a: "Refresh the page first — most of these are a stale tab that reconnects fine on reload. If it keeps happening, note exactly which page it was and what you clicked right before it broke, then report that to an admin. \"It's broken\" is much harder to fix than \"the Payments page errored right after I clicked Submit on a batch.\"",
  },
  {
    q: 'Can I use KDOps on my phone without installing it?',
    a: "Yes — it works as a normal mobile website in any browser, no install required. Installing it as a PWA (add to home screen) just gives you a home-screen icon and a full-screen window with no browser bar; it doesn't unlock any feature the mobile site doesn't already have.",
  },
  {
    q: 'Why did my approval require a second person?',
    a: "Payment and expense approvals above a configured threshold require two independent approvers by design. It's a deliberate fraud/error safeguard on anything moving real money past a certain size — not a glitch, and not something either approver can bypass alone.",
  },
  {
    q: 'Who do I contact for access or bugs?',
    a: 'Your manager or a Super Admin. KDOps is an internal tool with no public support ticket system, so there is no external helpdesk to escalate to — access requests and bug reports both go through the same people who administer the system.',
  },
];

export function FaqSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={HelpCircle}
        title="FAQ & Troubleshooting"
        blurb="The questions that actually come up day to day, answered based on how KDOps really behaves — not generic help-desk boilerplate. If your issue isn't here, the last question below tells you who to ask."
      />

      <div className="space-y-3">
        {FAQS.map(({ q, a }) => (
          <div key={q} className="rounded-lg border p-4 space-y-1.5">
            <h3 className="font-semibold text-sm">{q}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
          </div>
        ))}
      </div>

      <RefSection icon={Code} title="For developers">
        <RefTable
          cols={['Area', 'Where it lives']}
          rows={[
            { a: 'This guide', b: 'src/pages/Guide.tsx (page shell) and src/components/guide/ (sections + shared building blocks). Add a new topic by adding a section file here, not by growing an existing one.' },
            { a: 'Database schema', b: 'supabase/migrations/ — every schema change is a migration file, applied in order.' },
            { a: 'Server-side logic', b: 'supabase/functions/ — webhooks, payment processing, and scheduled jobs run as Deno edge functions, deployed independently of the frontend.' },
            { a: 'After any migration', b: 'Run supabase db push before the change is live anywhere beyond your local database.' },
            { a: 'CI', b: 'Lint, typecheck, and build run on every push — see .github/workflows/ for the exact pipeline.' },
            { a: 'System Reference', b: 'Further up in this guide — documents every hard-coded cap, threshold, and security setting the platform actually enforces, generated to match the real code rather than written as aspirational documentation.' },
          ]}
        />
      </RefSection>
    </div>
  );
}
