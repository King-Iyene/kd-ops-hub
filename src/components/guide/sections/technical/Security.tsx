import { RefTable, RefSection } from '@/components/guide/shared';
import { Lock, ShieldCheck, Shield, Globe } from 'lucide-react';

export function TechSecuritySection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Security Settings</h2>
      <RefSection icon={Lock} title="Authentication & passwords">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Minimum password length',   b: '12 characters' },
            { a: 'Password complexity',       b: 'Must contain at least one letter and one number' },
            { a: 'Login rate limit',          b: '5 failed attempts per email in 15 minutes → 15-minute lockout' },
            { a: 'Failed login tracking',     b: 'Recorded in failed_login_attempts table (admins only)' },
            { a: 'Login / logout audited',    b: 'Every session start and end recorded in audit_logs' },
            { a: 'Session storage',           b: 'localStorage with auto-refresh JWT. Cleared on Sign Out' },
            { a: '"View As role"',            b: 'super_admin only — sessionStorage, cleared on tab close' },
            { a: 'Realtime cleanup',          b: 'All Supabase realtime channels removed on logout (no ghost subscriptions)' },
          ]}
        />
      </RefSection>

      <RefSection icon={ShieldCheck} title="Approval step-up (password + TOTP re-verification)">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Toggle',                  b: 'Settings → Security → "Require password + 2FA re-verification to approve or reject" (super_admin only, off by default)' },
            { a: 'When ON',                 b: 'Approving/rejecting a payment batch or expense prompts for a fresh password + 6-digit authenticator code immediately before the action goes through' },
            { a: 'When OFF',                b: 'Approvals work exactly as before — no extra prompt' },
            { a: 'Requirement',             b: 'Every approver (super_admin/admin/operations) must have TOTP enrolled in Profile → Security before this is turned on, or they cannot approve anything' },
            { a: 'Lockout',                 b: '3 failed step-up attempts in 60 minutes locks that user out of stepping up for 1 hour; super_admins are notified' },
            { a: 'Token lifetime',          b: '5 minutes, single-use, bound to the specific batch/expense and action' },
          ]}
        />
      </RefSection>

      <RefSection icon={Shield} title="Access control (role matrix)">
        <RefTable
          cols={['Module / Resource', 'super_admin', 'admin', 'finance', 'operations', 'field_staff']}
          rows={[
            { a: 'Dashboard',           b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
            { a: 'Expenses',            b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
            { a: 'Payroll / Payslips',  b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Budgets',             b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Fleet',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Contractors',         b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
            { a: 'Employees (HR)',       b: '✓', c: '✓', d: '—', e: '—', f: '—' },
            { a: 'Leave',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Performance Reviews', b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Training Records',    b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Benefits',            b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Onboarding',          b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Recruitment',         b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Attendance',          b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Disciplinary',        b: '✓', c: '✓', d: '—', e: '—', f: '—' },
            { a: 'Vendors',             b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Clients / CRM',       b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Invoices',            b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
            { a: 'Assets',              b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
            { a: 'Projects',            b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Tasks',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Goals',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Documents (read)',     b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
            { a: 'Documents (upload)',   b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
            { a: 'Audit Log',           b: '✓', c: '✓', d: '—', e: '—', f: '—' },
            { a: 'Settings',            b: '✓', c: '—', d: '—', e: '—', f: '—' },
            { a: 'Platform Guide (this page)', b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
          ]}
        />
        <p className="text-[11px] text-muted-foreground mt-2">✓ = can access · — = blocked at route and database level. Role changes take effect on the employee's next page load.</p>
      </RefSection>

      <RefSection icon={Shield} title="Fine-grained write permissions">
        <RefTable
          cols={['Resource', 'Who can write']}
          rows={[
            { a: 'Audit log write',          b: 'INSERT only — performed_by must equal your own user_id' },
            { a: 'Documents bucket write',   b: 'admin / finance / operations / super_admin' },
            { a: 'Expense approval',         b: 'admin / finance (single items) · admin / finance (bulk)' },
            { a: 'Approval comments',        b: 'admin / finance / operations only' },
            { a: 'Employee deductions',      b: 'Self only OR admin / finance' },
            { a: 'Tasks visibility',         b: 'Assignee + creator + admin / operations' },
            { a: 'Invoices write',           b: 'super_admin / admin / finance only (RLS)' },
            { a: 'Assets write',             b: 'super_admin / admin / finance only (RLS)' },
            { a: 'Disciplinary write',       b: 'super_admin / admin only (RLS)' },
            { a: 'Disciplinary responses',   b: 'super_admin / admin only (RLS)' },
            { a: 'Company settings read',    b: 'super_admin / admin / finance only — no longer readable by all authenticated users' },
            { a: 'Fuel request management',  b: 'super_admin / admin / finance (RLS policy "Staff can manage fuel requests")' },
            { a: 'Document folders create',  b: 'super_admin / admin / finance / operations (RLS)' },
            { a: 'Document folders update',  b: 'super_admin / admin OR folder creator (RLS)' },
            { a: 'Document folders delete',  b: 'super_admin / admin only (RLS)' },
          ]}
        />
      </RefSection>

      <RefSection icon={Lock} title="Database-level security hardening">
        <RefTable
          cols={['Control', 'Detail']}
          rows={[
            { a: 'Role self-elevation blocked',   b: 'BEFORE UPDATE trigger on profiles — prevents any user from changing their own role or status unless super_admin' },
            { a: 'transactions_view',             b: 'security_invoker = true — view runs with the caller\'s RLS context, not the definer\'s' },
            { a: 'Notification insert policy',    b: 'Users can only insert notifications for themselves; admin/finance can notify any user' },
            { a: 'Batch-worker auth (user)',      b: 'JWT must belong to admin / finance / super_admin — checked in edge function' },
            { a: 'Batch-worker auth (cron)',      b: 'X-Cron-Secret header matched against Vault secret cron_shared_secret' },
            { a: 'audit_logs indexes',            b: 'created_at DESC · performed_by · action_type — fast dashboard and audit page loads' },
            { a: 'notifications indexes',         b: '(user_id, created_at DESC) · (user_id) WHERE read=false — unread-count probe is O(1)' },
            { a: 'batch_items indexes',           b: '(batch_id, status) · (paystack_reference) WHERE NOT NULL — worker pull + webhook lookup' },
          ]}
        />
      </RefSection>

      <RefSection icon={Globe} title="Network & API security">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Content Security Policy',   b: 'Active in index.html — restricts scripts, connects, iframes to known origins' },
            { a: 'Edge function CORS',        b: 'Locked to ops.kdsquares.com + localhost ports (no wildcard *)' },
            { a: 'Paystack webhook auth',     b: 'HMAC-SHA512 signature verified on every webhook delivery' },
            { a: 'Error reporting',           b: 'window.onerror + ErrorBoundary forward to window.Sentry if configured' },
          ]}
        />
      </RefSection>
    </>
  );
}
