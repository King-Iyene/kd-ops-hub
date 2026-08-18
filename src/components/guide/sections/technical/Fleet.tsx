import { RefTable, RefSection } from '@/components/guide/shared';
import { Car, Zap, BarChart2, Fuel, CheckCircle2, Shield } from 'lucide-react';

export function TechFleetSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Fleet Technical Reference</h2>
      <RefSection icon={Car} title="Fuel requests">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Maximum single fuel request', b: '₦5,000,000 (DB CHECK constraint + UI validation)' },
            { a: 'Minimum fuel amount',         b: '₦1 — zero-amount requests are rejected' },
            { a: 'File size cap',               b: '10 MB per receipt / document' },
            { a: 'Approval required',           b: 'admin / finance / super_admin (RLS enforced)' },
            { a: 'Approved → linked expense',   b: 'Approving a fuel request auto-creates a paired expense row' },
            { a: 'Status preconditions',        b: 'Approve requires status=pending; Mark Sent requires approved; Mark Complete requires sent' },
            { a: 'Paystack fee column',         b: 'Shown per request; resolved from paystack_fee_ngn → raw JSON → tier estimate' },
            { a: 'Soft delete',                 b: 'Deleting sets deleted_at — record preserved in DB' },
            { a: 'Query limit',                 b: '100 fuel requests fetched per load' },
            { a: 'Trip logs',                   b: 'Hard deleted (no financial value requiring preservation)' },
          ]}
        />
      </RefSection>

      <RefSection icon={Zap} title="Fleet operational thresholds">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Fuel request query limit',    b: '100 rows (most recent first)' },
            { a: 'Trip log query limit',        b: '100 rows (most recent first)' },
            { a: 'Trip date validation',        b: 'Future dates rejected on submission' },
            { a: 'Odometer validation',         b: 'End reading must be ≥ start reading' },
            { a: 'Payment type toggle',         b: 'Naming-only — bank fields always visible regardless of toggle' },
            { a: 'Reimbursement vs company',    b: 'Toggle on fuel & repair forms; stored on expense row (is_reimbursement)' },
          ]}
        />
      </RefSection>

      <RefSection icon={BarChart2} title="Fleet Insights Panel">
        <RefTable
          cols={['Feature', 'Detail']}
          rows={[
            { a: 'Vehicle health score',     b: 'Composite 0–100% per vehicle: fuel efficiency (20%) + maintenance compliance (30%) + document/compliance (30%) + inspection results (20%)' },
            { a: 'Smart insights engine',    b: 'Auto-generates alerts: overdue maintenance, budget overruns, anomaly rates > 15%, unresolved defects, low fuel efficiency, WoW spend trends' },
            { a: 'Health breakdown',         b: 'Per-vehicle progress bars with colour coding (green > 80%, amber 50–80%, red < 50%), issue tags, trend indicators' },
            { a: 'Quick actions',            b: 'Jump buttons: run inspection, schedule maintenance, review anomalies, check compliance' },
            { a: 'Data range',               b: '30-day rolling window for all calculations' },
          ]}
        />
      </RefSection>

      <RefSection icon={Fuel} title="Fuel Cost Optimizer">
        <RefTable
          cols={['Feature', 'Detail']}
          rows={[
            { a: 'Cost-per-km ranking',      b: 'All vehicles ranked by fuel spend ÷ km driven over 30 days. Top 8 displayed.' },
            { a: 'Efficiency rating',        b: 'Vehicles at or below fleet average cost/km = "Efficient" (green). Above average = "High" (red).' },
            { a: 'Best station highlight',   b: 'Fuel station with lowest average price per litre across all requests' },
            { a: 'Savings opportunity',      b: 'Monthly savings estimate by bringing worst-half performers down to fleet average cost/km' },
            { a: 'Fleet avg cost/km',        b: 'Computed as mean of all vehicles with both spend and distance data' },
            { a: 'Station anomaly rate',     b: 'Per station: percentage of fuel requests flagged as anomalies' },
          ]}
        />
      </RefSection>

      <RefSection icon={CheckCircle2} title="Inspection defect resolution">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Resolution actions',       b: 'repaired · replaced · adjusted · cleaned · calibrated · temporary_fix · deferred · not_required' },
            { a: 'Repair cost',              b: 'Optional ₦ amount recorded per resolution' },
            { a: 'Notes',                    b: 'Free-text resolution notes (optional)' },
            { a: 'Visual indicator',         b: 'Resolved defects show green "Resolved" badge with action taken' },
            { a: 'Access',                   b: 'All authenticated users can resolve defects (not restricted to admin)' },
            { a: 'Resolve button placement', b: 'Green button on each defect card + in defect detail view' },
          ]}
        />
      </RefSection>

      <RefSection icon={Shield} title="Fleet access control">
        <RefTable
          cols={['Tab / feature', 'Who can access']}
          rows={[
            { a: 'Fuel Requests tab',           b: 'All authenticated users (submit own; admin/finance approve)' },
            { a: 'Trip Logs tab',               b: 'All authenticated users' },
            { a: 'Activity tab',                b: 'admin · finance · super_admin only (hidden from other roles)' },
            { a: 'fleet.view_activity perm',    b: 'Tracked in PermissionsEditor — default on for admin + finance' },
            { a: 'Approve / send / complete',   b: 'admin · finance · super_admin only (RLS: current_user_role() IN (…))' },
          ]}
        />
      </RefSection>
    </>
  );
}
