import { Users2 } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function CrmOutreachSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={Users2}
        title="CRM & Outreach"
        blurb="Manage your external relationships — clients who pay you, contacts you work with, vendors you pay, placement contracts, referral tracking, and shareable public links for recruiting and onboarding."
      />

      <ModuleCard title="Clients" route="/clients" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Track the companies and individuals that pay your organisation. Each client record holds contact details,
          contract value, industry, and status. Clients are linked to invoices, placements, and projects so you can
          see revenue concentration at a glance.
        </p>
        <StepList steps={[
          'Open Clients from the sidebar and click Add Client.',
          'Fill in the client name, industry, contact person, email, phone, and optional contract value.',
          'Save — the client appears in the directory and is available as a selection in Invoices and Placements.',
        ]} />
        <p className="text-sm text-muted-foreground leading-relaxed">
          To soft-delete a client, click the trash icon on its row. Deleted clients are hidden from lists but their
          historical data (invoices, placements) is preserved. Only managers (admin, finance, operations, super admin)
          can create or delete clients.
        </p>
      </ModuleCard>

      <ModuleCard title="Contacts" route="/contacts" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A general-purpose address book for people who aren&apos;t employees or contractors — referral partners,
          government contacts, agency liaisons, or anyone else the business needs to keep track of.
        </p>
        <StepList steps={[
          'Go to Contacts and click Add Contact.',
          'Enter the person\'s name, email, phone, company, and any notes.',
          'Use the search bar and filters to find contacts quickly as the list grows.',
        ]} />
        <Callout tone="tip">
          Contacts are separate from the Employees and Contractors directories. If someone becomes an employee later,
          you create an employee record for them — the contact record stays as a historical reference.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Vendors" route="/vendors" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Track companies and individuals you pay for goods and services — suppliers, service providers, and
          recurring vendors. Vendor records can be linked to expenses and payment batches for cleaner reporting.
        </p>
        <StepList steps={[
          'Open Vendors and click Add Vendor.',
          'Enter the vendor name, category, contact details, and bank information.',
          'Once saved, the vendor is available as a recipient when creating payment batches or logging expenses.',
        ]} />
      </ModuleCard>

      <ModuleCard title="Placements" route="/placements" roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Manage contractor or employee placements at client sites. Each placement links an employee/contractor
          to a client with a rate (hourly, daily, weekly, or monthly), start/end dates, and billing details.
          The system can auto-generate payment entries based on placement rates and working periods.
        </p>
        <StepList steps={[
          'Go to Placements and click New Placement.',
          'Select the employee or contractor, the client, rate type and amount, and the placement period.',
          'Active placements appear in the list with their current billing status.',
          'When a billing cycle completes, use Generate Payments to create payment entries from placement rates.',
        ]} />
        <Callout tone="warn">
          Placements is a super-admin-only module. Rate type conversion (hourly/daily/weekly to monthly) uses
          actual working days in the period, not a flat 30-day assumption.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Public Links" route="/public-links" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Create shareable URLs that external people can use to submit applications, referrals, or other forms
          without needing a KDOps account. Each link is tied to a specific purpose and can be deactivated at any time.
        </p>
        <StepList steps={[
          'Open Public Links and click Create Link.',
          'Choose the link type (e.g., job application, referral form), configure any required fields, and generate.',
          'Copy the URL and share it via email, social media, or your website.',
          'Submissions arrive in the corresponding module (Recruitment, Referrals) for review.',
        ]} />
        <Callout tone="tip">
          Deactivating a link immediately stops accepting new submissions. Already-submitted data is preserved.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Referrals" route="/referrals" roles={['super_admin', 'admin', 'finance', 'operations', 'field_staff']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Track employee referrals for open positions. When an employee refers a candidate (via a public link or
          manually entered by an admin), the referral is logged with the referee, candidate details, and status.
          Useful for referral bonus programmes.
        </p>
        <StepList steps={[
          'Employees can submit referrals through the Referrals page or a shared public link.',
          'Admins review incoming referrals and update their status (pending, interviewed, hired, rejected).',
          'Filter by status, date, or referring employee to track referral pipeline health.',
        ]} />
      </ModuleCard>

      <ModuleCard title="Communications" route="/communications" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Send email, SMS (via Termii), and WhatsApp messages to employees, contractors, or custom recipient
          lists. Supports scheduled sends, templates, and delivery tracking. All outbound communications are
          logged in the audit trail.
        </p>
        <StepList steps={[
          'Go to Communications and click Compose.',
          'Choose the channel (Email, SMS, or WhatsApp), select recipients or a group, and write your message.',
          'Optionally schedule the message for a future date/time.',
          'Click Send (or Schedule) — delivery status updates in real time.',
        ]} />
        <Callout tone="warn">
          SMS and WhatsApp require a configured Termii integration. Email uses the platform&apos;s built-in
          send-email edge function. Raw HTML in emails is restricted to admin and finance roles.
        </Callout>
      </ModuleCard>
    </div>
  );
}
