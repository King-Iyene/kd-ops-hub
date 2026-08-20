// Terms of service — public route at /legal/terms.
//
// Plain-English starter content for KD Ops. Have a lawyer review before
// onboarding external customers; the structure here covers the
// non-controversial bits (eligibility, acceptable use, liability cap).

import { Link } from 'react-router-dom';
import { Scroll, ArrowLeft } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';

export const TERMS_VERSION = '2026-05-02';

export default function Terms() {
  usePageTitle('Terms of Service');
  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Scroll className="h-5 w-5" />
            <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
          </div>
          <p className="text-xs text-muted-foreground">Version {TERMS_VERSION}</p>
        </header>

        <section className="prose prose-sm max-w-none dark:prose-invert space-y-4 leading-relaxed">
          <h2 className="text-lg font-semibold">1. Eligibility</h2>
          <p>
            You must be at least 18 years old, have authority to act on behalf of your organisation, and
            agree to use KD Ops in compliance with Nigerian law and any other jurisdiction in which you
            operate.
          </p>

          <h2 className="text-lg font-semibold">2. Your account</h2>
          <p>
            You are responsible for the security of your account credentials. We strongly recommend
            enabling two-factor authentication. You agree to notify us promptly at
            <a href="mailto:security@kdsquares.com" className="text-primary underline mx-1">security@kdsquares.com</a>
            of any suspected unauthorised access.
          </p>

          <h2 className="text-lg font-semibold">3. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use KD Ops to launder funds, finance terrorism, or otherwise violate the Money Laundering (Prevention and Prohibition) Act.</li>
            <li>Attempt to bypass authentication, rate limits, audit logging, or access controls.</li>
            <li>Send spam or unsolicited bulk messages through the Communications module.</li>
            <li>Reverse-engineer, scrape, or resell access without our written consent.</li>
            <li>Upload content you don't have the legal right to process.</li>
          </ul>

          <h2 className="text-lg font-semibold">4. Money movement</h2>
          <p>
            Payment transfers are executed via Paystack. You authorise KD Ops to instruct Paystack on
            your behalf for transfers you initiate. Paystack's own terms apply to settlement timing and
            disputes. KD Ops is not a bank and does not hold funds.
          </p>

          <h2 className="text-lg font-semibold">5. Service availability</h2>
          <p>
            We aim for 99.9% monthly uptime but make no warranty. Scheduled maintenance is announced in
            advance where possible. We are not liable for downstream failures caused by Paystack,
            Supabase, Resend, Termii, or other infrastructure providers.
          </p>

          <h2 className="text-lg font-semibold">6. Fees</h2>
          <p>
            KD Ops is currently provided to KD Squares Ltd at no charge. Pricing for external customers
            will be communicated separately and will require a signed order form before becoming binding.
          </p>

          <h2 className="text-lg font-semibold">7. Intellectual property</h2>
          <p>
            KD Ops and all its components are owned by KD Squares Ltd. You retain ownership of your
            data; you grant us a limited licence to process it solely to deliver the service.
          </p>

          <h2 className="text-lg font-semibold">8. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, our aggregate liability for any claim arising out of
            your use of KD Ops is limited to the fees you paid in the 12 months preceding the claim, or
            ₦100,000 if no fees were paid.
          </p>

          <h2 className="text-lg font-semibold">9. Termination</h2>
          <p>
            Either party may terminate the service at any time. On termination, you have 30 days to
            export your data using the Privacy → Export tool. After 30 days we may anonymise your data
            in line with the <Link to="/legal/privacy" className="text-primary underline">Privacy Policy</Link>.
          </p>

          <h2 className="text-lg font-semibold">10. Governing law</h2>
          <p>
            These terms are governed by the laws of the Federal Republic of Nigeria. Disputes are subject
            to the exclusive jurisdiction of the courts of Lagos State.
          </p>
        </section>

        <footer className="text-xs text-muted-foreground border-t pt-4">
          <Link to="/legal/privacy" className="hover:text-foreground">← Privacy Policy</Link>
        </footer>
      </div>
    </div>
  );
}
