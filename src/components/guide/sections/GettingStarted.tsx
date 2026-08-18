// Getting Started — the first stop for every new KDOps user, regardless of
// role. Covers logging in for the first time, installing the PWA on a
// phone or desktop, understanding the two dashboard variants, and setting
// up a profile (including notification preferences and 2FA).
import { LogIn } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout, Screenshot } from '@/components/guide/shared';

export function GettingStartedSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={LogIn}
        title="Getting Started"
        blurb="Whatever your role — Finance, Operations, Field Team, or Admin — this is where you start. Everyone logs in the same way, everyone should install KDOps on their phone, and everyone lands on a dashboard shaped for their job. Read this section first; the rest of the guide assumes you've done it."
      />

      <Screenshot
        src="/guide/guide-desktop.jpg"
        alt="The KDOps Platform Guide, showing the collapsible sidebar and this Getting Started page"
        caption="This guide, right where you're reading it now — every section is its own page, searchable from the sidebar."
      />

      <ModuleCard title="Logging In" route="/login" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          KDOps is invite-only — you cannot sign yourself up. An admin or HR creates your employee record in the system and sends
          you an email invite with a one-time link. Opening that link lets you set your own password; from then on you log in with
          your work email and the password you chose. If you never received an invite, or it's expired, ask HR or your admin to
          resend it rather than trying to register a new account yourself — there is no registration form.
        </p>
        <StepList
          steps={[
            <>Open the invite email and click the link, or go straight to <code className="text-xs bg-muted px-1 py-0.5 rounded">/login</code> if you already set a password.</>,
            <>Enter your work email address and password. There's a small eye icon in the password field if you want to check what you typed before submitting.</>,
            <>If your account has <strong>two-factor authentication (2FA)</strong> turned on, you'll get a second prompt asking for a 6-digit code from your authenticator app (Google Authenticator, Authy, or similar) — enter it to finish logging in.</>,
            <>Click <strong>Sign In</strong>. A correct email/password (and 2FA code, if enabled) takes you straight to your dashboard.</>,
          ]}
        />
        <Screenshot src="/guide/login-desktop.jpg" alt="The KDOps login screen" caption="The login screen — the same for every role." />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Forgot your password? Click <strong>"Forgot password?"</strong> on the login screen, enter your work email, and a reset
          link is emailed to you — follow it to set a new password. The old password stops working the moment the new one is saved.
        </p>
        <Callout tone="warn">
          If login redirects you somewhere unexpected instead of your dashboard, here's what it means: landing on{' '}
          <code className="text-xs bg-background/60 px-1 py-0.5 rounded">/unauthorized</code> means your profile is inactive or
          still pending activation — contact your admin, don't keep retrying. Landing on{' '}
          <code className="text-xs bg-background/60 px-1 py-0.5 rounded">/reset-password</code> means your password has expired or
          your original invite was never completed — just set a new password there and you're back in.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Installing on Your Phone (PWA)" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          KDOps is a Progressive Web App, not a native app — there is nothing to find in the App Store or Play Store. Instead you
          install it straight from your browser, and it then behaves like any other app on your phone: its own icon on your home
          screen, opens full-screen with no browser address bar, and the app shell still loads even with a weak or dropped
          connection (though anything that needs live data, like submitting an expense, still needs a signal). This is the
          recommended way to use KDOps day-to-day, especially for the Field Team, who are rarely at a desk.
        </p>
        <StepList
          steps={[
            <><strong>iPhone (Safari):</strong> open kdops in Safari — it must be Safari, not Chrome, for this to work on iOS. Tap the <strong>Share</strong> icon (the square with an arrow pointing up) in the bottom toolbar, scroll down, and tap <strong>"Add to Home Screen"</strong>. Confirm the name and tap <strong>Add</strong>.</>,
            <><strong>Android (Chrome):</strong> open kdops in Chrome. Chrome often shows an <strong>"Install app"</strong> banner automatically — tap it. If it doesn't appear, tap the <strong>⋮</strong> menu (top right) and choose <strong>"Install app"</strong> from the list.</>,
            <><strong>Desktop (Chrome or Edge):</strong> look for a small install icon in the address bar (usually a monitor-with-arrow icon on the right side, next to the bookmark star). Click it, then click <strong>Install</strong>. KDOps then opens in its own window, separate from your other browser tabs.</>,
          ]}
        />
        <Callout tone="tip">
          Install it once and forget it — updates to KDOps are pulled automatically the next time you open the app with a
          connection, no manual update step required.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Your Dashboard" route="/dashboard · /my-dashboard" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          KDOps doesn't show everyone the same home screen — what you land on after login depends on your role, because a
          Finance controller and a Field Team member need to see completely different things first thing in the morning.
        </p>
        <StepList
          steps={[
            <><strong>Super Admin, Admin, Finance, and Operations</strong> land on the company-wide <strong>Dashboard</strong>: overall cash position, payments and approvals waiting on someone, budget health versus plan, and an amber <strong>30-day expiry alert panel</strong> that flags documents and compliance filings (licenses, insurance, certifications, registrations) approaching their expiry date so nothing lapses unnoticed. A <strong>Quick Actions</strong> panel sits alongside it for the handful of things this group does most often — raising a payment, approving a request, adding an employee.</>,
            <><strong>Field Team</strong> lands on <strong>My Dashboard</strong> instead — a personal view of your own tasks, your remaining leave balance, whether your timesheet for the period is submitted or still pending, and progress against your current goals. Nothing here is company-wide; it's just your own work.</>,
            <>Both dashboards show an <strong>announcement banner</strong> at the top when there's something company-wide to know — a policy change, a system maintenance window, a public holiday notice. You can dismiss it and it stays dismissed for you specifically; it doesn't reappear until a new announcement is pushed. Admins can post a new announcement that goes out to everyone at once.</>,
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Screenshot src="/guide/dashboard-desktop.jpg" alt="The KDOps company-wide Dashboard on desktop" caption="Dashboard (desktop) — Super Admin, Admin, Finance, Operations." />
          <Screenshot variant="mobile" src="/guide/dashboard-mobile.jpg" alt="The KDOps dashboard on a mobile phone" caption="The same dashboard on a phone, installed as a PWA." />
        </div>
      </ModuleCard>

      <ModuleCard title="Your Profile" route="/profile" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Everything about how KDOps identifies you and talks to you lives in your profile: your photo, your contact details,
          how you get notified, your password, and your 2FA setup. It's worth spending five minutes here on day one rather than
          discovering later that notifications never reached you because a phone number was wrong.
        </p>
        <StepList
          steps={[
            <>Update your <strong>photo and contact details</strong> (phone number, WhatsApp number if different) — these are what notifications and other staff use to reach you.</>,
            <>Set your <strong>notification preferences</strong>: each notification category — payslip, payments, earned wage access (EWA), leave, approvals, compliance, and fleet — has its own WhatsApp and SMS toggles, so you can get payslip alerts by WhatsApp but skip SMS for fleet updates, for example. Turn on only what's genuinely useful to you; every category still shows up in the in-app notification bell regardless of these toggles.</>,
            <>Change your <strong>password</strong> any time from the Security section — you don't need to wait for it to expire.</>,
            <>Set up <strong>two-factor authentication (2FA)</strong> by scanning the QR code shown with your authenticator app, then entering the 6-digit code it generates to confirm the pairing. Once enabled, every login asks for a fresh code in addition to your password.</>,
          ]}
        />
        <Callout tone="tip">
          Turn on 2FA even if your role doesn't require it. It takes two minutes to set up and is the single biggest thing you can
          do to stop someone else logging in as you if your password ever leaks.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Notifications" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The <strong>notification bell</strong> in the top bar is always the source of truth — every notification KDOps generates
          for you shows up there, whether or not you've turned on WhatsApp, SMS, or push for that category. Those extra channels
          (configured per-category from your Profile, as above) are for the notifications you don't want to miss just because
          you didn't happen to have the app open — a payslip landing, a payment needing your approval, a compliance document about
          to expire.
        </p>
        <StepList
          steps={[
            <>Click the <strong>bell icon</strong> anywhere in KDOps to see your unread notifications, grouped roughly by how recent they are.</>,
            <>Go to <strong>Profile → Notification Preferences</strong> to turn WhatsApp, SMS, or push on or off per category — see the Profile module above.</>,
            <>Use the <strong>AI Assistant</strong> in the sidebar — it's reachable from any page in KDOps — for quick questions against your own company data, like "how many leave days do I have left?" or "when is my next payslip due?", without having to go find the right module yourself.</>,
          ]}
        />
      </ModuleCard>
    </div>
  );
}
