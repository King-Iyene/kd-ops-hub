import { Loader2, Shield, FileText, Building2, Home, HeartPulse, PiggyBank } from 'lucide-react';
import type { EmployeeData, EditSection } from './types';
import { MaskedNin } from '@/components/ui-kit/MaskedNin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

const STATUTORY_ROWS = [
  {
    key: 'paye' as const,
    label: 'PAYE Tax',
    rate: 'NTA 2025 progressive bands (0–25%)',
    numberField: 'tax_id',
    flagField: 'paye_enabled',
    defaultFlag: false,
    placeholder: 'Tax ID / TIN — e.g. 12345678-0001',
    icon: FileText,
    color: 'text-blue-500 dark:text-blue-400',
    bg: 'bg-blue-500/10 dark:bg-blue-500/15',
  },
  {
    key: 'pension' as const,
    label: 'Pension (RSA)',
    rate: '8% employee · 10% employer',
    numberField: 'pension_pin',
    flagField: 'pension_enabled',
    defaultFlag: false,
    placeholder: 'RSA PIN — e.g. PEN100000000000',
    icon: PiggyBank,
    color: 'text-emerald-500 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
  },
  {
    key: 'nhf' as const,
    label: 'NHF (Housing Fund)',
    rate: '2.5% of basic',
    numberField: 'nhf_number',
    flagField: 'nhf_enabled',
    defaultFlag: false,
    placeholder: 'NHF contribution number',
    icon: Home,
    color: 'text-amber-500 dark:text-amber-400',
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
  },
  {
    key: 'nhis' as const,
    label: 'NHIS / HMO',
    rate: 'Mandatory for orgs 10+',
    numberField: 'nhis_number',
    flagField: 'nhis_enabled',
    defaultFlag: false,
    placeholder: 'NHIS enrollment number',
    icon: HeartPulse,
    color: 'text-rose-500 dark:text-rose-400',
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
  },
] as const;

export default function StatutoryTab({
  employee, form, patch, editingSection, sectionSaving,
  startEdit, cancelEdit, saveSection, canManage,
}: Props) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div className="pt-0.5">
          <p className="font-medium text-foreground">Nigerian statutory identity & benefits</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required for PAYE filing, pension remittance, NHF, and NHIS. Only admins see or edit this data.
          </p>
        </div>
      </div>

      {/* ── Identity numbers ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <CardTitle className="text-base">Identity Numbers</CardTitle>
          </div>
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
                <dd className="font-mono">{employee.tin || <span className="text-muted-foreground italic text-xs">Not set</span>}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* ── Statutory benefits ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <CardTitle className="text-base">Statutory Benefits</CardTitle>
          </div>
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
                  pension_enabled: form.pension_enabled ?? false,
                  nhf_number: form.nhf_number || null,
                  nhf_enabled: form.nhf_enabled ?? false,
                  nhis_number: form.nhis_number || null,
                  nhis_enabled: form.nhis_enabled ?? false,
                  paye_enabled: form.paye_enabled ?? false,
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
        <CardContent className="space-y-0">
          {STATUTORY_ROWS.map((row, i) => {
            const isOn = editingSection === 'statutory'
              ? ((form as any)[row.flagField] ?? row.defaultFlag)
              : ((employee as any)[row.flagField] ?? row.defaultFlag);
            const num = editingSection === 'statutory'
              ? ((form as any)[row.numberField] || '')
              : ((employee as any)[row.numberField] || '');
            const Icon = row.icon;

            return (
              <div
                key={row.key}
                className={cn(
                  'flex items-start gap-3 py-4',
                  i > 0 && 'border-t border-border/50',
                )}
              >
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl shrink-0 mt-0.5', row.bg)}>
                  <Icon className={cn('h-4 w-4', row.color)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.rate}</p>
                    </div>
                    {editingSection === 'statutory' ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('text-xs', isOn ? 'text-success' : 'text-muted-foreground')}>
                          {isOn ? 'On' : 'Off'}
                        </span>
                        <Switch
                          checked={isOn}
                          onCheckedChange={(v) => patch({ [row.flagField]: v } as any)}
                        />
                      </div>
                    ) : (
                      <div className={cn(
                        'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0',
                        isOn
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isOn ? 'bg-success' : 'bg-muted-foreground/50',
                        )} />
                        {isOn ? 'Active' : 'Inactive'}
                      </div>
                    )}
                  </div>

                  {editingSection === 'statutory' ? (
                    <div className="mt-2">
                      <Label htmlFor={`statutory-ref-${row.key}`} className="text-xs text-muted-foreground">
                        Reference number
                      </Label>
                      <Input
                        id={`statutory-ref-${row.key}`}
                        value={num}
                        onChange={(e) => patch({ [row.numberField]: e.target.value } as any)}
                        placeholder={row.placeholder}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                  ) : (
                    <p className={cn(
                      'text-xs mt-1',
                      num ? 'font-mono text-muted-foreground' : 'text-muted-foreground/60 italic',
                    )}>
                      {num || 'No reference number'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── AVC — Additional Voluntary Contribution ── */}
          <div className="flex items-start gap-3 py-4 border-t border-border/50">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 dark:bg-violet-500/15 shrink-0 mt-0.5">
              <PiggyBank className="h-4 w-4 text-violet-500 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">AVC (Voluntary Pension)</p>
                  <p className="text-xs text-muted-foreground">PRA 2014 s.4.3 — deducted pre-tax on pension base</p>
                </div>
              </div>
              {editingSection === 'statutory' ? (
                <div className="flex items-end gap-3 mt-2">
                  <div className="space-y-1 w-28">
                    <Label htmlFor="voluntary_pension_pct" className="text-xs text-muted-foreground">Rate (%)</Label>
                    <Input
                      id="voluntary_pension_pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={form.voluntary_pension_pct ?? 0}
                      onChange={(e) => patch({ voluntary_pension_pct: Number(e.target.value) || 0 })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground pb-2">of pension base, in addition to mandatory 8%</p>
                </div>
              ) : (
                <p className={cn(
                  'text-xs mt-1',
                  (employee.voluntary_pension_pct ?? 0) > 0
                    ? 'font-mono text-muted-foreground'
                    : 'text-muted-foreground/60 italic',
                )}>
                  {(employee.voluntary_pension_pct ?? 0) > 0
                    ? `${employee.voluntary_pension_pct}%`
                    : 'Not set (0%)'}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
