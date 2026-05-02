// Privacy policy — public route at /legal/privacy.
//
// Static content, NDPR (Nigeria Data Protection Regulation) aligned. Edit in
// place; revisions should bump POLICY_VERSION below so consent_log stays
// truthful. The page is brand-aware and works in both light + dark mode.

import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export const POLICY_VERSION = '2026-05-02';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Version {POLICY_VERSION} · Aligned with the Nigeria Data Protection Regulation (NDPR) 2019 and the Nigeria Data Protection Act 2023.
          </p>
        </header>

        <section className="prose prose-sm max-w-none dark:prose-invert space-y-4 leading-relaxed">
          <h2 className="text-lg font-semibold">1. Who we are</h2>
          <p>
            KD Squares Ltd ("KD Squares", "we", "us") operates the KD Ops platform. We act as a data
            controller for personal data of our employees, contractors, and clients, and as a data processor
            for any data uploaded by our customer organisations using KD Ops as a service. Our registered
            office is in Lagos, Nigeria.
          </p>

          <h2 className="text-lg font-semibold">2. What data we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Identity:</strong> name, email, phone, role, profile photo.</li>
            <li><strong>Financial:</strong> bank account number (encrypted at rest with AES-256 via pgcrypto), bank code, payment history.</li>
            <li><strong>HR/statutory:</strong> NIN, BVN, TIN, NHF, NHIS, pension PFA details where you provide them.</li>
            <li><strong>Usage:</strong> sign-in timestamps, IP-hashes (never raw IPs), device user-agents, audit logs of actions you take.</li>
            <li><strong>Communications:</strong> emails, SMS, WhatsApp messages we send you and metadata about delivery.</li>
          </ul>

          <h2 className="text-lg font-semibold">3. How we use it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Run the platform: paying salaries, processing expenses, tracking compliance.</li>
            <li>Comply with Nigerian law: PAYE filings, pension remittance, NSITF, ITF, audit trails for FIRS and LIRS.</li>
            <li>Secure your account: anomaly detection, MFA, session management.</li>
            <li>Send transactional notifications about your data (approvals, payments, salary).</li>
          </ul>

          <h2 className="text-lg font-semibold">4. Who we share it with</h2>
          <p>
            We share the minimum data necessary with: <strong>Paystack</strong> (payment processor),
            <strong> Resend</strong> (transactional email), <strong>Termii</strong> (SMS/WhatsApp delivery),
            <strong> Supabase</strong> (database + auth hosting). We never sell your data, and we never share
            it with marketing partners.
          </p>

          <h2 className="text-lg font-semibold">5. Where it lives</h2>
          <p>
            Your data is hosted on Supabase infrastructure with primary regions in the EU (Frankfurt) /
            United States, with daily encrypted backups. We use Vercel for the web frontend (global
            edge). We notify you if we add a processor in a new jurisdiction.
          </p>

          <h2 className="text-lg font-semibold">6. How long we keep it</h2>
          <p>
            Operational data is kept while your account is active. Audit logs are retained per the
            <code> audit_log_retention_days </code> setting (default 365 days, configurable). After
            account deletion we anonymise instead of hard-deleting so the audit trail stays intact —
            your name, email, phone are scrubbed but the payment / statutory records remain in
            aggregated form for the period required by Nigerian tax law (typically 6 years).
          </p>

          <h2 className="text-lg font-semibold">7. Your rights</h2>
          <p>You can exercise these rights from <Link to="/profile" className="text-primary underline">Profile → Privacy</Link>:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access</strong> — download a JSON bundle of everything we hold about you.</li>
            <li><strong>Rectification</strong> — edit your profile, or request a correction.</li>
            <li><strong>Erasure</strong> — request anonymisation. Statutory records may be retained for the period Nigerian law requires.</li>
            <li><strong>Portability</strong> — your access export is JSON; you can take it elsewhere.</li>
            <li><strong>Restriction</strong> — pause processing while a dispute is resolved.</li>
            <li><strong>Withdraw consent</strong> — for any non-statutory processing.</li>
          </ul>

          <h2 className="text-lg font-semibold">8. Security</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Bank account numbers encrypted at rest (AES-256, pgcrypto).</li>
            <li>Optional Two-factor authentication (TOTP) for any account.</li>
            <li>Audit logs are append-only at the database level — they cannot be edited or deleted by users.</li>
            <li>Webhook signatures (Paystack) verified with HMAC-SHA512.</li>
            <li>Strict Content Security Policy on the web app; HTTPS everywhere; HSTS enabled.</li>
            <li>Idle session timeout configurable; defaults to 60 minutes.</li>
          </ul>

          <h2 className="text-lg font-semibold">9. Contact us</h2>
          <p>
            For privacy questions or to exercise any right: <a href="mailto:privacy@kdsquares.com" className="text-primary underline">privacy@kdsquares.com</a>.
            You may also lodge a complaint with the Nigeria Data Protection Commission (NDPC).
          </p>

          <h2 className="text-lg font-semibold">10. Changes</h2>
          <p>
            We re-record consent whenever this policy changes materially. The version on file at the
            time you signed in is recorded in <code>consent_log</code> and is available to you on request.
          </p>
        </section>

        <footer className="text-xs text-muted-foreground border-t pt-4">
          <Link to="/legal/terms" className="hover:text-foreground">Terms of Service →</Link>
        </footer>
      </div>
    </div>
  );
}
