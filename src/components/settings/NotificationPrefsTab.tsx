import { Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NOTIF_EVENTS = [
  { key: 'email_approvals', label: 'Approval requests assigned to me' },
  { key: 'email_payments', label: 'Payment batch status changes' },
  { key: 'email_compliance', label: 'Statutory compliance deadlines' },
  { key: 'email_expenses', label: 'Expense approved / rejected' },
  { key: 'email_fleet', label: 'Fuel + trip activity' },
  { key: 'email_leave', label: 'Leave requests and balances' },
] as const;

interface Props {
  notifPrefs: Record<string, boolean>;
  setNotifPrefs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  digest: 'immediate' | 'hourly' | 'daily' | 'never';
  setDigest: (v: 'immediate' | 'hourly' | 'daily' | 'never') => void;
  saveNotifPrefs: () => void;
}

export default function NotificationPrefsTab({ notifPrefs, setNotifPrefs, digest, setDigest, saveNotifPrefs }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {NOTIF_EVENTS.map((e) => (
          <label
            key={e.key}
            className="flex items-center justify-between border-b last:border-0 py-2"
          >
            <span className="text-sm">{e.label}</span>
            <Switch
              checked={!!notifPrefs[e.key]}
              onCheckedChange={(v) =>
                setNotifPrefs((prev) => ({ ...prev, [e.key]: v }))
              }
            />
          </label>
        ))}
        <div className="space-y-1 pt-3">
          <Label htmlFor="digest_frequency">Digest frequency</Label>
          <Select
            value={digest}
            onValueChange={(v) => setDigest(v as any)}
          >
            <SelectTrigger id="digest_frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">Immediate</SelectItem>
              <SelectItem value="hourly">Hourly digest</SelectItem>
              <SelectItem value="daily">Daily digest (8am)</SelectItem>
              <SelectItem value="never">Never (in-app only)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="pt-2">
          <Button variant="outline" onClick={saveNotifPrefs}>
            <Save className="mr-2 h-4 w-4" /> Save my preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
