import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PermissionsEditor, ROLE_DEFAULT_PERMISSIONS, type PermissionsMap } from '@/components/PermissionsEditor';
import { confirm } from '@/hooks/use-confirm';

interface Props {
  employee: { full_name: string; role: string };
  permissions: PermissionsMap;
  onPermissionsChange: (p: PermissionsMap) => void;
  onSave: () => void;
  saving: boolean;
}

export default function PermissionsTab({ employee, permissions, onPermissionsChange, onSave, saving }: Props) {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
          <CardTitle className="text-base">Permissions</CardTitle>
          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!(await confirm({ title: 'Reset permissions?', description: 'Clear all explicit overrides and fall back to the role defaults?' }))) return;
                onPermissionsChange({});
              }}
              title="Clear every explicit grant/deny so the user falls back entirely to their role's default permissions"
            >
              Reset to role defaults
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 mb-4 text-xs text-foreground/80 space-y-1">
            <p>
              <span className="font-semibold">ON (no badge)</span> — comes from this user's role default.
            </p>
            <p>
              <span className="font-semibold">ON · GRANTED</span> — explicitly switched on, even though the role wouldn't normally allow it.
            </p>
            <p>
              <span className="font-semibold">OFF · DENIED</span> — explicitly switched off, even though the role would normally allow it. Use sparingly — better to change the role.
            </p>
            <p>
              <span className="font-semibold">NEEDS &lt;role&gt;</span> — locked. The action is enforced at the database (RPC or RLS) for a higher role, so the toggle is meaningless for this user's role. Hover for the specific reason; change their role if they should be able to perform this action.
            </p>
          </div>
          <PermissionsEditor
            value={permissions}
            onChange={onPermissionsChange}
            roleDefaults={ROLE_DEFAULT_PERMISSIONS[employee.role] || []}
            userRole={employee.role}
          />
        </CardContent>
      </Card>
    </div>
  );
}
