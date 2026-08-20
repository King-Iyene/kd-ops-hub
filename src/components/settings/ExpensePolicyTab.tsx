import { useState } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXPENSE_CATEGORY_KEYS, expenseCategoryLabel } from '@/lib/expense-categories';
import { exportExpensePolicyPdf } from '@/lib/policy-pdf';

const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_KEYS;

interface Props {
  settings: {
    company_name: string;
    logo_url: string | null;
    expense_limits: Record<string, number>;
    dual_approval_threshold_ngn: number;
    [key: string]: any;
  };
  patch: (p: Record<string, any>) => void;
  profileName?: string;
}

export default function ExpensePolicyTab({ settings, patch, profileName }: Props) {
  const [newLimitCategory, setNewLimitCategory] = useState<string>('');
  const [newLimitAmount, setNewLimitAmount] = useState<string>('');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Expense category limits</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Per-category caps on what staff can submit. Categories without a
              limit set are unrestricted. Submissions above the cap warn the
              submitter at entry; the claim is still routed for approval but
              flagged.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportExpensePolicyPdf({
              companyName: settings.company_name || 'KD Squares',
              logoUrl: settings.logo_url,
              expenseLimits: settings.expense_limits || {},
              dualApprovalThresholdNgn: Number(settings.dual_approval_threshold_ngn || 0),
              generatedBy: profileName || undefined,
            })}
            className="shrink-0"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export policy PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(settings.expense_limits || {}).filter(([, amt]) => amt > 0).length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">
              No category limits set yet. All expense categories are unrestricted.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(settings.expense_limits || {})
                .filter(([, amt]) => amt > 0)
                .sort(([a], [b]) => expenseCategoryLabel(a).localeCompare(expenseCategoryLabel(b)))
                .map(([cat, amount]) => (
                  <div
                    key={cat}
                    className="flex items-center gap-3 border rounded-md p-2 bg-muted/20"
                  >
                    <span className="flex-1 text-sm font-medium">
                      {expenseCategoryLabel(cat)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">₦</span>
                      <Input
                        type="number"
                        min="0"
                        className="w-32 h-8 text-right"
                        value={amount}
                        onChange={(e) =>
                          patch({
                            expense_limits: {
                              ...settings.expense_limits,
                              [cat]: Number(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = { ...settings.expense_limits };
                        delete next[cat];
                        patch({ expense_limits: next });
                      }}
                      title="Remove limit"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {(() => {
            const available = EXPENSE_CATEGORIES.filter(
              (c) => !((settings.expense_limits || {})[c] > 0),
            );
            if (available.length === 0) {
              return (
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  All expense categories have limits set.
                </p>
              );
            }
            return (
              <div className="flex items-end gap-2 pt-3 border-t">
                <div className="flex-1 min-w-0 space-y-1">
                  <Label htmlFor="new_limit_category" className="text-xs text-muted-foreground">Add a category limit</Label>
                  <Select value={newLimitCategory} onValueChange={setNewLimitCategory}>
                    <SelectTrigger id="new_limit_category" className="h-9">
                      <SelectValue placeholder="Choose category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((c) => (
                        <SelectItem key={c} value={c}>
                          {expenseCategoryLabel(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new_limit_amount" className="text-xs text-muted-foreground">Amount (₦)</Label>
                  <Input
                    id="new_limit_amount"
                    type="number"
                    min="0"
                    className="w-36 h-9"
                    value={newLimitAmount}
                    onChange={(e) => setNewLimitAmount(e.target.value)}
                    placeholder="e.g. 50000"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!newLimitCategory || !newLimitAmount || Number(newLimitAmount) <= 0}
                  onClick={() => {
                    patch({
                      expense_limits: {
                        ...settings.expense_limits,
                        [newLimitCategory]: Number(newLimitAmount),
                      },
                    });
                    setNewLimitCategory('');
                    setNewLimitAmount('');
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fuel budgets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Fuel budgets are managed per-vehicle in the{' '}
            <a href="/fleet" className="text-primary underline">Fleet page</a> —
            each vehicle has a weekly budget, with carry-forward and per-vehicle
            approval limits enforced when drivers submit fuel requests.
          </p>
          <p className="text-xs text-muted-foreground">
            Per-department budgets used to live here but were not enforced anywhere.
            That UI has been removed to avoid a setting that does nothing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
