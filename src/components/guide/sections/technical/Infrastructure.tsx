import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefTable, RefSection } from '@/components/guide/shared';
import { HardDrive, Zap, Activity } from 'lucide-react';

export function TechInfraSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Infrastructure & Capacity</h2>

      {/* ── BACKUP — most prominent section ── */}
      <Card className="border-2 border-primary/40 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-5 w-5 text-primary" />
            Database Backup — Daily Automated (Free)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            A GitHub Actions workflow (<code>.github/workflows/daily-backup.yml</code>) runs every night
            at <strong>02:00 WAT</strong> and creates a compressed SQL dump of the entire database.
            Backups are stored as GitHub Actions artifacts — <strong>completely free, no Pro plan needed</strong>.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="font-semibold text-primary">One-time setup (2 min)</p>
              <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                <li><strong>SUPABASE_ACCESS_TOKEN</strong> — already in GitHub secrets ✅</li>
                <li>Find your project ref: open Supabase → look at the URL:<br />
                  <code className="text-xs">supabase.com/dashboard/project/<strong>THIS_PART</strong></code></li>
                <li>GitHub repo → <strong>Settings → Secrets → Actions → New secret</strong></li>
                <li>Name: <strong><code>SUPABASE_PROJECT_REF</code></strong> · Value: paste the ref</li>
                <li>Done — backup runs tonight automatically ✅</li>
              </ol>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-primary">How to restore a backup</p>
              <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                <li>GitHub repo → <strong>Actions tab</strong></li>
                <li>Click <strong>"Daily Database Backup"</strong> on the left</li>
                <li>Open any past run → scroll to <strong>Artifacts</strong></li>
                <li>Download the zip → extract the <code>.sql.gz</code> file</li>
                <li>Run: <code>gunzip backup.sql.gz</code></li>
                <li>Then: <code>psql "$DB_URL" &lt; backup.sql</code></li>
              </ol>
            </div>
          </div>

          <RefTable
            cols={['What', 'Detail']}
            rows={[
              { a: 'Schedule',           b: '02:00 WAT every day (01:00 UTC). Can also be triggered manually from the Actions tab.' },
              { a: 'Retention',          b: '30 days of backups kept. Oldest are deleted automatically — no manual cleanup needed.' },
              { a: 'Storage used',       b: 'Typical small DB: 2–5 MB compressed per backup × 30 = 60–150 MB. GitHub Free plan gives 500 MB artifact storage.' },
              { a: 'When storage fills', b: 'The workflow logs a warning if a single backup exceeds 15 MB. Check usage at github.com/settings/billing → Storage. Fix: reduce retention_days in the workflow file from 30 to 14, or upgrade to GitHub Pro ($4/mo) for 2 GB.' },
              { a: 'What is backed up',  b: 'Full logical dump: all tables, data, and indexes. Does NOT include Supabase Edge Function secrets (those live in Supabase Vault — record them separately in a password manager).' },
              { a: 'Manual trigger',     b: 'GitHub → Actions → "Daily Database Backup" → "Run workflow" button. Use this before any major migration or data change.' },
              { a: 'Verify it is running', b: 'After setup, go to GitHub → Actions tab → "Daily Database Backup" — green checkmarks = working. A red X means SUPABASE_PROJECT_REF secret is wrong or missing.' },
            ]}
          />
        </CardContent>
      </Card>

      <RefSection icon={HardDrive} title="Supabase capacity (free tier)">
        <RefTable
          cols={['Resource', 'Limit / guidance']}
          rows={[
            { a: 'Database storage',       b: '500 MB — watch this first as data grows' },
            { a: 'File storage',            b: '1 GB' },
            { a: 'Bandwidth',               b: '5 GB / month' },
            { a: 'Edge Function invocations', b: '500,000 / month' },
            { a: 'Realtime concurrent peers', b: '200' },
            { a: 'Auth users (MAU)',         b: '50,000' },
            { a: 'Upgrade trigger',          b: 'Pro tier ($25/mo) lifts all limits 50–100×. Storage fills first at scale.' },
          ]}
        />
      </RefSection>

      <RefSection icon={Zap} title="Query limits by page">
        <RefTable
          cols={['Page / query', 'Limit']}
          rows={[
            { a: 'Approvals — each table (batches, expenses, fuel, budgets, leave)', b: '200 rows' },
            { a: 'Approvals — profiles',           b: '500 rows' },
            { a: 'Dashboard — approved expenses',  b: '2,000 rows' },
            { a: 'Dashboard — processed batches',  b: '500 rows' },
            { a: 'Budgets — budget rows',          b: '200 rows' },
            { a: 'Budgets — spend-calc expenses',  b: '2,000 rows' },
            { a: 'Budgets — spend-calc batches',   b: '500 rows' },
            { a: 'Leave — my requests',            b: '100 rows' },
            { a: 'Leave — team requests',          b: '200 rows' },
            { a: 'Fleet — fuel requests',          b: '100 rows' },
            { a: 'Fleet — trip logs',              b: '100 rows' },
          ]}
        />
      </RefSection>

      <RefSection icon={Activity} title="Permanent code guardrails">
        <RefTable
          cols={['Rule', 'What it prevents']}
          rows={[
            { a: 'Linter blocks "used too early" code', b: 'Stops a function from being called before the line that defines it. This was the cause of the old Payments page crash, so the rule is now an error and CI will fail if anyone reintroduces it.' },
            { a: 'Strict list of audit actions',         b: 'Every audit log action name (e.g. expense_approved, contractor_deactivated) must be in a fixed list. Typos that would silently break the audit log are caught at build time.' },
            { a: 'Production build tool',                b: 'We use Vite 8 (Rolldown). Its stricter optimisation makes the older crash-causing patterns surface immediately, not in production.' },
          ]}
        />
      </RefSection>
    </>
  );
}
