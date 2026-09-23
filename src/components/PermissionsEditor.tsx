import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type PermissionKey,
  type PermissionsMap,
  PERMISSION_ROLE_GATES,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from './permissions-config';


interface Props {
  value: PermissionsMap;
  onChange: (updated: PermissionsMap) => void;
  disabled?: boolean;
  /** Role-default state: keys here are ON by default for the current user
   *  even when no explicit value is stored. Other keys default OFF.
   */
  roleDefaults?: PermissionKey[];
  /** Role of the user being edited. When set, toggles whose action is
   *  server-side role-gated (see PERMISSION_ROLE_GATES) and where the user's
   *  role isn't in the allowed list become disabled + visually locked so an
   *  admin doesn't think they've granted something the server will refuse. */
  userRole?: string;
}

export function PermissionsEditor({ value, onChange, disabled, roleDefaults = [], userRole }: Props) {
  const defaultsSet = new Set<string>(roleDefaults);

  /** A permission is "blocked by role" when there's a server-side gate AND
   *  the user's role isn't in the gate's allowed set. We render those toggles
   *  off, disabled, and badged so the admin knows the grant is moot. */
  const blockedByRole = (key: PermissionKey): { blocked: boolean; reason?: string; requires?: string[] } => {
    const gate = PERMISSION_ROLE_GATES[key];
    if (!gate || !userRole) return { blocked: false };
    if (gate.requires.includes(userRole)) return { blocked: false };
    return { blocked: true, reason: gate.reason, requires: gate.requires };
  };

  // A toggle is ON when:
  //   - the value is explicitly true, OR
  //   - the value is undefined and the role grants this permission by default
  //   - AND the permission isn't blocked by role (blocked → forced OFF
  //     regardless of stored value or role default, matching what the server
  //     actually does)
  const isChecked = (key: PermissionKey) => {
    if (blockedByRole(key).blocked) return false;
    const v = value[key];
    if (v === true) return true;
    if (v === false) return false;
    return defaultsSet.has(key);
  };

  const toggle = (key: PermissionKey) => {
    if (blockedByRole(key).blocked) return; // defence: clicks shouldn't reach here, but be safe
    onChange({ ...value, [key]: !isChecked(key) });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {PERMISSION_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.permissions.map((perm) => {
              const blocked = blockedByRole(perm.key);
              const checked = isChecked(perm.key);
              const explicit = value[perm.key] === true || value[perm.key] === false;
              const friendlyRoles = blocked.requires?.map((r) =>
                r === 'super_admin' ? 'super admin' : r,
              ).join(' / ');
              return (
                <div
                  key={perm.key}
                  className={`flex items-center justify-between ${blocked.blocked ? 'opacity-60' : ''}`}
                  title={blocked.blocked ? blocked.reason : undefined}
                >
                  <Label
                    htmlFor={perm.key}
                    className={`text-sm font-normal flex items-center gap-2 ${blocked.blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span>{perm.label}</span>
                    {blocked.blocked ? (
                      <span className="text-3xs uppercase tracking-wider text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
                        {`needs ${friendlyRoles || 'higher role'}`}
                      </span>
                    ) : (
                      <>
                        {!explicit && checked && (
                          <span className="text-3xs uppercase tracking-wider text-muted-foreground">role</span>
                        )}
                        {explicit && value[perm.key] === true && !defaultsSet.has(perm.key) && (
                          <span className="text-3xs uppercase tracking-wider text-success">granted</span>
                        )}
                        {explicit && value[perm.key] === false && (
                          <span className="text-3xs uppercase tracking-wider text-destructive">denied</span>
                        )}
                      </>
                    )}
                  </Label>
                  <Switch
                    id={perm.key}
                    checked={checked}
                    onCheckedChange={() => toggle(perm.key)}
                    disabled={disabled || blocked.blocked}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
