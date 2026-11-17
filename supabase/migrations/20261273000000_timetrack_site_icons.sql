-- Cache of official site logos, filled by the site-icons edge function (service role only).
-- icon = a data URL (PNG up to 128px), or NULL when no logo could be found (retried after a few days).
CREATE TABLE IF NOT EXISTS public.time_site_icons (
  domain     text PRIMARY KEY,
  icon       text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on with no policies: browsers cannot read or write it directly; only the edge function can.
ALTER TABLE public.time_site_icons ENABLE ROW LEVEL SECURITY;
