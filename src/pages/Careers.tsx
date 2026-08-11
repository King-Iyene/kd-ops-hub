import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase, MapPin, Clock, Users, ArrowRight, ExternalLink, Sparkles,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';

// Public /careers page — no auth guard. Reads job_openings.status='published'.
//
// Data flow:
//   1. Company header (name + logo + address) from company_settings singleton.
//   2. Open positions from job_openings joined with departments.
//   3. Apply CTA points at mailto: careers@… or (if opening has notes with a
//      URL) the URL, so no back-end form is required in this first cut.
//
// Styling: standalone marketing shell — not the AppLayout — so anonymous
// visitors don't see the sidebar. Uses the same design tokens.

interface Opening {
  id: string;
  title: string;
  department: { name: string } | null;
  description: string | null;
  requirements: string | null;
  employment_type: 'full_time' | 'part_time' | 'contract' | 'intern';
  location: string | null;
  salary_min_ngn: number | null;
  salary_max_ngn: number | null;
  opening_count: number;
  closing_date: string | null;
  created_at: string;
}

const EMPLOYMENT_LABEL: Record<Opening['employment_type'], string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  intern: 'Internship',
};

const EMPLOYMENT_TONE: Record<Opening['employment_type'], string> = {
  full_time: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  part_time: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  contract: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  intern: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

const Careers = () => {
  usePageTitle('Careers');
  const [searchParams] = useSearchParams();
  // A shared listing page, but recruiters need to share a link to ONE role
  // (e.g. from Recruitment or the Public Links page). No separate /jobs/:id
  // route — just scroll to and highlight the matching card on this page.
  const highlightedId = searchParams.get('opening');
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [company, setCompany] = useState<{
    company_name: string;
    logo_url: string | null;
    address: string | null;
    website_url: string | null;
    linkedin_url: string | null;
  }>({
    company_name: 'KD Squares',
    logo_url: null,
    address: null,
    website_url: null,
    linkedin_url: null,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [oRes, cRes] = await Promise.all([
        supabase
          .from('job_openings')
          .select(
            'id, title, description, requirements, employment_type, location, salary_min_ngn, salary_max_ngn, opening_count, closing_date, created_at, department:departments!department_id(name)',
          )
          .eq('status', 'published')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('company_settings')
          .select('company_name, logo_url, address, website_url, linkedin_url')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
      setOpenings((oRes.data as any[]) ?? []);
      if (cRes.data) setCompany(cRes.data as any);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!highlightedId || loading || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedId, loading]);

  const totalRoles = openings.reduce((s, o) => s + (o.opening_count || 1), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Header — logo + company */}
      <header className="max-w-5xl mx-auto px-6 pt-10 pb-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.company_name}
              className="h-9 w-auto object-contain"
            />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-xs">
              {company.company_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-semibold text-sm tracking-tight">
            {company.company_name}
          </span>
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {company.website_url && (
            <a
              href={company.website_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1"
            >
              Website <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {company.linkedin_url && (
            <a
              href={company.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1"
            >
              LinkedIn <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-6 pb-12">
        <Badge variant="secondary" className="mb-4">
          <Sparkles className="h-3 w-3 mr-1" /> We're hiring
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Build the future of Nigerian operations with us.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          {totalRoles > 0 ? (
            <>
              {totalRoles} open role{totalRoles === 1 ? '' : 's'} across{' '}
              {new Set(openings.map((o) => o.department?.name).filter(Boolean)).size ||
                'multiple'}{' '}
              team{openings.length === 1 ? '' : 's'}. Send your CV and let's talk.
            </>
          ) : (
            <>
              We're always looking for exceptional talent. Send us your CV even if
              you don't see a role that fits.
            </>
          )}
        </p>
      </section>

      {/* Openings list */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading open positions…</p>
        ) : openings.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <Briefcase className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-1">No open positions right now</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                We're not actively hiring but always happy to connect with strong
                candidates. Send us your CV — we'll reach out when something fits.
              </p>
              <a
                href={`mailto:careers@${(company.website_url || 'example.com')
                  .replace(/^https?:\/\/(?:www\.)?/, '')
                  .split('/')[0]}?subject=Speculative application`}
              >
                <Button>Send us your CV</Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openings.map((o) => {
              const domain = (company.website_url || 'example.com')
                .replace(/^https?:\/\/(?:www\.)?/, '')
                .split('/')[0];
              const applyMail = `mailto:careers@${domain}?subject=${encodeURIComponent(
                `Application: ${o.title}`,
              )}&body=${encodeURIComponent(
                `Hi,\n\nI'd like to apply for the ${o.title} role at ${company.company_name}.\n\nMy CV is attached.\n\nRegards,\n`,
              )}`;
              const isHighlighted = o.id === highlightedId;
              return (
                <Card
                  key={o.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={
                    isHighlighted
                      ? 'ring-2 ring-primary shadow-lg transition-shadow'
                      : 'hover:shadow-md transition-shadow'
                  }
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-lg leading-snug">{o.title}</h3>
                        {o.department?.name && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {o.department.name}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className={EMPLOYMENT_TONE[o.employment_type]}
                      >
                        {EMPLOYMENT_LABEL[o.employment_type]}
                      </Badge>
                    </div>

                    <div className="flex items-center flex-wrap gap-3 text-xs text-muted-foreground">
                      {o.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {o.location}
                        </span>
                      )}
                      {o.opening_count > 1 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {o.opening_count} openings
                        </span>
                      )}
                      {o.closing_date && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Closes{' '}
                          {formatDate(o.closing_date)}
                        </span>
                      )}
                    </div>

                    {(o.salary_min_ngn || o.salary_max_ngn) && (
                      <p className="text-sm font-medium currency">
                        {o.salary_min_ngn && o.salary_max_ngn
                          ? `${formatNaira(o.salary_min_ngn)} – ${formatNaira(
                              o.salary_max_ngn,
                            )}`
                          : formatNaira(o.salary_min_ngn || o.salary_max_ngn || 0)}
                        <span className="text-xs text-muted-foreground font-normal ml-1">
                          / year
                        </span>
                      </p>
                    )}

                    {o.description && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {o.description}
                      </p>
                    )}

                    <a
                      href={applyMail}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline pt-1"
                    >
                      Apply now <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-8 border-t text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <span>
          © {new Date().getFullYear()} {company.company_name}
          {company.address ? ` · ${company.address}` : ''}
        </span>
        <div className="flex items-center gap-4">
          <Link to="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default Careers;
