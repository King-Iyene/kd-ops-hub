import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserCheck, AlertTriangle, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';

interface DriverProfile {
  id: string;
  full_name: string;
  phone: string | null;
  nin: string | null;
  nin_last4: string | null;
  bvn_verified: boolean | null;
  driver_license_number?: string | null;
  driver_license_expiry?: string | null;
  verification_status?: string | null;
}

type OverallStatus = 'verified' | 'incomplete' | 'blocked';

function getOverallStatus(driver: DriverProfile): OverallStatus {
  const hasNin = !!driver.nin || !!driver.nin_last4;
  const hasLicense = !!driver.driver_license_number;
  const licenseExpiry = driver.driver_license_expiry ? new Date(driver.driver_license_expiry) : null;
  const isExpired = licenseExpiry ? licenseExpiry < new Date() : false;

  if (isExpired) return 'blocked';
  if (hasNin && hasLicense && !isExpired && driver.bvn_verified) return 'verified';
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

export function DriverVerificationPanel() {
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: baseData, error: baseError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, nin, nin_last4, bvn_verified')
        .in('role', ['field_staff', 'driver', 'operations']);

      if (baseError || !baseData) {
        setLoading(false);
        return;
      }

      let extendedMap: Record<string, { driver_license_number?: string; driver_license_expiry?: string; verification_status?: string }> = {};

      const { data: extData } = await supabase
        .from('profiles')
        .select('id, driver_license_number, driver_license_expiry, verification_status')
        .in('role', ['field_staff', 'driver', 'operations']);

      if (extData) {
        for (const row of extData) {
          extendedMap[row.id] = {
            driver_license_number: row.driver_license_number ?? undefined,
            driver_license_expiry: row.driver_license_expiry ?? undefined,
            verification_status: row.verification_status ?? undefined,
          };
        }
      }

      const merged: DriverProfile[] = baseData.map((d) => ({
        ...d,
        ...extendedMap[d.id],
      }));

      merged.sort((a, b) => statusSortOrder(getOverallStatus(a)) - statusSortOrder(getOverallStatus(b)));

      setDrivers(merged);
      setLoading(false);
    })();
  }, []);

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

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Loading driver verification data...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Driver Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Drivers" value={totalDrivers} icon={<UserCheck className="h-4 w-4 text-muted-foreground" />} />
          <SummaryCard label="Verified" value={verifiedCount} icon={<CheckCircle className="h-4 w-4 text-green-600" />} className="text-green-600" />
          <SummaryCard label="Pending" value={pendingCount} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} className="text-amber-600" />
          <SummaryCard label="License Expiring" value={expiringCount} icon={<XCircle className="h-4 w-4 text-red-600" />} className="text-red-600" />
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>NIN Status</TableHead>
                <TableHead>License Number</TableHead>
                <TableHead>License Expiry</TableHead>
                <TableHead>BVN</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No active drivers found
                  </TableCell>
                </TableRow>
              ) : (
                drivers.map((driver) => {
                  const overall = getOverallStatus(driver);
                  const hasNin = !!driver.nin || !!driver.nin_last4;
                  const licenseDisplay = driver.driver_license_number
                    ? `****${driver.driver_license_number.slice(-4)}`
                    : 'Not on file';
                  const expiryDays = driver.driver_license_expiry ? daysUntil(driver.driver_license_expiry) : null;

                  return (
                    <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driver.full_name}</TableCell>
                      <TableCell>{driver.phone || '-'}</TableCell>
                      <TableCell>
                        {hasNin ? (
                          <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                            Missing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{licenseDisplay}</TableCell>
                      <TableCell>
                        {driver.driver_license_expiry ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {new Date(driver.driver_license_expiry).toLocaleDateString('en-NG', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            <ExpiryBadge days={expiryDays!} />
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not on file</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {driver.bvn_verified ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <OverallBadge status={overall} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
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
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
        Expired
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
        {days}d left
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
      {days}d left
    </Badge>
  );
}

function OverallBadge({ status }: { status: OverallStatus }) {
  if (status === 'verified') {
    return (
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
        Verified
      </Badge>
    );
  }
  if (status === 'blocked') {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
        Blocked
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
      Incomplete
    </Badge>
  );
}
