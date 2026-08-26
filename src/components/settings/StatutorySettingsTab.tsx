import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui-kit/InfoTip';
import {
  PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_RATE,
  NHF_RATE,
  NHIS_EMPLOYEE_RATE,
  NHIS_EMPLOYER_RATE,
  NSITF_RATE,
  ITF_RATE,
} from '@/lib/tax';

interface Props {
  settings: {
    pension_enabled: boolean;
    paye_enabled: boolean;
    nhf_enabled: boolean;
    nhis_enabled: boolean;
    nsitf_enabled: boolean;
    itf_enabled: boolean;
    development_levy_enabled: boolean;
    development_levy_annual_ngn: number;
    [key: string]: any;
  };
  patch: (p: Record<string, any>) => void;
}

const pct = (r: number) => `${(r * 100).toFixed(0)}%`;

const TOGGLES: {
  key: string;
  label: string;
  description: string;
  detail: string;
  defaultOn: boolean;
}[] = [
  {
    key: 'paye_enabled',
    label: 'PAYE (Income Tax)',
    description: 'Pay-As-You-Earn deducted under the Nigeria Tax Act 2025 graduated bands.',
    detail: 'Rates: 0% up to ₦800k, then 15%/18%/21%/23%/25%',
    defaultOn: true,
  },
  {
    key: 'pension_enabled',
    label: 'Pension (PenCom)',
    description: `Employee contributes ${pct(PENSION_EMPLOYEE_RATE)}, employer contributes ${pct(PENSION_EMPLOYER_RATE)} of basic + housing + transport.`,
    detail: 'Governed by the Pension Reform Act 2014',
    defaultOn: true,
  },
  {
    key: 'nhf_enabled',
    label: 'National Housing Fund (NHF)',
    description: `${pct(NHF_RATE)} of basic salary deducted from employee.`,
    detail: 'National Housing Fund Act — mandatory for employers with 5+ staff',
    defaultOn: false,
  },
  {
    key: 'nhis_enabled',
    label: 'National Health Insurance (NHIS)',
    description: `Employee ${pct(NHIS_EMPLOYEE_RATE)} + employer ${pct(NHIS_EMPLOYER_RATE)} of gross salary.`,
    detail: 'National Health Insurance Authority Act 2022',
    defaultOn: false,
  },
  {
    key: 'nsitf_enabled',
    label: 'NSITF (Employees Compensation)',
    description: `Employer-only contribution of ${pct(NSITF_RATE)} of gross payroll.`,
    detail: "Employee Compensation Act 2010 — employer's obligation",
    defaultOn: true,
  },
  {
    key: 'itf_enabled',
    label: 'ITF (Industrial Training Fund)',
    description: `Employer-only contribution of ${pct(ITF_RATE)} of annual payroll.`,
    detail: 'ITF Act — mandatory for employers with 5+ staff or ₦50m+ turnover',
    defaultOn: true,
  },
  {
    key: 'development_levy_enabled',
    label: 'Development Levy',
    description: 'Flat annual levy per employee as prescribed by state law.',
    detail: 'Amount varies by state; typically ₦100–₦500 per employee per annum',
    defaultOn: false,
  },
];

export default function StatutorySettingsTab({ settings, patch }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Statutory deduction master switches
            <InfoTip>
              These are company-wide controls. When a deduction is turned OFF here,
              it will not be applied to any employee — even if enabled on their individual
              profile. When turned ON, each employee's own statutory profile still controls
              whether they personally participate.
            </InfoTip>
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Enable or disable statutory deductions for payroll processing.
            Per-employee overrides remain on each employee's Statutory tab.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {TOGGLES.map((t) => {
            const checked = settings[t.key] ?? t.defaultOn;
            return (
              <div
                key={t.key}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor={t.key} className="text-sm font-medium leading-none cursor-pointer">
                    {t.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                  <p className="text-[10px] text-muted-foreground/70">{t.detail}</p>
                </div>
                <Switch
                  id={t.key}
                  checked={checked}
                  onCheckedChange={(v) => patch({ [t.key]: v })}
                />
              </div>
            );
          })}

          {settings.development_levy_enabled && (
            <div className="rounded-lg border p-3 ml-4 space-y-1">
              <Label htmlFor="development_levy_annual_ngn" className="text-sm font-medium">
                Annual levy per employee (₦)
              </Label>
              <Input
                id="development_levy_annual_ngn"
                type="number"
                min={0}
                step={100}
                className="max-w-[200px]"
                value={settings.development_levy_annual_ngn ?? 0}
                onChange={(e) =>
                  patch({ development_levy_annual_ngn: Math.max(0, Number(e.target.value) || 0) })
                }
                placeholder="e.g. 100"
              />
              <p className="text-[10px] text-muted-foreground">
                Flat amount charged per employee per year, spread evenly across monthly payroll runs.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
