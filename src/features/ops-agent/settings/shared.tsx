import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function Section({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SaveBar({ dirty, saving, onSave, onCancel, readOnly }: { dirty: boolean; saving: boolean; onSave: () => void; onCancel: () => void; readOnly?: boolean }) {
  if (readOnly) return null;
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
        {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Save
      </Button>
      {dirty && !saving && <Button size="sm" variant="ghost" onClick={onCancel}>Discard changes</Button>}
      {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
    </div>
  );
}
