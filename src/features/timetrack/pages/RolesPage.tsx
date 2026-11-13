import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TimeRole } from '../lib/types';

const CAPABILITIES: { key: string; label: string }[] = [
  { key: 'manage_projects', label: 'Manage projects' },
  { key: 'manage_tasks', label: 'Manage tasks' },
  { key: 'track_time', label: 'Track time' },
  { key: 'track_time_for_others', label: 'Track time for others' },
  { key: 'view_others_time', label: "View others' time" },
  { key: 'approve_timesheets', label: 'Approve timesheets' },
  { key: 'manage_rates', label: 'Manage billing rates' },
  { key: 'create_invoices', label: 'Create invoices' },
  { key: 'manage_custom_fields', label: 'Manage custom fields' },
  { key: 'manage_clients', label: 'Manage clients' },
  { key: 'manage_planner', label: 'Manage planner' },
  { key: 'manage_leave_types', label: 'Manage leave types' },
  { key: 'approve_leave', label: 'Approve leave' },
  { key: 'manage_overtime_rules', label: 'Manage overtime rules' },
  { key: 'manage_budgets', label: 'Manage project budgets' },
  { key: 'manage_activity_tracking', label: 'Manage activity tracking (native agent)' },
];

export default function RolesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: roles, isLoading } = useQuery({
    queryKey: ['timetrack', 'roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_roles').select('*').order('label');
      if (error) throw error;
      return data as TimeRole[];
    },
  });
  const { data: employees } = useActiveEmployees();
  const { data: assignments } = useQuery({
    queryKey: ['timetrack', 'user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_user_roles').select('employee_id, role_key');
      if (error) throw error;
      return data as { employee_id: string; role_key: string }[];
    },
  });

  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const createRole = async () => {
    if (!newRoleKey.trim() || !newRoleLabel.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_roles').insert({
        role_key: newRoleKey.trim().toLowerCase().replace(/\s+/g, '_'), label: newRoleLabel.trim(), capabilities: {},
      });
      if (error) throw error;
      setNewRoleOpen(false); setNewRoleKey(''); setNewRoleLabel('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'roles'] });
    } catch (err) {
      toast({ title: 'Could not create role', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleCapability = async (role: TimeRole, cap: string, value: boolean) => {
    try {
      const { error } = await supabase
        .from('time_roles')
        .update({ capabilities: { ...role.capabilities, [cap]: value } })
        .eq('role_key', role.role_key);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'roles'] });
    } catch (err) {
      toast({ title: 'Could not update capability', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const assignRole = async (employeeId: string, roleKey: string) => {
    try {
      const { error } = await supabase.from('time_user_roles').upsert({ employee_id: employeeId, role_key: roleKey });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'user-roles'] });
    } catch (err) {
      toast({ title: 'Could not assign role', description: errorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="A capability matrix for this module — add a new role any time, no code change needed"
        icon={ShieldCheck}
        actions={<Button size="sm" onClick={() => setNewRoleOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New role</Button>}
      />
      <h3 className="font-semibold">Capability matrix</h3>
      <p className="text-xs text-muted-foreground -mt-4">
        New role types can be added here any time — no code change needed. App-level super_admin/admin always
        have every capability regardless of what's checked below.
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Capability</TableHead>
              {(roles ?? []).map((r) => <TableHead key={r.role_key} className="text-center">{r.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {CAPABILITIES.map((cap) => (
              <TableRow key={cap.key}>
                <TableCell className="whitespace-nowrap">{cap.label}</TableCell>
                {(roles ?? []).map((r) => (
                  <TableCell key={r.role_key} className="text-center">
                    <Checkbox
                      checked={r.capabilities?.[cap.key] === true}
                      onCheckedChange={(v) => toggleCapability(r, cap.key, v === true)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assign employees to a role</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
            <TableBody>
              {(employees ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.full_name}</TableCell>
                  <TableCell>
                    <Select
                      value={assignments?.find((a) => a.employee_id === e.id)?.role_key ?? ''}
                      onValueChange={(v) => assignRole(e.id, v)}
                    >
                      <SelectTrigger className="w-48"><SelectValue placeholder="No module role" /></SelectTrigger>
                      <SelectContent>{(roles ?? []).map((r) => <SelectItem key={r.role_key} value={r.role_key}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New role</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Label</Label><Input value={newRoleLabel} onChange={(e) => setNewRoleLabel(e.target.value)} placeholder="e.g. Team Lead" /></div>
            <div><Label>Key</Label><Input value={newRoleKey} onChange={(e) => setNewRoleKey(e.target.value)} placeholder="e.g. team_lead" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewRoleOpen(false)}>Cancel</Button>
            <Button onClick={createRole} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
