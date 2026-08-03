import { useEffect, useMemo, useState } from 'react';
import {
  Link2, Copy, Check, ExternalLink, Briefcase, UserPlus2, Gift, FileText, Search, Loader2, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

// Every genuinely public, unauthenticated URL in KDOps, in one place. Before
// this page, the only way to find /join was a hardcoded hint string in
// ContractorApplications.tsx ("Share /join to start receiving applications")
// — there was no UI anywhere that actually built or copied a shareable link.

const origin = typeof window !== 'undefined' ? window.location.origin : '';

interface StaticLink {
  label: string;
  path: string;
  description: string;
  icon: typeof Link2;
}

const STATIC_LINKS: StaticLink[] = [
  {
    label: 'Careers page',
    path: '/careers',
    description: 'All published job openings, in one shared listing.',
    icon: Briefcase,
  },
  {
    label: 'Contractor application',
    path: '/join',
    description: 'Public intake form for new contractors — bank details, LinkedIn, default rate.',
    icon: UserPlus2,
  },
  {
    label: 'Privacy policy',
    path: '/legal/privacy',
    description: 'Linked from the footer of every public page.',
    icon: FileText,
  },
  {
    label: 'Terms of service',
    path: '/legal/terms',
    description: 'Linked from the footer of every public page.',
    icon: FileText,
  },
];

interface JobOpening {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'closed' | 'filled';
}

interface ReferralProfile {
  id: string;
  full_name: string | null;
  email: string;
  referral_code: string | null;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: 'Link copied' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Could not copy', description: 'Copy the URL manually.', variant: 'destructive' });
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 shrink-0">
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? (copied ? 'Copied' : 'Copy')}
    </Button>
  );
}

function LinkRow({ icon: Icon, title, sub, url, badge }: {
  icon: typeof Link2;
  title: string;
  sub?: string;
  url: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{title}</p>
          {badge}
        </div>
        <p className="text-xs text-muted-foreground truncate font-mono">{url}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
        <Button size="icon" variant="ghost" aria-label="Open link">
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </a>
      <CopyButton value={url} />
    </div>
  );
}

export default function PublicLinks() {
  usePageTitle('Public Links');
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [employees, setEmployees] = useState<ReferralProfile[]>([]);
  const [refSearch, setRefSearch] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [openingsRes, profilesRes] = await Promise.all([
      supabase
        .from('job_openings')
        .select('id, title, status')
        .is('deleted_at', null)
        .in('status', ['published', 'draft'])
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, full_name, email, referral_code')
        .eq('status', 'active')
        .order('full_name'),
    ]);
    setOpenings((openingsRes.data as JobOpening[]) ?? []);
    setEmployees((profilesRes.data as ReferralProfile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const publishedOpenings = openings.filter((o) => o.status === 'published');
  const draftOpenings = openings.filter((o) => o.status === 'draft');

  const filteredEmployees = useMemo(() => {
    if (!refSearch.trim()) return employees.slice(0, 8);
    const q = refSearch.toLowerCase();
    return employees.filter(
      (e) => (e.full_name ?? '').toLowerCase().includes(q) || e.email.toLowerCase().includes(q),
    );
  }, [employees, refSearch]);

  const generateReferralCode = async (emp: ReferralProfile) => {
    setGenerating(emp.id);
    // Same shape as the one-time backfill in 20260502100000_referrals_contacts_join.sql —
    // an 8-char slice of an md5 hash, generated client-side since there's no
    // per-row RPC for it. Uniqueness is enforced by the DB column constraint;
    // a collision just fails the update and the admin can retry.
    const code = Math.random().toString(36).slice(2, 10);
    const { data, error } = await supabase
      .from('profiles')
      .update({ referral_code: code })
      .eq('id', emp.id)
      .select('id, referral_code')
      .maybeSingle();
    setGenerating(null);
    if (error || !data) {
      toast({ title: 'Could not generate a code', description: error?.message ?? 'Try again.', variant: 'destructive' });
      return;
    }
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, referral_code: data.referral_code } : e)));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Public Links"
        description="Every externally-shareable KDOps URL, in one place — the careers page, the contractor application, per-opening links, and employee referral links."
        icon={Link2}
      />

      {/* ─── Company pages ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Company pages</CardTitle>
          <p className="text-sm text-muted-foreground">Static — the same URL every time.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {STATIC_LINKS.map((link) => (
            <LinkRow
              key={link.path}
              icon={link.icon}
              title={link.label}
              sub={link.description}
              url={`${origin}${link.path}`}
            />
          ))}
        </CardContent>
      </Card>

      {/* ─── Job openings ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Job openings
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            All openings share the Careers page — this link scrolls straight to the one you're sending.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : publishedOpenings.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No published openings"
              description={draftOpenings.length > 0
                ? `${draftOpenings.length} draft opening${draftOpenings.length === 1 ? '' : 's'} won't have a public link until published from Recruitment.`
                : 'Publish an opening from Recruitment to get a shareable link for it.'}
            />
          ) : (
            <div className="space-y-2">
              {publishedOpenings.map((o) => (
                <LinkRow
                  key={o.id}
                  icon={Briefcase}
                  title={o.title}
                  url={`${origin}/careers?opening=${o.id}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Referral links ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" /> Employee referral links
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Every employee gets a personal link — applications through it are tagged back to them on submission.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search employees by name or email…"
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filteredEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No matching employees.</p>
          ) : (
            <div className="space-y-2">
              {filteredEmployees.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.full_name || e.email}</p>
                    <p className="text-xs text-muted-foreground truncate font-mono">
                      {e.referral_code ? `${origin}/ref/${e.referral_code}` : 'No referral code yet'}
                    </p>
                  </div>
                  {e.referral_code ? (
                    <CopyButton value={`${origin}/ref/${e.referral_code}`} />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 shrink-0"
                      disabled={generating === e.id}
                      onClick={() => generateReferralCode(e)}
                    >
                      {generating === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Generate
                    </Button>
                  )}
                </div>
              ))}
              {!refSearch.trim() && employees.length > filteredEmployees.length && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  Showing {filteredEmployees.length} of {employees.length} — search to find someone else.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
