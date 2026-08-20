import { Loader2, Shield } from 'lucide-react';
import type { EmployeeData, EditSection } from './types';
import { MaskedNin } from '@/components/ui-kit/MaskedNin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  employee: EmployeeData;
  form: Partial<EmployeeData>;
  patch: (p: Partial<EmployeeData>) => void;
  editingSection: EditSection | null;
  sectionSaving: boolean;
  startEdit: (s: EditSection) => void;
  cancelEdit: () => void;
  saveSection: (label: string, fields: Record<string, any>) => void;
  canManage: boolean;
}

export default function StatutoryTab({
  employee, form, patch, editingSection, sectionSaving,
  startEdit, cancelEdit, saveSection, canManage,
}: Props) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-sm text-indigo-900 flex items-start gap-2">
        <Shield className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">Nigerian statutory identity & benefits</p>
          <p className="text-xs text-indigo-800/80">
            These numbers are required for PAYE filing, pension remittance, NHF, and NHIS.
            Only admins see or edit this data. Toggle deduction flags per employee.
          </p>
        </div>
      </div>

      {/* Identity numbers */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Identity Numbers</CardTitle>
          {canManage && editingSection !== 'identity' && (
            <Button size="sm" variant="outline" onClick={() => startEdit('identity')}>Edit</Button>
          )}
          {editingSection === 'identity' && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => saveSection('Identity numbers', {
                  nin: form.nin || null,
                  tin: form.tin || null,
                })}
                disabled={sectionSaving}
              >
                {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editingSection === 'identity' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nin" className="text-xs">NIN (National ID) — 11 digits</Label>
                <Input
                  id="nin"
                  value={form.nin || ''}
                  onChange={(e) => patch({ nin: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  placeholder="e.g. 12345678901"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tin" className="text-xs">TIN (Tax ID)</Label>
                <Input
                  id="tin"
                  value={form.tin || ''}
                  onChange={(e) => patch({ tin: e.target.value })}
                  placeholder="FIRS Tax Identification Number"
                />
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">NIN</dt>
                <dd>
                  <MaskedNin
                    profileId={employee.id}
                    last4={employee.nin_last4}
                    canReveal={canManage}
                    className="text-sm"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">TIN</dt>
                <dd className="font-mono">{employee.tin || <span className="text-muted-foreground">Not set</span>}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Statutory benefits with toggles */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Statutory Benefits</CardTitle>
          {canManage && editingSection !== 'statutory' && (
            <Button size="sm" variant="outline" onClick={() => startEdit('statutory')}>Edit</Button>
          )}
          {editingSection === 'statutory' && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => saveSection('Statutory benefits', {
                  pension_pin: form.pension_pin || null,
                  pension_enabled: form.pension_enabled ?? true,
                  nhf_number: form.nhf_number || null,
                  nhf_enabled: form.nhf_enabled ?? false,
                  nhis_number: form.nhis_number || null,
                  nhis_enabled: form.nhis_enabled ?? false,
                  paye_enabled: form.paye_enabled ?? true,
                  tax_id: form.tax_id || null,
                  voluntary_pension_pct: Math.max(0, form.voluntary_pension_pct ?? 0),
                })}
                disabled={sectionSaving}
              >
                {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {([
            {
              key: 'paye' as const,
              label: 'PAYE Tax',
              rate: 'FIRS progressive bands (7–24%)',
              numberField: 'tax_id',
              flagField: 'paye_enabled',
              defaultFlag: true,
              placeholder: 'Tax ID / TIN — e.g. 12345678-0001',
            },
            {
              key: 'pension' as const,
              label: 'Pension (RSA)',
              rate: '8% employee · 10% employer',
              numberField: 'pension_pin',
              flagField: 'pension_enabled',
              defaultFlag: true,
              placeholder: 'RSA PIN — e.g. PEN100000000000',
            },
            {
              key: 'nhf' as const,
              label: 'NHF (Housing Fund)',
              rate: '2.5% of basic',
              numberField: 'nhf_number',
              flagField: 'nhf_enabled',
              defaultFlag: false,
              placeholder: 'NHF contribution number',
            },
            {
              key: 'nhis' as const,
              label: 'NHIS / HMO',
              rate: 'Mandatory for orgs 10+',
              numberField: 'nhis_number',
              flagField: 'nhis_enabled',
              defaultFlag: false,
              placeholder: 'NHIS enrollment number',
            },
          ]).map((row) => {
            const isOn = editingSection === 'statutory'
              ? ((form as any)[row.flagField] ?? row.defaultFlag)
              : ((employee as any)[row.flagField] ?? row.defaultFlag);
            const num = editingSection === 'statutory'
              ? ((form as any)[row.numberField] || '')
              : ((employee as any)[row.numberField] || '');
            return (
              <div key={row.key} className="flex flex-col gap-2 pb-4 border-b last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.rate}</p>
                  </div>
                  <Badge className={cn(
                    'text-xs',
                    isOn
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-100',
                  )}>
                    {isOn ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {editingSection === 'statutory' ? (
                  <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                    <div className="space-y-1">
                      <Label htmlFor={`statutory-ref-${row.key}`} className="text-xs">Reference number</Label>
                      <Input
                        id={`statutory-ref-${row.key}`}
                        value={num}
                        onChange={(e) => patch({ [row.numberField]: e.target.value } as any)}
                        placeholder={row.placeholder}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isOn ? 'default' : 'outline'}
                      onClick={() => patch({ [row.flagField]: !isOn } as any)}
                    >
                      {isOn ? 'Turn off' : 'Turn on'}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm font-mono text-muted-foreground">
                    {num || <span className="italic">No number on file</span>}
                  </p>
                )}
              </div>
            );
          })}

          {/* AVC — Additional Voluntary Contribution (PRA 2014 s.4.3) */}
          <div className="flex flex-col gap-2 pt-4 border-t">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">AVC (Voluntary Pension)</p>
                <p className="text-xs text-muted-foreground">PRA 2014 s.4.3 — deducted pre-tax on pension base</p>
              </div>
            </div>
            {editingSection === 'statutory' ? (
              <div className="flex items-end gap-3">
                <div className="space-y-1 w-32">
                  <Label htmlFor="voluntary_pension_pct" className="text-xs">Rate (%)</Label>
                  <Input
                    id="voluntary_pension_pct"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.voluntary_pension_pct ?? 0}
                    onChange={(e) => patch({ voluntary_pension_pct: Number(e.target.value) || 0 })}
                  />
                </div>
                <p className="text-xs text-muted-foreground pb-2">% of pension base, in addition to mandatory 8%</p>
              </div>
            ) : (
              <p className="text-sm font-mono text-muted-foreground">
                {(employee.voluntary_pension_pct ?? 0) > 0
                  ? `${employee.voluntary_pension_pct}%`
                  : <span className="italic">Not set (0%)</span>}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
