import { useMemo, useState } from 'react';
import {
  Building2, FileText, Loader2, Save, Palette,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuroraHero } from '@/components/AuroraHero';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useCompanies } from '@/queries';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/queries';

export default function NdiProfile() {
  usePageTitle('NDI Profile');
  const { toast } = useToast();
  const { data: companies = [], refetch } = useCompanies();
  const ndi = useMemo(() => companies.find((c) => c.short_code === 'NDI'), [companies]);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});
  const [initialized, setInitialized] = useState(false);

  if (ndi && !initialized) {
    setForm({
      name: ndi.name,
      rc_number: ndi.rc_number,
      tin: ndi.tin,
      address: ndi.address,
      default_state: ndi.default_state,
      color: ndi.color,
      pencom_employer_code: ndi.pencom_employer_code,
      nhf_employer_code: ndi.nhf_employer_code,
      nsitf_employer_code: ndi.nsitf_employer_code,
      itf_employer_code: ndi.itf_employer_code,
    });
    setInitialized(true);
  }

  if (!ndi) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground ml-3">NDI company not found.</p>
      </div>
    );
  }

  const accentColor = ndi.color || '#112B34';

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: form.name?.trim() || ndi.name,
          rc_number: form.rc_number?.trim() || null,
          tin: form.tin?.trim() || null,
          address: form.address?.trim() || null,
          default_state: form.default_state?.trim() || null,
          color: form.color?.trim() || ndi.color,
          pencom_employer_code: form.pencom_employer_code?.trim() || null,
          nhf_employer_code: form.nhf_employer_code?.trim() || null,
          nsitf_employer_code: form.nsitf_employer_code?.trim() || null,
          itf_employer_code: form.itf_employer_code?.trim() || null,
        })
        .eq('id', ndi.id);
      if (error) throw error;
      toast({ title: 'NDI profile updated' });
      void refetch();
    } catch (err) {
      toast({ title: 'Failed to save', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof Company, placeholder?: string) => (
    <div>
      <Label>{label}</Label>
      <Input
        value={(form[key] as string) ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <AuroraHero className="p-5 sm:p-6" pattern="nest" patternColor={accentColor}>
        <PageHeader
          className="mb-0"
          title="NDI Profile"
          description="Registration details, branding, and document identity for Niger Delta Innovate."
          icon={FileText}
          badge={<Badge variant="outline" style={{ borderColor: accentColor, color: accentColor }}>NDI</Badge>}
          actions={
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save Changes
            </Button>
          }
        />
      </AuroraHero>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Organization Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {field('Organization Name', 'name', 'Niger Delta Innovate')}
            {field('RC Number', 'rc_number', 'CAC registration number')}
            {field('Tax ID (TIN)', 'tin', 'Tax identification number')}
            {field('Address', 'address', 'Office address')}
            {field('Default State', 'default_state', 'Rivers')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Statutory & Branding</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {field('PenCom Employer Code', 'pencom_employer_code')}
            {field('NHF Employer Code', 'nhf_employer_code')}
            {field('NSITF Employer Code', 'nsitf_employer_code')}
            {field('ITF Employer Code', 'itf_employer_code')}
            <div>
              <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Brand Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.color ?? ''}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="#112B34"
                  className="flex-1"
                />
                <div
                  className="h-9 w-9 rounded-md border shrink-0"
                  style={{ backgroundColor: form.color || accentColor }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            These details are used on NDI-specific documents (payslips, financial reports, exports) so they carry NDI's identity, not KD Squares'.
            The short code <strong>NDI</strong> cannot be changed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
