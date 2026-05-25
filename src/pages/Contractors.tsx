import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/ui-kit/Pagination';
import { ContractorApplications } from '@/components/ContractorApplications';
import PartnerPayCalculator from '@/components/PartnerPayCalculator';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { WhatsAppButton } from '@/components/ui-kit/WhatsAppButton';
import { BulkActionBar } from '@/components/ui-kit/BulkActionBar';
import { Checkbox } from '@/components/ui/checkbox';
import { displayName } from '@/lib/name';
import { formatDate, formatNaira } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Loader2,
  Plus,
  Search,
  Upload,
  Pencil,
  Download,
  UserX,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Check,
  X,
  FileText,
  Info,
  RefreshCw,
  Calculator,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { heyreachDisplayStatus, formatSyncedAt } from '@/lib/heyreach-status';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Papa from 'papaparse';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { NIGERIAN_BANKS, resolveAccount } from '@/lib/paystack';
import { getBankCode, fetchBanks } from '@/lib/nigerian-banks';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { cn } from '@/lib/utils';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  module: string | null;
}

interface Contractor {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  whatsapp_phone: string | null;
  bank_name: string;
  account_number: string;
  account_name: string | null;
  bank_code: string | null;
  default_amount_ngn: number;
  linkedin_id: string;
  linkedin_url: string | null;
  heyreach_email: string | null;
  heyreach_status?: string | null;
  heyreach_active_campaigns?: number | null;
  heyreach_synced_at?: string | null;
  onboarded_at: string | null;
  status: string;
  agreement_signed?: boolean | null;
  kyc_document_uploaded?: boolean | null;
  onboarding_complete?: boolean | null;
  tags?: string[] | null;
}

// Compute a 0–5 onboarding score from the boolean flags + bank format +
// default amount being set. Returned as a {done, total} tuple so callers
// can also render a progress bar.
const onboardingScore = (c: Contractor): { done: number; total: number } => {
  let done = 0;
  const total = 5;
  // 1. Full name set.
  if (c.full_name && c.full_name.trim().length > 0) done++;
  // 2. Bank account looks verified (10-digit number + bank name).
  if (/^\d{10}$/.test(c.account_number || '') && (c.bank_name || '').length > 0)
    done++;
  // 3. LinkedIn ID set.
  if (c.linkedin_id && c.linkedin_id.trim().length > 0) done++;
  // 4. Default amount set.
  if ((c.default_amount_ngn || 0) > 0) done++;
  // 5. Either agreement signed OR KYC document uploaded.
  if (c.agreement_signed || c.kyc_document_uploaded) done++;
  return { done, total };
};

interface ParsedRow {
  rowNumber: number; // 1-based as shown to the user (excluding header)
  raw: Record<string, string>;
  full_name: string;
  bank_name: string;
  /** Bank code resolved via getBankCode(). null if we couldn't map the
   *  user's typed bank name to a known Paystack code — in that case
   *  we can't run Paystack account verify; the row stays importable
   *  but unverified (and gets a warning the admin can override). */
  bank_code: string | null;
  account_number: string;
  default_amount_ngn: number;
  /** LinkedIn login password — persisted as heyreach_password_enc.
   *  Replaced the old linkedin_id field per operator request. */
  linkedin_password: string;
  email: string;
  whatsapp_phone: string;
  linkedin_url: string;
  heyreach_email: string;
  onboarded_at: string | null;
  valid: boolean;
  errors: string[];
  /** Soft warnings — row is still importable but admin should look.
   *  Examples: bank not recognised by Paystack, account name from
   *  Paystack differs from CSV name. */
  warnings: string[];
  /** Bank-verified name from Paystack /bank/resolve. Populated after
   *  the async verify pass. null = not yet verified / verify failed. */
  paystack_name: string | null;
  /** Set true once Paystack /bank/resolve returns a successful match.
   *  Drives the green "Verified" pill in the review table. */
  paystack_verified: boolean;
  /** Operator can override a name-mismatch warning row by row. When
   *  true, the row gets imported even if paystack_verified is false
   *  due to a name mismatch (not a hard error). */
  forcedImport?: boolean;
  /** True when a contractor already exists for this row (matched via the
   *  identifier hierarchy below). On import these rows UPDATE the existing
   *  contractor — and NEVER its bank/payout details. Detected during verify. */
  alreadyExists?: boolean;
  /** id of the existing contractor this row matches. Drives UPDATE by id. */
  existingId?: string;
  /** Internal id carried by a CSV that was exported from this app (the "id"
   *  column). When present and found, it's the safest match key. */
  csvId?: string;
  /** Why this row matched: 'id' | 'email' | 'bank+account' | 'url'. Shown in
   *  the review so a human can sanity-check the match. */
  existingMatchBasis?: string;
  /** True when the row matches MORE THAN ONE existing contractor, or its
   *  keys point at different contractors. Finance safety: such rows are
   *  blocked from auto-import and flagged for manual review. */
  matchAmbiguous?: boolean;
}

const emptyBank: BankAccountValue = {
  bank_name: '',
  account_number: '',
  account_name: '',
  verified: false,
};

// CSV escape: wrap field in quotes if it contains a comma, quote, or newline.
const csvEscape = (v: any): string => {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};


// Case-insensitive bank name matcher; returns the canonical name if found.
const BANK_NAME_LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const b of NIGERIAN_BANKS) {
    m.set(b.name.toLowerCase(), b.name);
    // also accept short forms without suffix like "Bank"
    const short = b.name.replace(/\s*bank\s*$/i, '').trim().toLowerCase();
    if (short) m.set(short, b.name);
  }
  // common aliases
  m.set('gt bank', 'GTBank');
  m.set('gtb', 'GTBank');
  m.set('first bank of nigeria', 'First Bank');
  m.set('stanbic ibtc bank', 'Stanbic IBTC');
  m.set('stanbic', 'Stanbic IBTC');
  m.set('fidelity', 'Fidelity Bank');
  m.set('united bank for africa', 'UBA');
  return m;
})();

const normalizeBankName = (raw: string): string | null => {
  const key = (raw || '').trim().toLowerCase();
  if (!key) return null;
  return BANK_NAME_LOOKUP.get(key) ?? null;
};

// Normalise a LinkedIn URL for matching (drop protocol, www, query, trailing /).
const normLinkedinUrl = (u: string | null | undefined): string => {
  if (!u) return '';
  return u.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');
};

// Fuzzy comparator for "is this the same person?" between the CSV
// name and the bank-verified name. Strips whitespace, lowercases,
// then compares as a sorted-token set so "John Doe" and "DOE JOHN"
// match. Also matches when one is a strict subset of the other (the
// CSV may include a middle name the bank dropped, or vice versa).
function namesAreEquivalent(a: string, b: string): boolean {
  const tok = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort();
  const ta = tok(a);
  const tb = tok(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  // Subset match — every short-side token appears in the long side.
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}

// ───────────────────────── Advanced (CRM-style) filters ─────────────────────
// A flexible field/operator/value rule builder. Rules are ANDed and applied
// server-side. Each field declares its type, which decides the operators on
// offer (text → contains/is/empty…, number → comparisons, select → is/is not).
type AdvOp =
  | 'contains' | 'not_contains' | 'eq' | 'neq' | 'empty' | 'not_empty' | 'gt' | 'lt';

interface AdvField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
}

interface AdvRule {
  id: string;
  field: string;
  op: AdvOp;
  value: string;
}

const ADV_FIELDS: AdvField[] = [
  { key: 'full_name',          label: 'Name',              type: 'text' },
  { key: 'heyreach_email',     label: 'LinkedIn email',    type: 'text' },
  { key: 'email',              label: 'Contact email',     type: 'text' },
  { key: 'whatsapp_phone',     label: 'Phone / WhatsApp',  type: 'text' },
  { key: 'linkedin_url',       label: 'LinkedIn URL',      type: 'text' },
  { key: 'linkedin_id',        label: 'LinkedIn ID',       type: 'text' },
  { key: 'account_number',     label: 'Account number',    type: 'text' },
  { key: 'bank_name',          label: 'Bank',              type: 'text' },
  { key: 'default_amount_ngn', label: 'Default amount (₦)', type: 'number' },
  {
    key: 'heyreach_status', label: 'HeyReach status', type: 'select',
    options: [
      { value: 'active',       label: 'Active' },
      { value: 'disconnected', label: 'Disconnected' },
      { value: 'unmatched',    label: 'Unmatched' },
    ],
  },
];

const OPS_BY_TYPE: Record<AdvField['type'], { value: AdvOp; label: string; needsValue: boolean }[]> = {
  text: [
    { value: 'contains',     label: 'contains',         needsValue: true },
    { value: 'not_contains', label: 'does not contain', needsValue: true },
    { value: 'eq',           label: 'is',               needsValue: true },
    { value: 'neq',          label: 'is not',           needsValue: true },
    { value: 'not_empty',    label: 'is not empty',     needsValue: false },
    { value: 'empty',        label: 'is empty',         needsValue: false },
  ],
  number: [
    { value: 'eq',        label: 'equals',       needsValue: true },
    { value: 'gt',        label: 'greater than', needsValue: true },
    { value: 'lt',        label: 'less than',    needsValue: true },
    { value: 'not_empty', label: 'is set',       needsValue: false },
    { value: 'empty',     label: 'is empty',     needsValue: false },
  ],
  select: [
    { value: 'eq',        label: 'is',         needsValue: true },
    { value: 'neq',       label: 'is not',     needsValue: true },
    { value: 'not_empty', label: 'is set',     needsValue: false },
    { value: 'empty',     label: 'is empty',   needsValue: false },
  ],
};

const advFieldOf = (key: string) => ADV_FIELDS.find((f) => f.key === key);
const opNeedsValue = (field: string, op: AdvOp) =>
  OPS_BY_TYPE[advFieldOf(field)?.type ?? 'text'].find((o) => o.value === op)?.needsValue ?? true;

// A rule counts only when it has a field/op and (a value, when the op needs one).
const advRuleReady = (r: AdvRule) => {
  const f = advFieldOf(r.field);
  if (!f) return false;
  const op = OPS_BY_TYPE[f.type].find((o) => o.value === r.op);
  if (!op) return false;
  return op.needsValue ? r.value.trim() !== '' : true;
};

// Strip PostgREST-significant characters so a value can't break the filter.
const advSanitize = (v: string) => v.replace(/[,()%*]/g, ' ').trim();

// Render a rule as a human-readable chip label, e.g. "LinkedIn email is empty".
const advRuleLabel = (r: AdvRule) => {
  const f = advFieldOf(r.field);
  const op = f && OPS_BY_TYPE[f.type].find((o) => o.value === r.op);
  const base = `${f?.label ?? r.field} ${op?.label ?? r.op}`;
  if (op?.needsValue) {
    if (f?.type === 'select') {
      return `${base} ${f.options?.find((o) => o.value === r.value)?.label ?? r.value}`;
    }
    return `${base} "${r.value}"`;
  }
  return base;
};

// Render a rule as a single PostgREST `or()` token, for "match any" mode where
// every rule must live in one OR clause. Values are sanitised so they can't
// break the filter string. Returns '' for an unknown op (caller filters it).
const advRuleToOrToken = (r: AdvRule): string => {
  const f = advFieldOf(r.field);
  if (!f) return '';
  const isNum = f.type === 'number';
  const v = advSanitize(r.value);
  switch (r.op) {
    case 'contains':     return `${r.field}.ilike.*${v}*`;
    case 'not_contains': return `${r.field}.not.ilike.*${v}*`;
    case 'eq':           return isNum ? `${r.field}.eq.${v}` : `${r.field}.ilike.${v}`;
    case 'neq':          return isNum ? `${r.field}.neq.${v}` : `${r.field}.not.ilike.${v}`;
    case 'gt':           return `${r.field}.gt.${v}`;
    case 'lt':           return `${r.field}.lt.${v}`;
    case 'empty':        return `${r.field}.is.null`;
    case 'not_empty':    return `${r.field}.not.is.null`;
    default:             return '';
  }
};

const Contractors = () => {
  usePageTitle('Contractors');
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  // Bulk selection — Set keeps lookups O(1) when toggling many rows
  // and lets us pass directly into supabase.in() once the user
  // confirms a bulk delete from <BulkActionBar>.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  // ── Server-side pagination ───────────────────────────────────────
  // The list pages on the server (range + exact count) so it scales
  // to any roster size — no client-side cap to outgrow. Search and
  // the status chips are applied server-side too, so they cover the
  // WHOLE directory, not just the loaded page.
  const CONTRACTORS_PAGE_SIZE = 100;
  const [page, setPage] = useState(0); // 0-based
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
    all: 0, active: 0, disconnected: 0, pending: 0, inactive: 0,
  });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    default_amount_ngn: '',
    linkedin_id: '',
    email: '',
    whatsapp_phone: '',
    linkedin_url: '',
    heyreach_email: '',
    heyreach_password: '',
    onboarded_at: '',
  });
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [heyreachFilter, setHeyreachFilter] = useState<'all' | 'active' | 'disconnected' | 'pending' | 'inactive'>('all');
  // Sidebar facets: presence of a LinkedIn email / a LinkedIn link.
  const [emailFilter, setEmailFilter] = useState<'all' | 'has' | 'none'>('all');
  const [linkFilter, setLinkFilter] = useState<'all' | 'has' | 'none'>('all');
  // Advanced (CRM-style) rule builder: `advDraft` is edited in the popover,
  // `advRules` is what the query actually uses (committed via "Apply").
  // `advMatch` = 'all' (AND) or 'any' (OR) across the rules.
  const [advDraft, setAdvDraft] = useState<AdvRule[]>([]);
  const [advRules, setAdvRules] = useState<AdvRule[]>([]);
  const [advMatchDraft, setAdvMatchDraft] = useState<'all' | 'any'>('all');
  const [advMatch, setAdvMatch] = useState<'all' | 'any'>('all');
  const [advOpen, setAdvOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState<Contractor | null>(null);

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialog, setImportDialog] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    created: number;
    updated: number;
    updateFailures: number;
    imported: number;
    failed: number;
    failures: { row: number; name: string; reason: string }[];
  } | null>(null);

  // Apply the active search to a contractors query. Shared by the
  // page fetch and every status-count query so the filter logic
  // lives in one place. Searches name / account / both email fields.
  const applySearch = useCallback((q: any) => {
    const term = debouncedSearch.trim().replace(/[,()%]/g, ' ').trim();
    if (!term) return q;
    return q.or(
      `full_name.ilike.%${term}%,account_number.ilike.%${term}%,email.ilike.%${term}%,heyreach_email.ilike.%${term}%`,
    );
  }, [debouncedSearch]);

  // Translate a display-status chip into server-side conditions.
  // Mirrors heyreachDisplayStatus exactly:
  //   inactive     → status = 'inactive'
  //   active       → not inactive AND heyreach_status = 'active'
  //   disconnected → not inactive AND heyreach_status = 'disconnected'
  //   pending      → not inactive AND heyreach_status NOT IN
  //                  ('active','disconnected')  (incl. null/unmatched)
  const applyStatusFilter = useCallback((q: any, key: string) => {
    if (key === 'inactive') return q.eq('status', 'inactive');
    if (key === 'active') return q.neq('status', 'inactive').eq('heyreach_status', 'active');
    if (key === 'disconnected') return q.neq('status', 'inactive').eq('heyreach_status', 'disconnected');
    if (key === 'pending') {
      return q.neq('status', 'inactive')
        .or('heyreach_status.is.null,heyreach_status.not.in.(active,disconnected)');
    }
    return q; // 'all'
  }, []);

  // Sidebar quick facets (LinkedIn email / LinkedIn link presence) plus the
  // advanced rule builder. The "email" the team works from is the LinkedIn
  // email (heyreach_email) — the contact email is only an advanced field.
  const applyFieldFilters = useCallback((q: any) => {
    if (emailFilter === 'has') q = q.not('heyreach_email', 'is', null).neq('heyreach_email', '');
    else if (emailFilter === 'none') q = q.is('heyreach_email', null);
    if (linkFilter === 'has') q = q.not('linkedin_url', 'is', null).neq('linkedin_url', '');
    else if (linkFilter === 'none') q = q.is('linkedin_url', null);

    // Advanced rules. "empty" matches NULL (absent values are stored NULL).
    const readyRules = advRules.filter(advRuleReady);
    if (readyRules.length > 0 && advMatch === 'any') {
      // Match ANY → one OR clause (its own AND-ed group alongside the facets).
      const tokens = readyRules.map(advRuleToOrToken).filter(Boolean);
      if (tokens.length > 0) q = q.or(tokens.join(','));
    } else {
      // Match ALL → each rule is its own clause via direct query methods.
      for (const r of readyRules) {
        const f = advFieldOf(r.field)!;
        const isNum = f.type === 'number';
        const v = advSanitize(r.value);
        switch (r.op) {
          case 'contains':     q = q.ilike(r.field, `%${v}%`); break;
          case 'not_contains': q = q.not(r.field, 'ilike', `%${v}%`); break;
          case 'eq':           q = isNum ? q.eq(r.field, Number(v)) : q.ilike(r.field, v); break;
          case 'neq':          q = isNum ? q.neq(r.field, Number(v)) : q.not(r.field, 'ilike', v); break;
          case 'gt':           q = q.gt(r.field, Number(v)); break;
          case 'lt':           q = q.lt(r.field, Number(v)); break;
          case 'empty':        q = q.is(r.field, null); break;
          case 'not_empty':    q = q.not(r.field, 'is', null).neq(r.field, ''); break;
        }
      }
    }
    return q;
  }, [emailFilter, linkFilter, advRules, advMatch]);

  const fetchContractors = useCallback(async () => {
    setLoading(true);
    const from = page * CONTRACTORS_PAGE_SIZE;
    const to = from + CONTRACTORS_PAGE_SIZE - 1;

    let q = supabase
      .from('contractors')
      .select('*', { count: 'exact' })
      .neq('status', 'deleted')
      .neq('is_anonymised', true);
    q = applySearch(q);
    q = applyStatusFilter(q, heyreachFilter);
    q = applyFieldFilters(q);
    q = q.order('full_name').range(from, to);

    const [contractorsRes, tagsRes] = await Promise.all([
      q,
      supabase.from('tags').select('*').or('module.eq.all,module.eq.contractor').order('name').limit(200),
    ]);
    setContractors((contractorsRes.data as Contractor[]) || []);
    setTotalCount(contractorsRes.count ?? 0);
    setAvailableTags((tagsRes.data as Tag[]) || []);
    setLoading(false);
  }, [page, heyreachFilter, applySearch, applyStatusFilter, applyFieldFilters]);

  // Per-chip counts across the WHOLE directory (respecting the active
  // search). Count-only queries (head: true) — cheap, no rows pulled.
  const fetchStatusCounts = useCallback(async () => {
    const base = () =>
      applyFieldFilters(
        applySearch(
          supabase
            .from('contractors')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'deleted')
            .neq('is_anonymised', true),
        ),
      );
    const [all, active, disconnected, pending, inactive] = await Promise.all([
      base(),
      applyStatusFilter(base(), 'active'),
      applyStatusFilter(base(), 'disconnected'),
      applyStatusFilter(base(), 'pending'),
      applyStatusFilter(base(), 'inactive'),
    ]);
    setStatusCounts({
      all: all.count ?? 0,
      active: active.count ?? 0,
      disconnected: disconnected.count ?? 0,
      pending: pending.count ?? 0,
      inactive: inactive.count ?? 0,
    });
  }, [applySearch, applyStatusFilter, applyFieldFilters]);

  // Reload the page rows AND the chip counts. Use after any mutation
  // (delete, import, deactivate, edit) so both stay in sync.
  const reloadAll = useCallback(() => {
    fetchContractors();
    fetchStatusCounts();
  }, [fetchContractors, fetchStatusCounts]);

  // Reset to page 0 whenever the search or status filter changes, so
  // the operator isn't stranded on a page that no longer exists.
  useEffect(() => { setPage(0); }, [debouncedSearch, heyreachFilter, emailFilter, linkFilter, advRules, advMatch]);

  useEffect(() => {
    fetchContractors();
  }, [fetchContractors]);

  useEffect(() => {
    fetchStatusCounts();
  }, [fetchStatusCounts]);

  const fetchLastSync = useCallback(async () => {
    const { data } = await supabase
      .from('heyreach_sync_log')
      .select('finished_at, started_at')
      .eq('ok', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastSyncAt((data as any)?.finished_at ?? (data as any)?.started_at ?? null);
  }, []);

  useEffect(() => {
    fetchLastSync();
  }, [fetchLastSync]);

  const runHeyReachSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('heyreach-sync', {
        body: { triggered_by: 'manual' },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast({
          title: 'Sync could not complete',
          description: data?.error || 'HeyReach did not respond. No contractor data was changed.',
          variant: 'destructive',
        });
        return;
      }
      const changes = (data.changes || []) as Array<{ name: string; to: string }>;
      const summary = changes.length
        ? changes.slice(0, 5).map((c) => `${c.name} → ${c.to}`).join(', ') +
          (changes.length > 5 ? ` +${changes.length - 5} more` : '')
        : 'No status changes detected.';

      // How many couldn't be matched to a HeyReach sender account? Surface the
      // count AND the reason, since "has an email but still pending" is the
      // usual confusion: matching is on the LinkedIn Email / URL, not the
      // general contact email.
      const { count: pendingCount } = await applyStatusFilter(
        supabase
          .from('contractors')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'deleted')
          .neq('is_anonymised', true),
        'pending',
      );

      toast({
        title: `HeyReach sync complete — ${changes.length} updated`,
        description: pendingCount
          ? `${summary} · ${pendingCount} still pending — no matching HeyReach account. Matching uses each contractor's LinkedIn Email / URL (not their contact email). Open the Pending filter to see why.`
          : summary,
      });
      await Promise.all([fetchContractors(), fetchStatusCounts(), fetchLastSync()]);
    } catch (err: any) {
      toast({
        title: 'Sync failed',
        description: err?.message || 'Could not reach the sync function.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ first_name: '', last_name: '', default_amount_ngn: '', linkedin_id: '', email: '', whatsapp_phone: '', linkedin_url: '', heyreach_email: '', heyreach_password: '', onboarded_at: '' });
    setBank(emptyBank);
    setSelectedTagIds([]);
  };

  const handleSave = async () => {
    if (!bank.verified) {
      toast({
        title: 'Verify the account first',
        description: 'The bank account must be verified via Paystack before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const computedFullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim() || bank.account_name;
    const payload = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      full_name: computedFullName,
      bank_name: bank.bank_name,
      account_number: bank.account_number,
      default_amount_ngn: parseFloat(form.default_amount_ngn) || 0,
      status: 'active',
      tags: selectedTagIds,
      ...(!editing ? {
        account_name: bank.account_name || null,
        email: form.email.trim() || null,
        whatsapp_phone: form.whatsapp_phone.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        heyreach_email: form.heyreach_email.trim() || null,
        heyreach_password_enc: form.heyreach_password.trim() || null,
        onboarded_at: form.onboarded_at || null,
      } : {}),
    };

    try {
      if (editing) {
        const { error } = await supabase.from('contractors').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('contractor_edited', `Contractor "${payload.full_name}" updated`, profile);
        toast({ title: 'Contractor updated' });
      } else {
        const { error } = await supabase.from('contractors').insert(payload);
        if (error) throw error;
        await logAudit('contractor_added', `Contractor "${payload.full_name}" added`, profile);
        toast({ title: 'Contractor added' });
      }
      setShowForm(false);
      resetForm();
      reloadAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (c: Contractor) => {
    setEditing(c);
    setForm({
      first_name: c.first_name || (c.full_name || '').split(' ')[0] || '',
      last_name: c.last_name || (c.full_name || '').split(' ').slice(1).join(' ') || '',
      default_amount_ngn: String(c.default_amount_ngn),
    });
    setBank({
      bank_name: c.bank_name,
      account_number: c.account_number,
      account_name: c.full_name,
      verified: false,
    });
    setSelectedTagIds(c.tags || []);
    setShowForm(true);
  };

  const toggleStatus = async (c: Contractor) => {
    setContractors((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: 'inactive' as const } : x)));
    const { error } = await supabase.from('contractors').update({ status: 'inactive' }).eq('id', c.id);
    if (error) {
      setContractors((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: 'active' as const } : x)));
      toast({ title: 'Deactivation failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('contractor_deactivated', `Contractor "${c.full_name}" deactivated`, profile);
    toast({ title: 'Contractor deactivated' });
    reloadAll();
  };

  const reactivateContractor = async (c: Contractor) => {
    const { error } = await supabase.from('contractors').update({ status: 'active' }).eq('id', c.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('contractor_edited', `Contractor "${c.full_name}" reactivated`, profile);
    toast({ title: 'Contractor reactivated' });
    setConfirmReactivate(null);
    reloadAll();
  };

  // --- CSV export ---------------------------------------------------

  const [exportingCsv, setExportingCsv] = useState(false);

  const exportCsv = async () => {
    setExportingCsv(true);
    try {
      const { data: rows, error } = await supabase
        .from('contractors')
        .select('id, full_name, first_name, last_name, email, whatsapp_phone, linkedin_url, heyreach_email, heyreach_password_enc, bank_name, bank_code, account_number, account_name, default_amount_ngn, onboarded_at, tags, notes, status, created_at')
        // Match the list's visibility — exclude deleted + anonymised
        // contractors so the export doesn't resurrect rows the
        // operator removed. (The list query in fetchContractors
        // applies the same two filters.)
        .neq('status', 'deleted')
        .neq('is_anonymised', true)
        .order('full_name');
      if (error) throw error;
      // full_name leads the export and is ALWAYS populated (derived
      // from first/last when the stored full_name is blank, or vice
      // versa). This is the column the importer reads, so an
      // export → re-import round-trip preserves names.
      // linkedin_password carries heyreach_password_enc — the field
      // the operator actually tracks (the LinkedIn login used for
      // HeyReach automation). Replaced the old linkedin_id column
      // per operator request. Yes, this writes the password in plain
      // text — the operator accepted that tradeoff for bulk editing.
      // `id` leads the export so a re-imported file matches the exact
      // contractor (safest dedup key). It's ignored when preparing a brand-new
      // CSV by hand (the column simply won't be present).
      const header = ['id', 'full_name', 'first_name', 'last_name', 'linkedin_email', 'email', 'whatsapp_phone', 'linkedin_url', 'linkedin_password', 'bank_name', 'bank_code', 'account_number', 'account_name', 'default_amount_ngn', 'onboarded_at', 'tags', 'notes', 'status', 'created_at'];
      const csvRows = (rows as any[]).map((r) => {
        const stored = (r.full_name || '').trim();
        const composed = `${(r.first_name || '').trim()} ${(r.last_name || '').trim()}`.trim();
        // Prefer stored full_name; fall back to first+last; final
        // fallback to the bank-verified account_name so the row is
        // never nameless.
        const fullName = stored || composed || (r.account_name || '').trim();
        const parts = fullName.split(/\s+/);
        const firstName = (r.first_name || parts[0] || '').trim();
        const lastName = (r.last_name || parts.slice(1).join(' ') || '').trim();
        const out = {
          ...r,
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          linkedin_password: r.heyreach_password_enc || '',
          // CSV column is "linkedin_email" — what the operator calls
          // this field. The underlying DB column is heyreach_email
          // (wired to HeyReach's API), which we deliberately do NOT
          // rename. Just surface it under the operator-facing name.
          linkedin_email: r.heyreach_email || '',
        };
        return header.map((col) => csvEscape(out[col])).join(',');
      });
      const csv = [header.join(','), ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contractors-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExportingCsv(false);
    }
  };

  // --- CSV import flow ---------------------------------------------------

  const downloadSample = () => {
    // linkedin_email comes BEFORE email per operator preference — it's
    // their primary email. Column order is defined once here and rows
    // are emitted by key (below) so the order can't drift between the
    // header and the data.
    const header = ['full_name', 'linkedin_email', 'email', 'whatsapp_phone', 'bank_name', 'account_number', 'default_amount_ngn', 'linkedin_password', 'linkedin_url', 'onboarded_at'];
    // Example rows. linkedin_email is the PRIMARY email and is filled
    // on most rows; the general `email` column is optional (shown
    // blank on several rows to signal that). full_name + bank_name +
    // account_number are the only required fields — everything else
    // is optional. Banks span commercial / fintech / MFB / PSB so the
    // operator sees the exact spelling each category needs.
    const sampleRows: Record<string, string>[] = [
      { full_name: 'Chinwe Okafor',    linkedin_email: 'chinwe@gmail.com',     email: 'chinwe@example.com',  whatsapp_phone: '+2348012345678', bank_name: 'GTBank',                                 account_number: '0123456789', default_amount_ngn: '150000', linkedin_password: 'LinkedInPass123', linkedin_url: 'https://linkedin.com/in/chinwe-okafor',    onboarded_at: '2026-01-15' },
      { full_name: 'Adewale Ogunleye', linkedin_email: 'adewale@gmail.com',    email: '',                    whatsapp_phone: '+2348023456789', bank_name: 'Access Bank',                            account_number: '0234567890', default_amount_ngn: '200000', linkedin_password: 'MyLinkedInPwd!',  linkedin_url: 'https://linkedin.com/in/adewale-ogunleye', onboarded_at: '' },
      { full_name: 'Ifeoma Nwachukwu', linkedin_email: 'ifeoma@gmail.com',     email: '',                    whatsapp_phone: '',               bank_name: 'Zenith Bank',                            account_number: '0345678901', default_amount_ngn: '175000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Tunde Bello',      linkedin_email: 'tunde@outlook.com',    email: 'tunde@example.com',   whatsapp_phone: '+2348034567890', bank_name: 'First Bank of Nigeria',                  account_number: '0456789012', default_amount_ngn: '180000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Amaka Eze',        linkedin_email: 'amaka@gmail.com',      email: '',                    whatsapp_phone: '+2348045678901', bank_name: 'United Bank for Africa (UBA)',           account_number: '0567890123', default_amount_ngn: '160000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Femi Adekunle',    linkedin_email: 'femi@yahoo.com',       email: '',                    whatsapp_phone: '+2348056789012', bank_name: 'Stanbic IBTC Bank',                      account_number: '0678901234', default_amount_ngn: '220000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Ngozi Obi',        linkedin_email: 'ngozi@gmail.com',      email: '',                    whatsapp_phone: '',               bank_name: 'First City Monument Bank (FCMB)',        account_number: '0789012345', default_amount_ngn: '140000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Sade Williams',    linkedin_email: 'sade@gmail.com',       email: '',                    whatsapp_phone: '+2348078901234', bank_name: 'Kuda Microfinance Bank',                 account_number: '0890123456', default_amount_ngn: '170000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Yusuf Ibrahim',    linkedin_email: 'yusuf@gmail.com',      email: '',                    whatsapp_phone: '+2348089012345', bank_name: 'Moniepoint Microfinance Bank',           account_number: '0901234567', default_amount_ngn: '155000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Blessing Okon',    linkedin_email: 'blessing@gmail.com',   email: '',                    whatsapp_phone: '',               bank_name: 'OPay Digital Services Limited (OPay)',   account_number: '7012345678', default_amount_ngn: '165000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Emeka Anwah',      linkedin_email: 'emeka@gmail.com',      email: '',                    whatsapp_phone: '',               bank_name: 'PalmPay',                                account_number: '8012345678', default_amount_ngn: '145000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
      { full_name: 'Tobi Adeyemi',     linkedin_email: 'tobi@gmail.com',       email: 'tobi@example.com',    whatsapp_phone: '+2348112345678', bank_name: 'Sterling Bank',                          account_number: '0023456789', default_amount_ngn: '195000', linkedin_password: '',                linkedin_url: '',                                         onboarded_at: '' },
    ];
    const rows = sampleRows.map((r) => header.map((col) => r[col] ?? ''));
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kdops-contractors-sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // One-click "give me everything" — downloads the sample template
  // AND the supported-banks reference together, so the operator
  // doesn't have to pick between them. Sample fires first (sync),
  // then the bank list (async — it fetches the live Paystack list).
  // Separate reference download — one row per supported bank with
  // the EXACT canonical name the platform recognises. Pulls the
  // DYNAMIC Paystack-fetched list (300+ banks including every MFB /
  // PSB / fintech Paystack supports), NOT just the 55-bank static
  // fallback. Same source the bank picker dropdown reads from, so
  // operators get the same list they'd see if they typed it manually.
  // Falls back to NIGERIAN_BANKS only if Paystack /bank/list is
  // unreachable (offline, edge function down).
  const [exportingBanks, setExportingBanks] = useState(false);
  const downloadBankReference = async () => {
    setExportingBanks(true);
    let banks = NIGERIAN_BANKS;
    try {
      // fetchBanks returns the full dynamic list (cached 24h) and
      // updates _allBanks so getBankCode() benefits next time too.
      banks = await fetchBanks();
    } catch {
      // Stay on static fallback — operator still gets 55 names which
      // is better than nothing.
    }
    const header = ['bank_name', 'paystack_code', 'category'];
    const rows = banks.map((b) => [
      b.name,
      b.code,
      // Tag fintech / MFB / PSB so the operator can filter Excel.
      /microfinance|mfb/i.test(b.name)
        ? 'MFB'
        : /psb|payment service bank|momo|smartcash/i.test(b.name)
          ? 'PSB'
          : /opay|palmpay|kuda|carbon|alat|paga|moniepoint|fairmoney|sparkle|vfd|rubies|eyowo|renmoney|tangerine|branch|baobab|bellbank|berachah|boost|bosak/i.test(b.name)
            ? 'Fintech / Neo-bank'
            : 'Commercial',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kdops-supported-banks.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportingBanks(false);
    toast({
      title: 'Bank list downloaded',
      description: `${banks.length} banks exported${banks.length === NIGERIAN_BANKS.length ? ' (static fallback — Paystack /bank/list unreachable)' : ' from Paystack'}.`,
    });
  };

  // One-click "give me everything" — downloads the sample template
  // AND the supported-banks reference together. Defined after both
  // so it doesn't reference them before definition.
  const downloadAllTemplates = async () => {
    downloadSample();
    await downloadBankReference();
  };

  const validateRow = (raw: Record<string, string>, rowNumber: number): ParsedRow => {
    // Accept a full_name column OR first_name + last_name columns
    // (the export emits both). Combining first+last makes an
    // exported file re-import cleanly — previously the importer
    // only looked at full_name, so an export's first_name/last_name
    // columns were ignored and every name came in blank.
    const composedName = `${(raw.first_name || '').trim()} ${(raw.last_name || '').trim()}`.trim();
    const full_name = (raw.full_name || raw.name || composedName || '').trim();
    const bank_raw = (raw.bank_name || raw.bank || '').trim();
    const account_number = (raw.account_number || raw.account || '').trim();
    const amount_raw = raw.default_amount_ngn ?? raw.amount ?? '0';
    const default_amount_ngn = parseFloat(String(amount_raw).replace(/,/g, '')) || 0;
    const email = (raw.email || '').trim();
    const whatsapp_phone = (raw.whatsapp_phone || raw.phone || '').trim();
    const linkedin_url = (raw.linkedin_url || '').trim();
    // LinkedIn Email (stored as heyreach_email). Operator treats this
    // as the primary email: when the linkedin_email / heyreach_email
    // column is blank, fall back to the general `email` column so a
    // single email in the CSV populates BOTH the Email and LinkedIn
    // Email fields. An explicit linkedin_email still wins if provided.
    const heyreach_email = (raw.heyreach_email || raw.linkedin_email || email || '').trim();
    // LinkedIn login password (stored encrypted as heyreach_password_enc).
    // Accept linkedin_password (new column) or the legacy linkedin_id
    // column so files exported before the rename still import.
    const linkedin_password = (raw.linkedin_password || raw.linkedin_id || '').trim();
    const onboarded_at = (raw.onboarded_at || '').trim() || null;
    // Internal id, only present when re-importing a CSV exported from this app.
    const csvId = (raw.id || raw.contractor_id || '').trim();

    const errors: string[] = [];
    const warnings: string[] = [];
    if (!full_name) errors.push('Full name is required');

    // Bank handling — the previous version rejected unknown bank
    // names with a hard error. Operator pointed out that's wrong:
    // Paystack supports 300+ banks including microfinance and PSBs
    // whose names drift, so the right behaviour is to ACCEPT any
    // typed bank name, attempt to resolve via Paystack on import,
    // and only warn if we can't. Two layers:
    //   1. normalizeBankName — fast static lookup, used for the
    //      display name (so "gtb" canonicalises to "GTBank")
    //   2. getBankCode — fuzzy match against the dynamic Paystack
    //      bank list. Used to drive the /bank/resolve account-
    //      verify call. If null, we couldn't map to a Paystack
    //      code and verify gets skipped (warning, not error).
    const canonicalBank = normalizeBankName(bank_raw);
    const bank_code = getBankCode(bank_raw) ?? null;
    if (!bank_raw) {
      errors.push('Bank name is required');
    } else if (!bank_code) {
      warnings.push(`Bank "${bank_raw}" not recognised by Paystack — account number cannot be verified before import.`);
    }

    if (!/^\d{10}$/.test(account_number)) {
      errors.push('Account number must be exactly 10 digits');
    }

    return {
      rowNumber,
      raw,
      full_name,
      bank_name: canonicalBank ?? bank_raw,
      bank_code,
      account_number,
      default_amount_ngn,
      linkedin_password,
      email,
      whatsapp_phone,
      linkedin_url,
      heyreach_email,
      onboarded_at,
      csvId: csvId || undefined,
      valid: errors.length === 0,
      errors,
      warnings,
      paystack_name: null,
      paystack_verified: false,
    };
  };

  // ── Paystack account verification (batched) ──────────────────────
  //
  // After the CSV is parsed, kick off /bank/resolve for every row
  // that has a bank_code + a 10-digit account_number. Verify in
  // batches with throttling so we don't slam Paystack with 750
  // calls in one tick. Each successful resolve writes paystack_name
  // back onto the row; a mismatch with the CSV full_name becomes a
  // soft warning the operator can force-push past.
  const [verifying, setVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 });

  const verifyRows = useCallback(async (rows: ParsedRow[]) => {
    // ── Duplicate detection (finance-safe, precision-first) ──────────
    // Match each row to an existing contractor using an identifier
    // hierarchy, highest-confidence first:
    //   1. internal id     (only present in a CSV exported from this app)
    //   2. LinkedIn Email
    //   3. bank_code + account_number TOGETHER (never account # alone —
    //      the same number can belong to a different person at another bank)
    //   4. normalised LinkedIn URL
    // If a key matches more than one contractor, OR different keys point at
    // different contractors, the row is flagged AMBIGUOUS and blocked from
    // auto-import (we never guess who gets paid). A confident match UPDATEs
    // the existing contractor — but NEVER its bank/payout details.
    let working = rows;
    try {
      const { data: existing } = await supabase
        .from('contractors')
        .select('id, heyreach_email, account_number, bank_code, linkedin_url')
        .neq('status', 'deleted')
        .neq('is_anonymised', true)
        .limit(5000);

      const exlist = (existing || []) as Array<{
        id: string; heyreach_email: string | null; account_number: string | null;
        bank_code: string | null; linkedin_url: string | null;
      }>;
      const idSet = new Set(exlist.map((e) => e.id));
      const byEmail = new Map<string, string[]>();
      const byAcct = new Map<string, string[]>();
      const byUrl = new Map<string, string[]>();
      const push = (m: Map<string, string[]>, k: string, id: string) => {
        if (!k) return;
        const arr = m.get(k);
        if (arr) { if (!arr.includes(id)) arr.push(id); } else m.set(k, [id]);
      };
      for (const e of exlist) {
        const em = (e.heyreach_email || '').trim().toLowerCase();
        if (em) push(byEmail, em, e.id);
        if (e.bank_code && /^\d{10}$/.test(e.account_number || '')) {
          push(byAcct, `${e.bank_code}|${e.account_number}`, e.id);
        }
        const url = normLinkedinUrl(e.linkedin_url);
        if (url) push(byUrl, url, e.id);
      }

      working = rows.map((r) => {
        const matches: { basis: string; ids: string[] }[] = [];
        if (r.csvId && idSet.has(r.csvId)) matches.push({ basis: 'id', ids: [r.csvId] });
        const em = (r.heyreach_email || '').trim().toLowerCase();
        if (em && byEmail.has(em)) matches.push({ basis: 'email', ids: byEmail.get(em)! });
        if (r.bank_code && /^\d{10}$/.test(r.account_number)) {
          const k = `${r.bank_code}|${r.account_number}`;
          if (byAcct.has(k)) matches.push({ basis: 'bank+account', ids: byAcct.get(k)! });
        }
        const url = normLinkedinUrl(r.linkedin_url);
        if (url && byUrl.has(url)) matches.push({ basis: 'url', ids: byUrl.get(url)! });

        if (matches.length === 0) return r; // brand new

        const distinct = new Set(matches.flatMap((m) => m.ids));
        const multi = matches.some((m) => m.ids.length > 1);
        if (multi || distinct.size > 1) {
          return {
            ...r,
            matchAmbiguous: true,
            valid: false,
            errors: [...r.errors, 'Matches more than one contractor — resolve manually'],
          };
        }
        const [id] = [...distinct];
        return { ...r, alreadyExists: true, existingId: id, existingMatchBasis: matches[0].basis };
      });
    } catch {
      // Best-effort — if the dedup lookup fails, fall through and let the
      // import proceed (duplicates are recoverable; blocking the whole
      // import on a transient query error is worse).
    }

    const candidates = working
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => !r.alreadyExists && r.bank_code && /^\d{10}$/.test(r.account_number));

    if (candidates.length === 0) return working;

    setVerifying(true);
    setVerifyProgress({ done: 0, total: candidates.length });

    // Concurrency guard — Paystack rate-limits at ~10 req/s for
    // /bank/resolve. We cap at 4 in flight to stay well under that
    // and leave headroom for any other calls happening concurrently
    // (manual recipient creation, balance fetch, etc.).
    const CONCURRENCY = 4;
    const next = [...working];
    let cursor = 0;
    let completed = 0;

    const worker = async () => {
      while (cursor < candidates.length) {
        const myIdx = cursor++;
        const { r, idx } = candidates[myIdx];
        try {
          const result = await resolveAccount(r.account_number, r.bank_code!);
          const psName = result?.account_name?.trim() || '';
          next[idx] = {
            ...next[idx],
            paystack_name: psName || null,
            paystack_verified: !!psName && namesAreEquivalent(r.full_name, psName),
          };
          if (psName && !namesAreEquivalent(r.full_name, psName)) {
            next[idx].warnings = [
              ...next[idx].warnings,
              `Bank name on Paystack is "${psName}" — different from CSV "${r.full_name}".`,
            ];
          }
        } catch (err: any) {
          // /bank/resolve returns 422 if the account doesn't exist at
          // the bank, 400 if the bank code is wrong. Treat both as
          // a soft warning — operator can still force the row through
          // if they're confident the details are correct (e.g. just-
          // opened account that Paystack hasn't indexed yet).
          next[idx] = {
            ...next[idx],
            paystack_name: null,
            paystack_verified: false,
            warnings: [
              ...next[idx].warnings,
              `Paystack could not verify this account (${err?.message || 'unknown error'}).`,
            ],
          };
        } finally {
          completed++;
          setVerifyProgress({ done: completed, total: candidates.length });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    setVerifying(false);
    return next;
  }, []);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportSummary(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: async (results) => {
        const rows = (results.data || []).map((row, idx) => validateRow(row, idx + 1));
        setParsedRows(rows);
        setImportDialog(true);
        // Reset the input so the same file can be re-picked later.
        if (fileInputRef.current) fileInputRef.current.value = '';
        // Fire Paystack /bank/resolve in the background. The review
        // dialog opens immediately with rows in their CSV-validated
        // state; verification results stream in over the next few
        // seconds and update the table in place.
        const verified = await verifyRows(rows);
        setParsedRows(verified);
      },
      error: (err) => {
        toast({
          title: 'Could not parse CSV',
          description: err.message,
          variant: 'destructive',
        });
      },
    });
  };

  const confirmImport = async () => {
    // A row is importable if:
    //   • it has no hard errors (full_name, account_number)
    //   • AND it's not stuck on an un-forced name mismatch
    // The bank-name unknown / Paystack-couldn't-verify cases are
    // warnings only — they import without needing force.
    // Import gating (operator policy):
    //   • Hard errors (no name, bad account number)  → never import
    //   • Paystack returned a name (account exists):
    //       - name matches                           → import
    //       - name differs slightly                  → import + WARN
    //         (no checkbox — a verified account with a different
    //          registered name is fine, just flagged)
    //   • Paystack could NOT resolve the account (doesn't exist /
    //     invalid / bank unrecognised)               → BLOCK, unless
    //     an admin explicitly ticks "Import anyway" (escape hatch for
    //     brand-new accounts Paystack hasn't indexed yet).
    // A row is processable (insert OR update) when it passes the
    // verification gate. Existing rows (alreadyExists) UPDATE the
    // matched contractor; new rows INSERT.
    //   • Hard errors                              → never processed
    //   • Already exists (matched by account #)    → UPDATE
    //   • Paystack returned a name (account exists) → INSERT
    //   • Paystack couldn't resolve                → BLOCK unless the
    //     admin ticks "Import anyway"
    const isImportable = (r: ParsedRow) => {
      if (r.errors.length > 0) return false;
      if (r.alreadyExists) return true;          // update path
      if (r.paystack_name) return true;          // verified, insert
      return !!r.forcedImport;                   // override for unverified
    };
    const valid = parsedRows.filter(isImportable);
    const invalid = parsedRows.filter((r) => !isImportable(r));

    if (valid.length === 0) {
      toast({
        title: 'Nothing to import',
        description: 'All rows have validation errors or need a manual "Import anyway" tick.',
        variant: 'destructive',
      });
      return;
    }

    // Build the writable field set for one row. Shared by insert
    // (full row) and update (same fields, matched by id).
    const fieldsFor = (r: ParsedRow) => {
      const nameParts = r.full_name.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      return {
        full_name: r.full_name,
        first_name: firstName || null,
        last_name: lastName || null,
        bank_name: r.bank_name,
        bank_code: r.bank_code,
        account_number: r.account_number,
        account_name: r.paystack_name || r.full_name,
        default_amount_ngn: r.default_amount_ngn,
        heyreach_password_enc: r.linkedin_password || null,
        email: r.email || null,
        whatsapp_phone: r.whatsapp_phone || null,
        linkedin_url: r.linkedin_url || null,
        heyreach_email: r.heyreach_email || null,
        onboarded_at: r.onboarded_at || null,
      };
    };

    // For UPDATES to an existing contractor, deliberately omit the bank /
    // payout fields (bank_name, bank_code, account_number, account_name). An
    // import must never silently change where money is sent — payout details
    // can only be changed through the verified bank-change flow on the profile.
    const updateFieldsFor = (r: ParsedRow) => {
      const { bank_name, bank_code, account_number, account_name, ...rest } = fieldsFor(r);
      void bank_name; void bank_code; void account_number; void account_name;
      return rest;
    };

    const toInsert = valid.filter((r) => !r.existingId);
    const toUpdate = valid.filter((r) => !!r.existingId);

    setImporting(true);
    try {
      // 1. Insert brand-new contractors in one batch.
      if (toInsert.length > 0) {
        const insertPayload = toInsert.map((r) => ({ ...fieldsFor(r), status: 'active' as const }));
        const { error } = await supabase.from('contractors').insert(insertPayload);
        if (error) {
          toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
          setImporting(false);
          return;
        }
      }

      // 2. Update existing contractors by id, in parallel. status is
      //    NOT touched on update — an import shouldn't silently
      //    reactivate a contractor someone deactivated.
      let updateFailures = 0;
      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map(async (r) => {
            const { error } = await supabase
              .from('contractors')
              .update(updateFieldsFor(r))
              .eq('id', r.existingId!);
            if (error) updateFailures++;
          }),
        );
      }

      await logAudit(
        'contractor_added',
        `CSV import: ${toInsert.length} added, ${toUpdate.length} updated` +
          (invalid.length ? ` (${invalid.length} blocked)` : '') +
          (updateFailures ? ` — ${updateFailures} update(s) failed` : ''),
        profile,
      );

      setImportSummary({
        created: toInsert.length,
        updated: toUpdate.length - updateFailures,
        updateFailures,
        imported: valid.length,
        failed: invalid.length,
        failures: invalid.map((r) => ({
          row: r.rowNumber,
          name: r.full_name || '(no name)',
          reason: r.errors.length ? r.errors.join(', ') : 'Account could not be verified',
        })),
      });
      toast({
        title: 'Import complete',
        description: `${toInsert.length} added, ${toUpdate.length} updated${updateFailures ? `, ${updateFailures} update(s) failed` : ''}.`,
      });
      reloadAll();
    } finally {
      setImporting(false);
    }
  };

  const closeImportDialog = () => {
    setImportDialog(false);
    setParsedRows([]);
    setImportFileName('');
    setImportSummary(null);
  };

  // Download the skipped/blocked rows as a CSV so the operator can fix and
  // re-upload — the recommended pattern for import error reporting.
  const downloadImportErrors = () => {
    if (!importSummary?.failures.length) return;
    const header = ['row', 'name', 'error'];
    const lines = [
      header.join(','),
      ...importSummary.failures.map((f) => [f.row, f.name, f.reason].map(csvEscape).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Advanced filter handlers ──────────────────────────────────────────────
  const newAdvRule = (): AdvRule => ({ id: crypto.randomUUID(), field: 'full_name', op: 'contains', value: '' });

  const updateAdvRule = (id: string, patch: Partial<AdvRule>) =>
    setAdvDraft((d) => d.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      // Switching field resets to that type's first operator + clears value.
      if (patch.field && patch.field !== r.field) {
        const t = advFieldOf(patch.field)?.type ?? 'text';
        next.op = OPS_BY_TYPE[t][0].value;
        next.value = '';
      }
      return next;
    }));

  const applyAdvFilters = () => {
    setAdvRules(advDraft.filter(advRuleReady));
    setAdvMatch(advMatchDraft);
    setAdvOpen(false);
  };

  const clearAdvFilters = () => {
    setAdvDraft([]); setAdvRules([]);
    setAdvMatchDraft('all'); setAdvMatch('all');
  };

  // Remove one applied rule from its chip — keep the draft in sync.
  const removeAppliedRule = (id: string) => {
    setAdvRules((r) => r.filter((x) => x.id !== id));
    setAdvDraft((d) => d.filter((x) => x.id !== id));
  };

  // Seed the draft (rules + match mode) from the applied state on open.
  const openAdvPopover = (open: boolean) => {
    if (open) {
      setAdvDraft(advRules.length ? advRules.map((r) => ({ ...r })) : [newAdvRule()]);
      setAdvMatchDraft(advMatch);
    }
    setAdvOpen(open);
  };

  // Server-side paging: `contractors` already holds exactly the
  // current page. Build a pagination object matching the shape the
  // <Pagination> component + table expect (was usePagination).
  const totalPages = Math.max(1, Math.ceil(totalCount / CONTRACTORS_PAGE_SIZE));
  const pagination = {
    items: contractors,
    page,
    pageSize: CONTRACTORS_PAGE_SIZE,
    totalPages,
    totalItems: totalCount,
    hasPrev: page > 0,
    hasNext: page < totalPages - 1,
    prev: () => setPage((p) => Math.max(0, p - 1)),
    next: () => setPage((p) => Math.min(totalPages - 1, p + 1)),
  };

  if (loading) return <TableSkeleton rows={5} />;

  // "Will import" mirrors isImportable in confirmImport: no hard
  // errors AND (Paystack confirmed the account OR admin override).
  // Will process = new inserts (verified or forced) + existing
  // updates. Existing rows always process (they update by id).
  const newCount = parsedRows.filter(
    (r) => !r.alreadyExists && r.errors.length === 0 && (!!r.paystack_name || !!r.forcedImport),
  ).length;
  const updateCount = parsedRows.filter((r) => r.alreadyExists && r.errors.length === 0).length;
  const validCount = newCount + updateCount;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Contractors</h1>
            <InfoHint>Manage independent contractors and freelancers. Store bank details, track HeyReach status and bulk-import via CSV for payment batches.</InfoHint>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {statusCounts.all} total
            <span className="mx-1.5 text-border">·</span>
            HeyReach synced {formatSyncedAt(lastSyncAt).toLowerCase()}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFilePick}
          />
          <Button variant="outline" onClick={runHeyReachSync} disabled={syncing}>
            {syncing
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync HeyReach
          </Button>
          {/* Sample + Bank-list reference CSVs share one "Templates" dialog. */}
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <Download className="mr-2 h-4 w-4" /> Templates
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={exportingCsv}>
            {exportingCsv
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            Export
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Contractor
          </Button>
        </div>
      </div>

      <Tabs defaultValue="contractors">
        <TabsList>
          <TabsTrigger value="contractors">Contractors</TabsTrigger>
          <TabsTrigger value="applications">
            <FileText className="mr-2 h-4 w-4" /> Applications
            <ApplicationsBadge />
          </TabsTrigger>
          <TabsTrigger value="partner_pay">
            <Calculator className="mr-2 h-4 w-4" /> Partner Pay
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contractors" className="mt-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Faceted filter sidebar */}
            <aside className="md:w-56 shrink-0">
              <div className="rounded-lg border border-border/70 bg-card p-3 space-y-4 md:sticky md:top-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
                  {(heyreachFilter !== 'all' || emailFilter !== 'all' || linkFilter !== 'all' || advRules.length > 0) && (
                    <button
                      type="button"
                      onClick={() => { setHeyreachFilter('all'); setEmailFilter('all'); setLinkFilter('all'); clearAdvFilters(); }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">HeyReach status</p>
                  {([
                    { key: 'all',          label: 'All',          dot: 'bg-muted-foreground/40' },
                    { key: 'active',       label: 'Active',       dot: 'bg-success' },
                    { key: 'disconnected', label: 'Disconnected', dot: 'bg-amber-500' },
                    { key: 'pending',      label: 'Pending',      dot: 'bg-sky-500' },
                    { key: 'inactive',     label: 'Inactive',     dot: 'bg-muted-foreground' },
                  ] as const).map((f) => (
                    <FacetButton
                      key={f.key}
                      active={heyreachFilter === f.key}
                      onClick={() => setHeyreachFilter(f.key)}
                      label={f.label}
                      dot={f.dot}
                      count={statusCounts[f.key]}
                    />
                  ))}
                </div>

                <div className="space-y-0.5">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">LinkedIn email</p>
                  {([
                    { key: 'all',  label: 'Any' },
                    { key: 'has',  label: 'Has email' },
                    { key: 'none', label: 'No email' },
                  ] as const).map((f) => (
                    <FacetButton key={f.key} active={emailFilter === f.key} onClick={() => setEmailFilter(f.key)} label={f.label} />
                  ))}
                </div>

                <div className="space-y-0.5">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">LinkedIn link</p>
                  {([
                    { key: 'all',  label: 'Any' },
                    { key: 'has',  label: 'Has link' },
                    { key: 'none', label: 'No link' },
                  ] as const).map((f) => (
                    <FacetButton key={f.key} active={linkFilter === f.key} onClick={() => setLinkFilter(f.key)} label={f.label} />
                  ))}
                </div>

                {/* Advanced rule builder — field / operator / value, ANDed. */}
                <div className="pt-2 border-t border-border/60">
                  <Popover open={advOpen} onOpenChange={openAdvPopover}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Advanced filters
                        {advRules.length > 0 && (
                          <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                            {advRules.length}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[380px] p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Match {advMatchDraft === 'all' ? 'all' : 'any'} of these conditions
                        </p>
                        <div className="inline-flex rounded-md border border-border/70 p-0.5">
                          {(['all', 'any'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setAdvMatchDraft(m)}
                              className={cn(
                                'px-2 py-0.5 text-xs rounded kd-transition',
                                advMatchDraft === m
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {m === 'all' ? 'All' : 'Any'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2 max-h-[320px] overflow-y-auto">
                        {advDraft.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2">No conditions yet.</p>
                        )}
                        {advDraft.map((r) => {
                          const f = advFieldOf(r.field);
                          const ops = OPS_BY_TYPE[f?.type ?? 'text'];
                          const needsValue = opNeedsValue(r.field, r.op);
                          return (
                            <div key={r.id} className="flex items-center gap-1.5">
                              <Select value={r.field} onValueChange={(v) => updateAdvRule(r.id, { field: v })}>
                                <SelectTrigger className="h-8 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ADV_FIELDS.map((af) => (
                                    <SelectItem key={af.key} value={af.key} className="text-xs">{af.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={r.op} onValueChange={(v) => updateAdvRule(r.id, { op: v as AdvOp })}>
                                <SelectTrigger className="h-8 text-xs w-[120px] shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ops.map((o) => (
                                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {needsValue && (
                                f?.type === 'select' ? (
                                  <Select value={r.value} onValueChange={(v) => updateAdvRule(r.id, { value: v })}>
                                    <SelectTrigger className="h-8 text-xs w-[110px] shrink-0"><SelectValue placeholder="Value" /></SelectTrigger>
                                    <SelectContent>
                                      {f.options?.map((o) => (
                                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={r.value}
                                    onChange={(e) => updateAdvRule(r.id, { value: e.target.value })}
                                    type={f?.type === 'number' ? 'number' : 'text'}
                                    placeholder="Value"
                                    className="h-8 text-xs w-[110px] shrink-0"
                                  />
                                )
                              )}
                              <button
                                type="button"
                                onClick={() => setAdvDraft((d) => d.filter((x) => x.id !== r.id))}
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                aria-label="Remove condition"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdvDraft((d) => [...d, newAdvRule()])}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add condition
                      </Button>
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <button type="button" onClick={clearAdvFilters} className="text-xs text-muted-foreground hover:text-foreground">
                          Clear
                        </button>
                        <Button size="sm" className="h-7 text-xs" onClick={applyAdvFilters}>Apply</Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </aside>

            {/* Main column: search + list + pagination */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contractors..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Applied advanced-filter chips — each removable, joined by the
                  active match mode (and / or). */}
              {advRules.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {advMatch === 'any' ? 'Any of' : 'All of'}
                  </span>
                  {advRules.map((r, idx) => (
                    <span key={r.id} className="inline-flex items-center gap-1.5">
                      {idx > 0 && (
                        <span className="text-[11px] text-muted-foreground/70">
                          {advMatch === 'any' ? 'or' : 'and'}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 pl-2 pr-1 py-1 text-xs">
                        {advRuleLabel(r)}
                        <button
                          type="button"
                          onClick={() => removeAppliedRule(r.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remove filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </span>
                  ))}
                  <button type="button" onClick={clearAdvFilters} className="text-xs text-primary hover:underline ml-1">
                    Clear
                  </button>
                </div>
              )}

      {/* Mercury-style list: hairline-bordered surface, no card chrome. */}
      <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {/* Select-all checkbox in the header — toggles every
                    visible (filtered) row on/off. Indeterminate state
                    when only some rows are picked. */}
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all contractors on this page"
                    checked={
                      contractors.length > 0 && contractors.every((c) => selectedIds.has(c.id))
                        ? true
                        : selectedIds.size === 0
                          ? false
                          : 'indeterminate'
                    }
                    onCheckedChange={(v) => {
                      // Server-side paging: select-all covers the
                      // current page (the only rows loaded).
                      setSelectedIds(() => v
                        ? new Set(contractors.map((c) => c.id))
                        : new Set());
                    }}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Default Amount</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>HeyReach Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.map((c) => {
                const { done, total } = onboardingScore(c);
                const pct = Math.round((done / total) * 100);
                const tone =
                  pct === 100
                    ? 'bg-success'
                    : pct >= 60
                    ? 'bg-accent'
                    : 'bg-destructive';
                return (
                <TableRow
                  key={c.id}
                  className={cn(
                    'cursor-pointer kd-transition',
                    selectedIds.has(c.id) && 'bg-primary/5',
                  )}
                  onClick={() => navigate(`/contractors/${c.id}`)}
                >
                  {/* Selection checkbox — stops click propagation so
                      ticking the box doesn't navigate to the profile. */}
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${c.full_name || c.first_name}`}
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelected(c.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{displayName(c.first_name, c.last_name, c.full_name)}</div>
                    {c.linkedin_id && (
                      <div className="text-[11px] text-muted-foreground">
                        {c.linkedin_id}
                      </div>
                    )}
                    {c.tags && c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.tags.map((tid) => {
                          const tag = availableTags.find((t) => t.id === tid);
                          if (!tag) return null;
                          return (
                            <span
                              key={tid}
                              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={tag.color ? { backgroundColor: `${tag.color}25`, color: tag.color } : undefined}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{c.bank_name}</TableCell>
                  <TableCell>{c.account_number}</TableCell>
                  <TableCell className="text-right currency">
                    {formatNaira(c.default_amount_ngn || 0)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 min-w-[120px]">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full kd-transition ${tone}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {done}/{total} steps · {pct}%
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const hr = heyreachDisplayStatus(c);
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium cursor-help',
                              hr.className,
                            )}>
                              <span className={cn('h-1.5 w-1.5 rounded-full', hr.dotClass)} />
                              {hr.label}
                              {(hr.key === 'pending' || hr.key === 'disconnected') && (
                                <Info className="h-3 w-3 opacity-70" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[240px] text-xs">{hr.reason}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* WhatsApp deep-link — Nigerian SME standard.
                          Stops row-level navigation on click so the
                          message opens in WhatsApp without dragging
                          the user to the contractor profile. */}
                      <WhatsAppButton
                        phone={c.whatsapp_phone}
                        size="sm"
                        stopPropagation
                        text={`Hi ${c.first_name || c.full_name || ''}, this is ${profile?.full_name || 'KD Squares'}.`}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(evt) => { evt.stopPropagation(); openEdit(c); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {c.status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Deactivate"
                          onClick={(evt) => { evt.stopPropagation(); toggleStatus(c); }}
                        >
                          <UserX className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                      {c.status === 'inactive' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(evt) => { evt.stopPropagation(); setConfirmReactivate(c); }}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPrev={pagination.prev}
            onNext={pagination.next}
            hasPrev={pagination.hasPrev}
            hasNext={pagination.hasNext}
          />
        </div>
      </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <ContractorApplications />
        </TabsContent>

        <TabsContent value="partner_pay" className="mt-4">
          <PartnerPayCalculator />
        </TabsContent>
      </Tabs>

      {/* Add / edit contractor dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(v) => {
          setShowForm(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Contractor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Ada"
                />
              </div>
              <div className="space-y-1">
                <Label>Last name *</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Okonkwo"
                />
              </div>
            </div>
            {!editing && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ada@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone / WhatsApp</Label>
                  <Input
                    value={form.whatsapp_phone}
                    onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
                    placeholder="+234 800 000 0000"
                  />
                </div>
              </div>
            )}

            {bank.verified &&
              bank.account_name &&
              (form.first_name.trim() || form.last_name.trim()) &&
              `${form.first_name.trim()} ${form.last_name.trim()}`.trim().toLowerCase() !==
                bank.account_name.trim().toLowerCase() && (
                <p className="text-xs text-warning">
                  Heads up: entered name differs from verified bank name "{bank.account_name}".
                </p>
              )}

            <BankAccountField value={bank} onChange={setBank} />

            {!editing && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>LinkedIn Profile URL</Label>
                  <Input
                    value={form.linkedin_url}
                    onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/in/your-profile"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>LinkedIn Email</Label>
                    <Input
                      type="email"
                      value={form.heyreach_email}
                      onChange={(e) => setForm({ ...form, heyreach_email: e.target.value })}
                      placeholder="LinkedIn login email"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>LinkedIn Password</Label>
                    <Input
                      type="password"
                      value={form.heyreach_password}
                      onChange={(e) => setForm({ ...form, heyreach_password: e.target.value })}
                      placeholder="LinkedIn login password"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Default Amount (₦)</Label>
                <Input
                  type="number"
                  value={form.default_amount_ngn}
                  onChange={(e) =>
                    setForm({ ...form, default_amount_ngn: e.target.value })
                  }
                />
              </div>
            </div>
            {!editing && (
              <div className="space-y-1">
                <Label>Date Onboarded (LinkedIn Outreach)</Label>
                <Input
                  type="date"
                  value={form.onboarded_at}
                  onChange={(e) => setForm({ ...form, onboarded_at: e.target.value })}
                />
              </div>
            )}
            {availableTags.length > 0 && (
              <div className="space-y-1">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setSelectedTagIds((prev) =>
                            selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                          )
                        }
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all',
                          selected ? 'opacity-100' : 'opacity-40 hover:opacity-75',
                        )}
                        style={
                          tag.color
                            ? {
                                backgroundColor: `${tag.color}25`,
                                color: tag.color,
                                borderColor: `${tag.color}50`,
                                outline: selected ? `2px solid ${tag.color}` : undefined,
                                outlineOffset: '1px',
                              }
                            : undefined
                        }
                      >
                        {selected && <Check className="mr-1 h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={submitting || !form.first_name.trim() || !bank.verified}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate confirmation dialog */}
      <Dialog open={!!confirmReactivate} onOpenChange={(v) => { if (!v) setConfirmReactivate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate {confirmReactivate?.first_name || confirmReactivate?.full_name}?</DialogTitle>
            <DialogDescription>
              They will be marked active and eligible for payments again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReactivate(null)}>Cancel</Button>
            <Button onClick={() => confirmReactivate && reactivateContractor(confirmReactivate)}>
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV import preview dialog */}
      <Dialog
        open={importDialog}
        onOpenChange={(v) => {
          if (!v) closeImportDialog();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {importSummary ? 'Import complete' : 'Review CSV import'}
            </DialogTitle>
            <DialogDescription>
              {importSummary
                ? `${importFileName || 'File'} processed.`
                : `${importFileName || 'Uploaded file'} — ${parsedRows.length} row(s) parsed. ${newCount} new, ${updateCount} already exist (update), ${invalidCount} blocked.`}
            </DialogDescription>
          </DialogHeader>

          {/* Post-import breakdown — created vs updated vs skipped, with a
              downloadable error report for any blocked rows. */}
          {importSummary && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" /> <b>{importSummary.created}</b> created
              </span>
              <span className="inline-flex items-center gap-1.5 text-blue-600">
                <RefreshCw className="h-4 w-4" /> <b>{importSummary.updated}</b> updated (already existed)
              </span>
              {importSummary.failed > 0 && (
                <span className="inline-flex items-center gap-1.5 text-destructive">
                  <AlertCircle className="h-4 w-4" /> <b>{importSummary.failed}</b> skipped
                </span>
              )}
              {importSummary.updateFailures > 0 && (
                <span className="inline-flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="h-4 w-4" /> <b>{importSummary.updateFailures}</b> update(s) failed
                </span>
              )}
              {importSummary.failures.length > 0 && (
                <Button variant="outline" size="sm" className="ml-auto" onClick={downloadImportErrors}>
                  <Download className="mr-2 h-4 w-4" /> Download error report
                </Button>
              )}
            </div>
          )}

          {!importSummary && (
            <>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-4 w-4" /> {newCount} new
                </span>
                {updateCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <RefreshCw className="h-4 w-4" /> {updateCount} update
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-4 w-4" /> {invalidCount} blocked
                </span>
                {verifying && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verifying with Paystack… {verifyProgress.done}/{verifyProgress.total}
                  </span>
                )}
                {!verifying && parsedRows.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {parsedRows.filter((r) => !r.alreadyExists && r.paystack_verified).length} verified ·{' '}
                    {parsedRows.filter((r) => !r.alreadyExists && !!r.paystack_name && !r.paystack_verified).length} name differs ·{' '}
                    {parsedRows.filter((r) => r.errors.length === 0 && !r.paystack_name && !r.alreadyExists).length} unverified
                  </span>
                )}
              </div>

              <div className="border rounded-lg max-h-[360px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>LinkedIn</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((r) => {
                      const hasError = r.errors.length > 0;
                      // Already in the directory — skipped, never re-inserted.
                      const isDuplicate = !!r.alreadyExists;
                      // Account verified to exist (Paystack returned a
                      // name). Name match vs slight difference is just
                      // a display nuance — both import.
                      const nameMatches = !isDuplicate && r.paystack_verified;
                      const nameDiffers = !isDuplicate && !!r.paystack_name && !r.paystack_verified;
                      // No resolved name + no hard error = Paystack
                      // could not confirm the account. Blocks import
                      // unless the admin ticks "Import anyway".
                      const unverified = !isDuplicate && !hasError && !r.paystack_name;
                      return (
                        <TableRow
                          key={r.rowNumber}
                          className={cn(
                            (hasError || unverified) && 'bg-destructive/5',
                            isDuplicate && 'bg-blue-500/5',
                            !hasError && !unverified && !isDuplicate && nameDiffers && 'bg-amber-500/5',
                          )}
                        >
                          <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                          <TableCell className="font-medium">
                            {r.full_name || '—'}
                            {nameDiffers && (
                              <div className="text-[10.5px] text-amber-700 dark:text-amber-400 mt-0.5">
                                Paystack: <span className="font-mono">{r.paystack_name}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{r.bank_name || '—'}</TableCell>
                          <TableCell className="font-mono text-[12px]">{r.account_number || '—'}</TableCell>
                          <TableCell className="text-right currency">
                            {formatNaira(r.default_amount_ngn || 0)}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-[11px] truncate max-w-[160px]">
                            {r.linkedin_url || '—'}
                          </TableCell>
                          <TableCell>
                            {isDuplicate ? (
                              <div className="space-y-0.5">
                                <Badge variant="outline" className="border-blue-500/40 text-blue-700 bg-blue-50">
                                  <RefreshCw className="h-3 w-3 mr-1" /> Will update
                                </Badge>
                                <div className="text-[10px] text-muted-foreground">
                                  matched by {r.existingMatchBasis === 'bank+account' ? 'bank + account' : r.existingMatchBasis === 'id' ? 'export ID' : r.existingMatchBasis} · bank details unchanged
                                </div>
                              </div>
                            ) : hasError ? (
                              <span className="text-xs text-destructive">
                                {r.errors.join(', ')}
                              </span>
                            ) : nameMatches ? (
                              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                              </Badge>
                            ) : nameDiffers ? (
                              // Account EXISTS, registered name differs.
                              // Imports automatically — just flagged.
                              <Badge variant="outline" className="border-amber-500/40 text-amber-700 bg-amber-50">
                                <AlertCircle className="h-3 w-3 mr-1" /> Name differs (will import)
                              </Badge>
                            ) : unverified ? (
                              // Paystack could not confirm the account.
                              // Blocked unless admin overrides.
                              <div className="space-y-1">
                                <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">
                                  <XCircle className="h-3 w-3 mr-1" /> Not verified — blocked
                                </Badge>
                                <label className="flex items-center gap-1.5 text-[10.5px] cursor-pointer">
                                  <Checkbox
                                    checked={!!r.forcedImport}
                                    onCheckedChange={(v) => {
                                      setParsedRows((prev) =>
                                        prev.map((row) =>
                                          row.rowNumber === r.rowNumber
                                            ? { ...row, forcedImport: !!v }
                                            : row,
                                        ),
                                      );
                                    }}
                                    className="h-3.5 w-3.5"
                                  />
                                  Import anyway (override)
                                </label>
                              </div>
                            ) : (
                              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                OK
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {importSummary && importSummary.failures.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Skipped rows</p>
              <div className="border rounded-lg max-h-[240px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importSummary.failures.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{f.row}</TableCell>
                        <TableCell className="font-medium">{f.name}</TableCell>
                        <TableCell className="text-destructive">{f.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            {!importSummary ? (
              <>
                <Button variant="outline" onClick={closeImportDialog} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmImport}
                  disabled={importing || validCount === 0}
                >
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import {validCount} valid row{validCount === 1 ? '' : 's'}
                </Button>
              </>
            ) : (
              <Button onClick={closeImportDialog}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates — one click downloads BOTH the sample template and
          the supported-banks reference. No tab to pick. */}
      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Download import templates</DialogTitle>
            <DialogDescription>
              One click gets you two files — the contractor template (with example
              rows) and the supported-banks reference.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-1 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
              <p className="font-medium">What you'll get</p>
              <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-4">
                <li><span className="font-medium text-foreground">kdops-contractors-sample.csv</span> — the import template with example rows</li>
                <li><span className="font-medium text-foreground">kdops-supported-banks.csv</span> — every bank's exact name to paste into <code className="rounded bg-muted px-1 py-0.5 text-xs">bank_name</code></li>
              </ul>
            </div>

            <div className="rounded-md border border-border/60 p-3 space-y-1.5">
              <p className="font-medium text-[13px]">Columns</p>
              <p className="text-[12.5px]">
                <span className="font-semibold text-foreground">Required:</span>{' '}
                <code className="text-xs">full_name</code>, <code className="text-xs">bank_name</code>, <code className="text-xs">account_number</code>
              </p>
              <p className="text-[12.5px]">
                <span className="font-semibold text-foreground">Optional:</span>{' '}
                <code className="text-xs">linkedin_email</code> (primary email), <code className="text-xs">email</code>, <code className="text-xs">whatsapp_phone</code>, <code className="text-xs">linkedin_password</code>, <code className="text-xs">linkedin_url</code>, <code className="text-xs">default_amount_ngn</code>, <code className="text-xs">onboarded_at</code>
              </p>
              <p className="text-[11.5px] text-muted-foreground pt-0.5">
                If <code className="text-xs">linkedin_email</code> is blank, the <code className="text-xs">email</code> value fills it on import. Accounts are Paystack-verified — unverifiable accounts are blocked.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button onClick={downloadAllTemplates} disabled={exportingBanks} className="w-full sm:w-auto">
              {exportingBanks
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Download className="mr-2 h-4 w-4" />}
              Download both templates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk action bar — slides up when one or more rows are
          selected. Delete writes a hard delete (RLS gates which
          contractors the user can actually remove). The toast +
          fetchContractors() refresh runs after a confirmation
          inside <BulkActionBar>. */}
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={async () => {
          const ids = Array.from(selectedIds);
          const { error } = await supabase
            .from('contractors')
            .delete()
            .in('id', ids);
          if (error) {
            toast({ title: 'Bulk delete failed', description: error.message, variant: 'destructive' });
            return;
          }
          await logAudit('contractor_deleted', `Bulk-deleted ${ids.length} contractors`, profile);
          setSelectedIds(new Set());
          toast({ title: `${ids.length} contractor${ids.length === 1 ? '' : 's'} deleted` });
          reloadAll();
        }}
        deleteLabel="Delete contractors"
        deleteConfirmTitle="Delete selected contractors?"
        deleteConfirmDescription="They'll be removed from the directory. Past payment batches that reference them stay intact via the historical contractor_id snapshot."
      />
    </div>
  );
};

export default Contractors;

// ---------------------------------------------------------------------------
// Pending applications count badge (shown in the tab trigger)
// ---------------------------------------------------------------------------

function ApplicationsBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    supabase
      .from('contractor_applications')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'pending_review'])
      .then(({ count: c }) => setCount(c || 0))
      .catch(() => { /* badge is non-critical */ });
  }, []);
  if (count === 0) return null;
  return (
    <Badge className="ml-2 bg-warning text-warning-foreground h-5 px-1.5 text-[10px] font-semibold">
      {count}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Sidebar facet option — a single selectable filter row with an optional
// status dot and count badge.
// ---------------------------------------------------------------------------

function FacetButton({
  active, onClick, label, dot, count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left kd-transition',
        active
          ? 'bg-primary/5 text-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {dot && <span className={cn('h-2 w-2 rounded-full shrink-0', dot)} />}
      <span className="flex-1 truncate">{label}</span>
      {count != null && (
        <span className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
          active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {count}
        </span>
      )}
    </button>
  );
}
