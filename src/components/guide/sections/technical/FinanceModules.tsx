import { RefTable, RefSection } from '@/components/guide/shared';
import { FilePlus2, Store, Package, Briefcase, CreditCard, ShieldCheck } from 'lucide-react';

export function TechFinanceSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Finance Modules</h2>
      <RefSection icon={FilePlus2} title="Invoices">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Default VAT rate',        b: '7.5% — Nigerian standard rate (configurable per invoice)' },
            { a: 'Status workflow',         b: 'draft → sent → paid · overdue · cancelled' },
            { a: 'Overdue detection',       b: 'Auto-detected — sent invoices with due_date &lt; today display as overdue' },
            { a: 'Line items',              b: 'Multiple line items per invoice; quantity × unit_price + VAT = total' },
            { a: 'Payment terms',           b: 'Stored as days (30/60/90/custom) — used to compute due_date from issue_date' },
            { a: 'Currency',                b: 'NGN only — multi-currency not supported in this version' },
            { a: 'Print layout',            b: 'Print-ready CSS — use browser Print to PDF' },
            { a: 'Soft delete',             b: 'Status="cancelled" preferred over deletion to keep audit trail' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance only' },
          ]}
        />
      </RefSection>

      <RefSection icon={Store} title="Vendors / Suppliers">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Categories',              b: 'utilities · software · services · supplies · logistics · professional · other' },
            { a: 'Status values',           b: 'active · inactive · blacklisted (last blocks new POs)' },
            { a: 'Required fields',         b: 'Name + category + status. All other fields optional.' },
            { a: 'Tax/CAC fields',          b: 'rc_number (CAC) · tin (FIRS) — both 8–14 chars typical' },
            { a: 'Bank details',            b: 'Stored for direct payment via Paystack transfer recipient flow' },
            { a: 'Contract expiry',         b: 'contract_end within 30 days surfaces as amber badge' },
            { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance / operations' },
          ]}
        />
      </RefSection>

      <RefSection icon={Package} title="Asset Register">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Asset categories',        b: 'plant_machinery · motor_vehicle · furniture · it_equipment · land_building · leasehold_improvement · other' },
            { a: 'Depreciation methods',    b: 'straight_line (default) · reducing_balance' },
            { a: 'Straight-line formula',   b: 'book_value = cost − ((cost − salvage) ÷ useful_life) × years_elapsed' },
            { a: 'CITA initial allowance',  b: 'Pre-filled per category (plant 50% · vehicle 50% · furniture 25% · IT 50% · land/building 10%)' },
            { a: 'CITA annual allowance',   b: 'Pre-filled per category (plant 25% · vehicle 25% · furniture 20% · IT 25% · land/building 10%)' },
            { a: 'Insurance expiry',        b: '30-day amber badge when insurance_expiry approaches' },
            { a: 'Disposal tracking',       b: 'status: active · disposed · written_off — disposed assets hidden from default view' },
            { a: 'Assignment',              b: 'Assets can be linked to an employee (assigned_to) and department' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance only' },
          ]}
        />
      </RefSection>

      <RefSection icon={Briefcase} title="Subscriptions">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Maximum amount',          b: '₦50,000,000 per subscription (DB CHECK)' },
            { a: 'Renewal cycles',          b: 'monthly · quarterly · annually · custom' },
            { a: 'Auto-renewal flag',       b: 'is_auto_renew controls whether system flags upcoming renewals' },
            { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
            { a: 'Categories',              b: 'Linked to global expense categories for budget tracking' },
          ]}
        />
      </RefSection>

      <RefSection icon={CreditCard} title="Virtual Cards">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Card lifecycle',          b: 'pending → active → suspended · expired · closed' },
            { a: 'Daily / monthly caps',    b: 'Stored on the card record; enforced by Paystack at swipe time' },
            { a: 'Linked employee',         b: 'Each card belongs to one employee (linked profile)' },
            { a: 'Soft delete',             b: 'Closed cards stay in DB for transaction history' },
          ]}
        />
      </RefSection>

      <RefSection icon={ShieldCheck} title="Compliance Filings">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Filing types',            b: 'paye · pension · nhf · nhis · vat · cit · firs_other (Nigerian statutory)' },
            { a: 'Due-date alerts',         b: '30-day amber badge on Dashboard for filings due soon' },
            { a: 'Status values',           b: 'pending · submitted · paid · overdue (auto-detected)' },
            { a: 'Document linking',        b: 'Each filing can be linked to a Documents record (receipt PDF)' },
            { a: 'RLS read access',         b: 'super_admin / admin / finance only' },
          ]}
        />
      </RefSection>
    </>
  );
}
