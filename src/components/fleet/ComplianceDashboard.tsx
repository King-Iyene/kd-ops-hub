import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  insurance_expiry: string | null;
  road_worthiness_expiry: string | null;
  hackney_permit_expiry: string | null;
  vehicle_license_expiry: string | null;
  next_service_date: string | null;
}

interface Props {
  vehicles: Vehicle[];
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dateBadge(dateStr: string | null) {
  const days = daysUntil(dateStr);
  if (days === null) {
    return <Badge variant="outline" className="bg-gray-100 text-gray-500">Not set</Badge>;
  }
  if (days < 0) {
    return <Badge variant="destructive">Expired {Math.abs(days)} days ago</Badge>;
  }
  if (days <= 14) {
    return <Badge variant="destructive">{days} days left</Badge>;
  }
  if (days <= 30) {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">{days} days left</Badge>;
  }
  if (days <= 60) {
    return <Badge className="bg-yellow-400 hover:bg-yellow-500 text-black">{days} days</Badge>;
  }
  return <Badge className="bg-green-600 hover:bg-green-700 text-white">{days} days</Badge>;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type VehicleStatus = 'blocked' | 'warning' | 'compliant';

function getVehicleStatus(vehicle: Vehicle): VehicleStatus {
  const dates = [
    vehicle.insurance_expiry,
    vehicle.road_worthiness_expiry,
    vehicle.hackney_permit_expiry,
    vehicle.vehicle_license_expiry,
    vehicle.next_service_date,
  ];

  for (const d of dates) {
    const days = daysUntil(d);
    if (days !== null && days < 0) return 'blocked';
  }

  for (const d of dates) {
    const days = daysUntil(d);
    if (days !== null && days <= 30) return 'warning';
  }

  return 'compliant';
}

function statusBadge(status: VehicleStatus) {
  switch (status) {
    case 'blocked':
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Blocked</Badge>;
    case 'warning':
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1"><AlertTriangle className="h-3 w-3" /> Warning</Badge>;
    case 'compliant':
      return <Badge className="bg-green-600 hover:bg-green-700 text-white gap-1"><CheckCircle className="h-3 w-3" /> Compliant</Badge>;
  }
}

function statusOrder(status: VehicleStatus): number {
  return status === 'blocked' ? 0 : status === 'warning' ? 1 : 2;
}

export function ComplianceDashboard({ vehicles }: Props) {
  const statuses = vehicles.map((v) => ({ vehicle: v, status: getVehicleStatus(v) }));
  const totalCount = vehicles.length;
  const compliantCount = statuses.filter((s) => s.status === 'compliant').length;
  const warningCount = statuses.filter((s) => s.status === 'warning').length;
  const blockedCount = statuses.filter((s) => s.status === 'blocked').length;

  const sorted = [...statuses].sort((a, b) => statusOrder(a.status) - statusOrder(b.status));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Vehicles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fully Compliant</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{compliantCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{warningCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expired / Blocked</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{blockedCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Insurance</TableHead>
              <TableHead>Road Worthiness</TableHead>
              <TableHead>Hackney Permit</TableHead>
              <TableHead>Vehicle License</TableHead>
              <TableHead>Next Service</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(({ vehicle, status }) => (
              <TableRow key={vehicle.id}>
                <TableCell className="font-medium">
                  <div>{vehicle.name}</div>
                  <div className="text-xs text-muted-foreground">{vehicle.plate_number}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{formatDate(vehicle.insurance_expiry)}</div>
                  <div className="mt-1">{dateBadge(vehicle.insurance_expiry)}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{formatDate(vehicle.road_worthiness_expiry)}</div>
                  <div className="mt-1">{dateBadge(vehicle.road_worthiness_expiry)}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{formatDate(vehicle.hackney_permit_expiry)}</div>
                  <div className="mt-1">{dateBadge(vehicle.hackney_permit_expiry)}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{formatDate(vehicle.vehicle_license_expiry)}</div>
                  <div className="mt-1">{dateBadge(vehicle.vehicle_license_expiry)}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{formatDate(vehicle.next_service_date)}</div>
                  <div className="mt-1">{dateBadge(vehicle.next_service_date)}</div>
                </TableCell>
                <TableCell>{statusBadge(status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
