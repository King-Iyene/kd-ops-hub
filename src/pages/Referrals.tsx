import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Share2,
  Users,
  UserPlus,
  Gift,
  CheckCircle2,
  Clock,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';

interface Referral {
  id: string;
  referred_email: string;
  status: string;
  is_affiliate: boolean;
  commission_pct: number;
  commission_earned_ngn: number;
  created_at: string;
  converted_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  signed_up: 'bg-info/10 text-info',
  active: 'bg-success/10 text-success',
  expired: 'bg-muted text-muted-foreground',
};

const Referrals = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const referralLink = code ? `${origin}/ref/${code}` : '';

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    // Fetch or generate referral code.
    const { data: profileData } = await supabase
      .from('profiles')
      .select('referral_code')
      .eq('id', profile.id)
      .single();

    let rc = (profileData as any)?.referral_code;
    if (!rc) {
      // Generate one.
      rc = profile.id.replace(/-/g, '').slice(0, 8);
      await supabase
        .from('profiles')
        .update({ referral_code: rc })
        .eq('id', profile.id);
    }
    setCode(rc);

    const { data } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', profile.id)
      .order('created_at', { ascending: false });
    setReferrals((data as Referral[]) || []);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({ title: 'Link copied to clipboard' });
    } catch {
      toast({ title: 'Could not copy — use the link below', variant: 'destructive' });
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `Join KD Squares via KDOps — the most advanced finance and operations platform for African businesses.\n\n${referralLink}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
  };

  const stats = useMemo(() => {
    const total = referrals.length;
    const active = referrals.filter((r) => r.status === 'active').length;
    const pending = referrals.filter((r) => r.status === 'pending').length;
    const totalCommission = referrals.reduce(
      (s, r) => s + Number(r.commission_earned_ngn || 0),
      0,
    );
    return { total, active, pending, totalCommission };
  }, [referrals]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referrals"
        description="Invite others to KDOps. Track who you referred and earn affiliate commissions."
      />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6 space-y-4">
          <div>
            <p className="text-sm font-semibold mb-1">Your referral link</p>
            <div className="flex items-center gap-2">
              <Input
                value={referralLink}
                readOnly
                className="font-mono text-xs bg-background"
              />
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button size="sm" onClick={shareWhatsApp} className="bg-[#25D366] hover:bg-[#1da851] text-white">
                <Share2 className="mr-2 h-4 w-4" /> WhatsApp
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this link with contractors, partners and businesses. When they
            sign up or apply via <code>/join</code>, KDOps tracks the referral
            automatically.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total referrals"
          value={stats.total}
          icon={Users}
          tone="primary"
        />
        <StatCard
          title="Active"
          value={stats.active}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          title="Commission earned"
          value={`₦${stats.totalCommission.toLocaleString()}`}
          icon={Gift}
          tone="primary"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your referrals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : referrals.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No referrals yet"
              description="Share your link to start tracking referrals. When someone signs up or applies via your link, they'll appear here."
              action={
                <Button onClick={copyLink}>
                  <Copy className="mr-2 h-4 w-4" /> Copy referral link
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referred</TableHead>
                  <TableHead>Converted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((r) => (
                  <TableRow key={r.id} className="kd-transition">
                    <TableCell className="font-medium">{r.referred_email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={STATUS_BADGE[r.status] || STATUS_BADGE.pending}
                      >
                        {r.status}
                      </Badge>
                      {r.is_affiliate && (
                        <Badge className="ml-2 bg-accent/15 text-accent-foreground border border-accent/40">
                          Affiliate
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.converted_at ? formatDate(r.converted_at) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Referrals;
