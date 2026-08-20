import { Loader2, HeartPulse, Plus, Trash2 } from 'lucide-react';
import type { EmployeeData, EditSection } from './types';
import { formatDate } from '@/lib/format';
import { displayName } from '@/lib/name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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
  dependents: any[];
  openAddDependent: () => void;
  openEditDependent: (dep: any) => void;
  setDeleteDependentTarget: (dep: any) => void;
  toggleDependentFlag: (dep: any, field: 'is_beneficiary' | 'is_hmo_enrolled') => void;
  dependentAge: (dob: string | null) => string;
  relationshipLabel: (rel: string) => string;
}

export default function PersonalTab({
  employee, form, patch, editingSection, sectionSaving,
  startEdit, cancelEdit, saveSection, canManage,
  dependents, openAddDependent, openEditDependent,
  setDeleteDependentTarget, toggleDependentFlag,
  dependentAge, relationshipLabel,
}: Props) {
  const empName = displayName(employee.first_name, employee.last_name, employee.full_name);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Basic Details */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Basic Details</CardTitle>
            {canManage && editingSection !== 'basic' && (
              <Button size="sm" variant="outline" onClick={() => startEdit('basic')}>
                Edit
              </Button>
            )}
            {editingSection === 'basic' && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => saveSection('Basic details', {
                    first_name: form.first_name,
                    last_name: form.last_name,
                    phone: form.phone,
                    date_of_birth: form.date_of_birth || null,
                    gender: form.gender || null,
                    marital_status: form.marital_status || null,
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
            {editingSection === 'basic' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="first_name" className="text-xs">First name</Label>
                    <Input id="first_name" value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="last_name" className="text-xs">Last name</Label>
                    <Input id="last_name" value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs">Phone</Label>
                  <Input id="phone" value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="date_of_birth" className="text-xs">Date of birth</Label>
                    <Input
                      id="date_of_birth"
                      type="date"
                      value={form.date_of_birth || ''}
                      onChange={(e) => patch({ date_of_birth: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gender" className="text-xs">Gender</Label>
                    <Select value={form.gender || undefined} onValueChange={(v) => patch({ gender: v || null })}>
                      <SelectTrigger id="gender"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="marital_status" className="text-xs">Marital status</Label>
                  <Select value={form.marital_status || undefined} onValueChange={(v) => patch({ marital_status: v || null })}>
                    <SelectTrigger id="marital_status"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="divorced">Divorced</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Email cannot be changed here — it is tied to login credentials.
                </p>
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                {([
                  ['Full name',      empName],
                  ['Date of birth',  employee.date_of_birth ? formatDate(employee.date_of_birth) : '—'],
                  ['Gender',         employee.gender || '—'],
                  ['Email',          employee.email],
                  ['Phone',          employee.phone || '—'],
                  ['Marital status', employee.marital_status || '—'],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground shrink-0">{label}</dt>
                    <dd className="font-medium text-right">{val}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Next of Kin */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Next of Kin</CardTitle>
            {canManage && editingSection !== 'kin' && (
              <Button size="sm" variant="outline" onClick={() => startEdit('kin')}>
                Edit
              </Button>
            )}
            {editingSection === 'kin' && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => saveSection('Next of kin', {
                    next_of_kin_name: form.next_of_kin_name,
                    next_of_kin_relationship: form.next_of_kin_relationship,
                    next_of_kin_phone: form.next_of_kin_phone,
                    next_of_kin_email: form.next_of_kin_email,
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
            {editingSection === 'kin' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="next_of_kin_name" className="text-xs">Full name</Label>
                  <Input id="next_of_kin_name" value={form.next_of_kin_name || ''} onChange={(e) => patch({ next_of_kin_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="next_of_kin_relationship" className="text-xs">Relationship</Label>
                  <Input id="next_of_kin_relationship" value={form.next_of_kin_relationship || ''} onChange={(e) => patch({ next_of_kin_relationship: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="next_of_kin_phone" className="text-xs">Phone</Label>
                  <Input id="next_of_kin_phone" value={form.next_of_kin_phone || ''} onChange={(e) => patch({ next_of_kin_phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="next_of_kin_email" className="text-xs">Email</Label>
                  <Input id="next_of_kin_email" type="email" value={form.next_of_kin_email || ''} onChange={(e) => patch({ next_of_kin_email: e.target.value })} />
                </div>
              </div>
            ) : employee.next_of_kin_name ? (
              <dl className="space-y-3 text-sm">
                {([
                  ['Name',         employee.next_of_kin_name],
                  ['Relationship', employee.next_of_kin_relationship || '—'],
                  ['Phone',        employee.next_of_kin_phone || '—'],
                  ['Email',        employee.next_of_kin_email || '—'],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground shrink-0">{label}</dt>
                    <dd className="font-medium text-right">{val}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No next of kin recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Home Address */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Home Address</CardTitle>
          {canManage && editingSection !== 'address' && (
            <Button size="sm" variant="outline" onClick={() => startEdit('address')}>
              Edit
            </Button>
          )}
          {editingSection === 'address' && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => saveSection('Home address', { address: form.address })}
                disabled={sectionSaving}
              >
                {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editingSection === 'address' ? (
            <Textarea
              rows={3}
              value={form.address || ''}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="Enter full address…"
            />
          ) : employee.address ? (
            <p className="text-sm">{employee.address}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No address recorded.</p>
          )}
        </CardContent>
      </Card>

      {/* Dependents & Beneficiaries */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
            Dependents &amp; Beneficiaries
          </CardTitle>
          <Button size="sm" variant="outline" onClick={openAddDependent}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add dependent
          </Button>
        </CardHeader>
        <CardContent>
          {dependents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dependents recorded. Add a spouse, child, or other family member —
              mark them as an HMO enrollee or an insurance/pension beneficiary.
            </p>
          ) : (
            <div className="space-y-2">
              {dependents.map((dep) => (
                <div
                  key={dep.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{dep.full_name}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {relationshipLabel(dep.relationship)}
                      </Badge>
                      {dep.is_beneficiary && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100">
                          Beneficiary
                        </Badge>
                      )}
                      {dep.is_hmo_enrolled && (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          HMO enrolled
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {dep.date_of_birth ? `Age ${dependentAge(dep.date_of_birth)}` : 'DOB not set'}
                      {dep.gender ? ` · ${dep.gender === 'male' ? 'Male' : 'Female'}` : ''}
                      {dep.phone ? ` · ${dep.phone}` : ''}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">Beneficiary</Label>
                        <Switch
                          checked={!!dep.is_beneficiary}
                          onCheckedChange={() => toggleDependentFlag(dep, 'is_beneficiary')}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">HMO</Label>
                        <Switch
                          checked={!!dep.is_hmo_enrolled}
                          onCheckedChange={() => toggleDependentFlag(dep, 'is_hmo_enrolled')}
                        />
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openEditDependent(dep)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteDependentTarget(dep)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
