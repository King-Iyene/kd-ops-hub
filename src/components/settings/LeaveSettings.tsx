import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { InfoTip } from '@/components/ui-kit/InfoTip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

interface LeavePolicy {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_days: number;
  accrual_type: string;
  gender: string | null;
  paid: boolean;
  requires_medical_cert: boolean;
  min_tenure_months: number;
  carry_over_days: number;
  color: string | null;
  is_system: boolean;
  active: boolean;
}

interface CompanyLeaveSettings {
  leave_carryover_enabled: boolean;
  leave_carryover_max_days: number;
}

export default function LeaveSettings() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [edited, setEdited] = useState<Record<string, Partial<LeavePolicy>>>({});
  const [companySettings, setCompanySettings] = useState<CompanyLeaveSettings>({
    leave_carryover_enabled: false,
    leave_carryover_max_days: 5,
  });
  const [origCompany, setOrigCompany] = useState<CompanyLeaveSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [polRes, csRes] = await Promise.all([
      supabase.from('leave_policies').select('id, name, description, default_days, accrual_type, gender, paid, carry_over_days, color, active').order('code'),
      supabase.from('company_settings').select('leave_carryover_enabled, leave_carryover_max_days').eq('id', SINGLETON_ID).single(),
    ]);
    if (polRes.data) setPolicies(polRes.data as LeavePolicy[]);
    if (csRes.data) {
      const cs = {
        leave_carryover_enabled: csRes.data.leave_carryover_enabled ?? false,
        leave_carryover_max_days: csRes.data.leave_carryover_max_days ?? 5,
      };
      setCompanySettings(cs);
      setOrigCompany(cs);
    }
    setEdited({});
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function updateField(id: string, field: keyof LeavePolicy, value: unknown) {
    setEdited((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  function getPolicyValue<K extends keyof LeavePolicy>(policy: LeavePolicy, field: K): LeavePolicy[K] {
    const e = edited[policy.id];
    if (e && field in e) return e[field] as LeavePolicy[K];
    return policy[field];
  }

  const hasChanges = Object.keys(edited).length > 0
    || (origCompany && (
      companySettings.leave_carryover_enabled !== origCompany.leave_carryover_enabled
      || companySettings.leave_carryover_max_days !== origCompany.leave_carryover_max_days
    ));

  async function saveAll() {
    setSaving(true);
    let failed = false;

    // Save policy edits
    for (const [id, changes] of Object.entries(edited)) {
      if (Object.keys(changes).length === 0) continue;
      const { error } = await supabase.from('leave_policies').update(changes).eq('id', id);
      if (error) {
        toast({ title: 'Error saving policy', description: error.message, variant: 'destructive' });
        failed = true;
        break;
      }
    }

    // Save company settings
    if (!failed && origCompany && (
      companySettings.leave_carryover_enabled !== origCompany.leave_carryover_enabled
      || companySettings.leave_carryover_max_days !== origCompany.leave_carryover_max_days
    )) {
      const { error } = await supabase.from('company_settings').update({
        leave_carryover_enabled: companySettings.leave_carryover_enabled,
        leave_carryover_max_days: companySettings.leave_carryover_max_days,
      }).eq('id', SINGLETON_ID);
      if (error) {
        toast({ title: 'Error saving company settings', description: error.message, variant: 'destructive' });
        failed = true;
      }
    }

    if (!failed) {
      toast({ title: 'Leave settings saved' });
      await fetchData();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Leave Type Entitlements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Leave type entitlements</CardTitle>
          <Button size="sm" disabled={!hasChanges || saving} onClick={saveAll}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save changes
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Configure the default annual entitlement for each leave type. These apply to all employees unless overridden at the individual level.
          </p>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave type</TableHead>
                  <TableHead className="w-[100px] text-center">Days / yr</TableHead>
                  <TableHead className="w-[100px] text-center">Carry-over</TableHead>
                  <TableHead className="w-[90px] text-center">Paid</TableHead>
                  <TableHead className="w-[90px] text-center">Active</TableHead>
                  <TableHead>Accrual</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => {
                  const days = getPolicyValue(p, 'default_days');
                  const carry = getPolicyValue(p, 'carry_over_days');
                  const active = getPolicyValue(p, 'active');
                  const paid = getPolicyValue(p, 'paid');
                  return (
                    <TableRow key={p.id} className={!active ? 'opacity-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {p.color && (
                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          )}
                          <span className="font-medium">{p.name}</span>
                          {p.gender && (
                            <span className="text-[10px] text-muted-foreground uppercase">({p.gender})</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {p.accrual_type === 'unpaid' ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={365}
                            className="w-20 h-8 text-center mx-auto tabular-nums"
                            value={days}
                            onChange={(e) => updateField(p.id, 'default_days', Number(e.target.value))}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {p.accrual_type === 'unpaid' || p.accrual_type === 'special' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={days}
                            className="w-20 h-8 text-center mx-auto tabular-nums"
                            value={carry}
                            onChange={(e) => updateField(p.id, 'carry_over_days', Number(e.target.value))}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={paid}
                          onCheckedChange={(v) => updateField(p.id, 'paid', v)}
                          disabled={p.accrual_type === 'unpaid'}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={active}
                          onCheckedChange={(v) => updateField(p.id, 'active', v)}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {p.accrual_type}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={p.description ?? ''}>
                        {p.description}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {policies.map((p) => {
              const days = getPolicyValue(p, 'default_days');
              const carry = getPolicyValue(p, 'carry_over_days');
              const active = getPolicyValue(p, 'active');
              return (
                <div key={p.id} className={`rounded-lg border p-3 space-y-2 ${!active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {p.color && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />}
                      <span className="font-medium text-sm">{p.name}</span>
                    </div>
                    <Switch
                      checked={active}
                      onCheckedChange={(v) => updateField(p.id, 'active', v)}
                    />
                  </div>
                  {p.accrual_type !== 'unpaid' && (
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Days / year</Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-sm tabular-nums"
                          value={days}
                          onChange={(e) => updateField(p.id, 'default_days', Number(e.target.value))}
                        />
                      </div>
                      {p.accrual_type !== 'special' && (
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Carry-over</Label>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-sm tabular-nums"
                            value={carry}
                            onChange={(e) => updateField(p.id, 'carry_over_days', Number(e.target.value))}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Company-wide leave settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company leave settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow leave carry-over</Label>
              <p className="text-xs text-muted-foreground">
                Unused leave days roll into the next year, up to the cap below.
              </p>
            </div>
            <Switch
              checked={companySettings.leave_carryover_enabled}
              onCheckedChange={(v) => setCompanySettings((s) => ({ ...s, leave_carryover_enabled: v }))}
            />
          </div>

          {companySettings.leave_carryover_enabled && (
            <div className="max-w-xs">
              <Label htmlFor="carryover-cap">Maximum carry-over days</Label>
              <InfoTip tip="Caps how many unused days from any single leave type can roll over." />
              <Input
                id="carryover-cap"
                type="number"
                min={0}
                max={365}
                className="mt-1 tabular-nums"
                value={companySettings.leave_carryover_max_days}
                onChange={(e) => setCompanySettings((s) => ({ ...s, leave_carryover_max_days: Number(e.target.value) }))}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
