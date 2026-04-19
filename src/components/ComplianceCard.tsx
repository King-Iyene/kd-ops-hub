import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { daysUntil, formatDate, toIsoDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DeadlineRow {
  key: string;
  label: string;
  detail: string;
  due: Date;
}

const STATUTORY_LABELS = {
  paye: 'PAYE',
  pension: 'Pension',
  vat: 'VAT',
} as const;

/**
 * Compute the upcoming statutory deadlines for Nigerian employers.
 *
 * - PAYE: filed monthly, due on the 10th of every month for the prior month.
 *   Reminder issued by KDOps on the 9th.
 * - Pension: remitted monthly by the 7th for the prior month. Reminder on
 *   the 6th.
 * - VAT: filed monthly by the 21st for the prior month. We surface as "last
 *   week of month" awareness in line with the spec.
 */
function nextDeadlines(today = new Date()): DeadlineRow[] {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  // PAYE — 10th of this month, or next month if past
  const payeDay = 10;
  const payeBase =
    d <= payeDay ? new Date(y, m, payeDay) : new Date(y, m + 1, payeDay);

  // Pension — 7th
  const pensionDay = 7;
  const pensionBase =
    d <= pensionDay
      ? new Date(y, m, pensionDay)
      : new Date(y, m + 1, pensionDay);

  // VAT — 21st (filing deadline). Consider "last week of month" reminder
  // window i.e. once we're past 21 we surface next month's.
  const vatDay = 21;
  const vatBase =
    d <= vatDay ? new Date(y, m, vatDay) : new Date(y, m + 1, vatDay);

  return [
    {
      key: 'paye',
      label: STATUTORY_LABELS.paye,
      detail: 'File PAYE return for previous month',
      due: payeBase,
    },
    {
      key: 'pension',
      label: STATUTORY_LABELS.pension,
      detail: 'Remit pension contributions for previous month',
      due: pensionBase,
    },
    {
      key: 'vat',
      label: STATUTORY_LABELS.vat,
      detail: 'File monthly VAT return',
      due: vatBase,
    },
  ];
}

interface TccDoc {
  id: string;
  title: string;
  expires_at: string | null;
}

const ComplianceCard = () => {
  const navigate = useNavigate();
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([]);
  const [tcc, setTcc] = useState<TccDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDeadlines(nextDeadlines());
    // Look for the most recent Tax Clearance Certificate the team uploaded.
    // Heuristic: documents with category in ('compliance','tax','tcc') OR
    // title containing TCC / "tax clearance". Picks the row with the latest
    // expires_at.
    supabase
      .from('documents')
      .select('id, title, category, expires_at')
      .or(
        "category.in.(compliance,tax,tcc),title.ilike.%tax clearance%,title.ilike.%tcc%",
      )
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .then(({ data }) => {
        const row = (data && data[0]) as TccDoc | undefined;
        setTcc(row || null);
        setLoading(false);
      });
  }, []);

  const tccDays = daysUntil(tcc?.expires_at);
  const tccBadgeClass =
    tccDays === null
      ? 'bg-muted text-muted-foreground'
      : tccDays < 0
      ? 'bg-destructive/10 text-destructive'
      : tccDays <= 30
      ? 'bg-warning/10 text-warning'
      : 'bg-success/10 text-success';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Nigerian Compliance
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/compliance')}
        >
          View All Compliance <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {deadlines.map((d) => {
          const days = daysUntil(toIsoDate(d.due));
          const overdue = days !== null && days < 0;
          const urgent = days !== null && days <= 3 && days >= 0;
          return (
            <div
              key={d.key}
              className="flex items-center justify-between border rounded-lg px-3 py-2 kd-transition hover:bg-muted/40"
            >
              <div className="min-w-0 flex items-center gap-2">
                {overdue ? (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {d.label} — {formatDate(d.due)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{d.detail}</p>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  'shrink-0',
                  overdue
                    ? 'bg-destructive/10 text-destructive'
                    : urgent
                    ? 'bg-warning/10 text-warning'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {days === null ? '—' : days < 0 ? `${-days}d overdue` : `in ${days}d`}
              </Badge>
            </div>
          );
        })}

        {/* TCC tracker */}
        <div className="flex items-center justify-between border rounded-lg px-3 py-2 kd-transition hover:bg-muted/40">
          <div className="min-w-0 flex items-center gap-2">
            {loading ? (
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : tcc ? (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-warning shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Tax Clearance Certificate</p>
              <p className="text-xs text-muted-foreground truncate">
                {loading
                  ? 'Loading...'
                  : tcc
                  ? `${tcc.title}${tcc.expires_at ? ` · expires ${formatDate(tcc.expires_at)}` : ''}`
                  : 'Upload your TCC to Documents (category "compliance")'}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className={cn('shrink-0', tccBadgeClass)}>
            {loading
              ? '—'
              : !tcc
              ? 'Missing'
              : tccDays === null
              ? 'No expiry'
              : tccDays < 0
              ? 'Expired'
              : `in ${tccDays}d`}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceCard;
