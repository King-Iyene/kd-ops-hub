import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { UserCheck, AlertTriangle, CheckCircle, XCircle, ShieldCheck, Pencil, Loader2, Car } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DriverProfile {
  id: string;
  full_name: string;
  phone: string | null;
  nin: string | null;
  nin_last4: string | null;
  driver_license_number?: string | null;
  driver_license_expiry?: string | null;
  verification_status?: string | null;
  assigned_vehicle?: string | null;
}

type OverallStatus = 'verified' | 'incomplete' | 'blocked';

function getOverallStatus(driver: DriverProfile): OverallStatus {
  const hasNin = !!driver.nin || !!driver.nin_last4;
  const hasLicense = !!driver.driver_license_number;
  const licenseExpiry = driver.driver_license_expiry ? new Date(driver.driver_license_expiry) : null;
  const isExpired = licenseExpiry ? licenseExpiry < new Date() : false;

  if (isExpired) return 'blocked';
  if (hasNin && hasLicense && !isExpired) return 'verified';
  return 'incomplete';
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusSortOrder(status: OverallStatus): number {
  if (status === 'blocked') return 0;
  if (status === 'incomplete') return 1;
  return 2;
}

const EXT_COLUMNS = ['driver_license_number', 'driver_license_expiry', 'verification_status'] as const;

export function DriverVerificationPanel() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'finance' || profile?.role === 'operations';
  const isSelfService = profile?.role === 'field_staff' || profile?.role === 'driver';

  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasExtColumns, setHasExtColumns] = useState(true);

  const [editDriver, setEditDriver] = useState<DriverProfile | null>(null);
  const [editForm, setEditForm] = useState({ nin: '', driver_license_number: '', driver_license_expiry: '' });
  const [saving, setSaving] = useState(false);

  async function fetchDrivers() {
    try {
      const [profilesRes, vehiclesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone, nin, nin_last4')
          .in('role', ['field_staff', 'driver', 'operations']),
        supabase
          .from('vehicles')
          .select('assigned_driver_id, name, plate_number')
          .not('assigned_driver_id', 'is', null),
      ]);

      const vehiclesByDriver: Record<string, string> = {};
      const assignedDriverIds = new Set<string>();
      if (vehiclesRes.data) {
        for (const v of vehiclesRes.data) {
          if (v.assigned_driver_id) {
            assignedDriverIds.add(v.assigned_driver_id);
            vehiclesByDriver[v.assigned_driver_id] = `${v.name} (${v.plate_number})`;
          }
        }
      }

      const roleDriverIds = new Set((profilesRes.data || []).map((d) => d.id));
      const missingIds = [...assignedDriverIds].filter((id) => !roleDriverIds.has(id));

      let assignedProfiles: typeof profilesRes.data = [];
      if (missingIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, phone, nin, nin_last4')
          .in('id', missingIds);
        assignedProfiles = data || [];
      }

      const allProfiles = [...(profilesRes.data || []), ...assignedProfiles];
      const uniqueMap = new Map<string, (typeof allProfiles)[0]>();
      for (const p of allProfiles) uniqueMap.set(p.id, p);

      const extendedMap: Record<string, { driver_license_number?: string; driver_license_expiry?: string; verification_status?: string }> = {};
      const allIds = [...uniqueMap.keys()];

      if (allIds.length > 0) {
        const { data: extData, error: extError } = await supabase
          .from('profiles')
          .select(`id, ${EXT_COLUMNS.join(', ')}`)
          .in('id', allIds);

        if (extError) {
          setHasExtColumns(false);
        } else if (extData) {
          setHasExtColumns(true);
          for (const row of extData) {
            extendedMap[row.id] = {
              driver_license_number: (row as any).driver_license_number ?? undefined,
              driver_license_expiry: (row as any).driver_license_expiry ?? undefined,
              verification_status: (row as any).verification_status ?? undefined,
            };
          }
        }
      }

      const merged: DriverProfile[] = [...uniqueMap.values()].map((d) => ({
        ...d,
        ...extendedMap[d.id],
        assigned_vehicle: vehiclesByDriver[d.id] || null,
      }));

      merged.sort((a, b) => statusSortOrder(getOverallStatus(a)) - statusSortOrder(getOverallStatus(b)));

      setDrivers(merged);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDrivers(); }, []);

  function openEditDialog(driver: DriverProfile) {
    setEditDriver(driver);
    setEditForm({
      nin: driver.nin || '',
      driver_license_number: driver.driver_license_number || '',
      driver_license_expiry: driver.driver_license_expiry || '',
    });
  }

  async function handleSave() {
    if (!editDriver) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editForm.nin.trim()) {
        updates.nin = editForm.nin.trim();
        updates.nin_last4 = editForm.nin.trim().slice(-4);
      }
      if (hasExtColumns) {
        if (editForm.driver_license_number.trim()) updates.driver_license_number = editForm.driver_license_number.trim();
        if (editForm.driver_license_expiry) updates.driver_license_expiry = editForm.driver_license_expiry;
      }

      if (Object.keys(updates).length === 0) {
        toast({ title: 'Nothing to update', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('profiles').update(updates).eq('id', editDriver.id);
      if (error) throw error;

      toast({ title: 'Details updated successfully' });
      setEditDriver(null);
      fetchDrivers();
    } catch (err: any) {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const totalDrivers = drivers.length;
  const verifiedCount = drivers.filter((d) => getOverallStatus(d) === 'verified').length;
  const pendingCount = drivers.filter((d) => {
    const vs = d.verification_status;
    return !vs || vs === 'pending';
  }).length;
  const expiringCount = drivers.filter((d) => {
    if (!d.driver_license_expiry) return false;
    const days = daysUntil(d.driver_license_expiry);
    return days >= 0 && days <= 30;
  }).length;
  const assignedCount = drivers.filter((d) => !!d.assigned_vehicle).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Loading driver verification data...
        </CardContent>
      </Card>
    );
  }

  const visibleDrivers = isSelfService
    ? drivers.filter((d) => d.id === profile?.id)
    : drivers;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {isSelfService ? 'My Verification Details' : 'Driver Verification'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSelfService && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total Drivers" value={totalDrivers} icon={<UserCheck className="h-4 w-4 text-muted-foreground" />} />
            <SummaryCard label="Verified" value={verifiedCount} icon={<CheckCircle className="h-4 w-4 text-green-600" />} className="text-green-600" />
            <SummaryCard label="Assigned to Vehicle" value={assignedCount} icon={<Car className="h-4 w-4 text-blue-600" />} className="text-blue-600" />
            <SummaryCard label="License Expiring" value={expiringCount} icon={<XCircle className="h-4 w-4 text-red-600" />} className="text-red-600" />
          </div>
        )}

        {isSelfService && visibleDrivers.length > 0 && (
          <div className="space-y-4">
            {visibleDrivers.map((driver) => {
              const overall = getOverallStatus(driver);
              const hasNin = !!driver.nin || !!driver.nin_last4;
              return (
                <div key={driver.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <OverallBadge status={overall} />
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(driver)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Update My Details
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {driver.assigned_vehicle && (
                      <div className="rounded-lg border p-3 space-y-1 sm:col-span-2 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                        <div className="text-xs text-muted-foreground">Assigned Vehicle</div>
                        <div className="font-medium flex items-center gap-2">
                          <Car className="h-4 w-4 text-blue-600" />
                          {driver.assigned_vehicle}
                        </div>
                      </div>
                    )}
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="text-xs text-muted-foreground">NIN</div>
                      <div className="font-medium">
                        {hasNin ? (
                          <span className="flex items-center gap-2">
                            ****{driver.nin_last4 || driver.nin?.slice(-4)}
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 text-[10px]">Verified</Badge>
                          </span>
                        ) : (
                          <span className="text-amber-600">Not submitted</span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="text-xs text-muted-foreground">Driver License</div>
                      <div className="font-medium">
                        {driver.driver_license_number
                          ? `****${driver.driver_license_number.slice(-4)}`
                          : <span className="text-amber-600">Not submitted</span>
                        }
                      </div>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="text-xs text-muted-foreground">License Expiry</div>
                      <div className="font-medium">
                        {driver.driver_license_expiry ? (
                          <span className="flex items-center gap-2">
                            {new Date(driver.driver_license_expiry).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                            <ExpiryBadge days={daysUntil(driver.driver_license_expiry)} />
                          </span>
                        ) : (
                          <span className="text-amber-600">Not submitted</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {overall === 'incomplete' && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                      Please complete your verification details to avoid delays with fuel requests. Tap "Update My Details" above.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isSelfService && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver Name</TableHead>
                  <TableHead>Assigned Vehicle</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>NIN Status</TableHead>
                  <TableHead>License Number</TableHead>
                  <TableHead>License Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-6">
                      No drivers found. Assign employees to vehicles in the Vehicles tab and they'll appear here automatically.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleDrivers.map((driver) => {
                    const overall = getOverallStatus(driver);
                    const hasNin = !!driver.nin || !!driver.nin_last4;
                    const licenseDisplay = driver.driver_license_number
                      ? `****${driver.driver_license_number.slice(-4)}`
                      : 'Not on file';
                    const expiryDays = driver.driver_license_expiry ? daysUntil(driver.driver_license_expiry) : null;

                    return (
                      <TableRow key={driver.id}>
                        <TableCell className="font-medium">{driver.full_name}</TableCell>
                        <TableCell>
                          {driver.assigned_vehicle ? (
                            <span className="flex items-center gap-1.5 text-sm">
                              <Car className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              {driver.assigned_vehicle}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>{driver.phone || '-'}</TableCell>
                        <TableCell>
                          {hasNin ? (
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Verified</Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Missing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{licenseDisplay}</TableCell>
                        <TableCell>
                          {driver.driver_license_expiry ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                {new Date(driver.driver_license_expiry).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <ExpiryBadge days={expiryDays!} />
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not on file</span>
                          )}
                        </TableCell>
                        <TableCell><OverallBadge status={overall} /></TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDialog(driver)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!hasExtColumns && isAdmin && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
            Driver license columns are not yet available in the database. Apply the fleet_compliance_verification migration to enable license tracking.
          </p>
        )}
      </CardContent>

      <Dialog open={!!editDriver} onOpenChange={(v) => { if (!v) setEditDriver(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSelfService ? 'Update My Details' : `Edit ${editDriver?.full_name}`}</DialogTitle>
            <DialogDescription>
              {isSelfService
                ? 'Enter your NIN and driver license details for verification.'
                : 'Update driver verification details.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>NIN (National Identification Number)</Label>
              <Input
                value={editForm.nin}
                onChange={(e) => setEditForm({ ...editForm, nin: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                placeholder="11-digit NIN"
                maxLength={11}
                inputMode="numeric"
              />
              <p className="text-[10px] text-muted-foreground">Your NIN is stored securely. Only the last 4 digits are visible to others.</p>
            </div>
            <div className="space-y-1">
              <Label>Driver License Number</Label>
              <Input
                value={editForm.driver_license_number}
                onChange={(e) => setEditForm({ ...editForm, driver_license_number: e.target.value.toUpperCase() })}
                placeholder="e.g. AAA12345AB67"
                disabled={!hasExtColumns}
              />
            </div>
            <div className="space-y-1">
              <Label>Driver License Expiry Date</Label>
              <Input
                type="date"
                value={editForm.driver_license_expiry}
                onChange={(e) => setEditForm({ ...editForm, driver_license_expiry: e.target.value })}
                disabled={!hasExtColumns}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDriver(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${className ?? ''}`}>{value}</div>
    </div>
  );
}

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Expired</Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{days}d left</Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">{days}d left</Badge>
  );
}

function OverallBadge({ status }: { status: OverallStatus }) {
  if (status === 'verified') {
    return (
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Verified</Badge>
    );
  }
  if (status === 'blocked') {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Blocked</Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Incomplete</Badge>
  );
}
