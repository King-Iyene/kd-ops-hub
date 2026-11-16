-- Starter productivity rules for the Time Tracking module, plus clean-up of duplicates.
--
-- Why: with only a handful of hand-made rules almost every capture was "neutral", so people
-- showed 0% productive. These give sensible defaults (work tools = productive, social media /
-- entertainment / games = unproductive, shown red). Admins edit them any time under
-- Time Tracking > Activity: Categories, or per site/app on Activity: Sites and apps.
--
-- Rules match the site (e.g. github.com), the window title, or the application name; the most
-- specific wins (site > title > app). Priority 60 so anything an admin already created (50)
-- is evaluated first. Rows that already exist (same app/site) are left untouched.

-- 1. Remove exact duplicates (same app, title and category), keeping the oldest.
delete from public.time_productivity_rules a
using public.time_productivity_rules b
where a.id <> b.id
  and coalesce(a.app_name_contains, '') = coalesce(b.app_name_contains, '')
  and coalesce(a.title_contains, '')    = coalesce(b.title_contains, '')
  and a.category = b.category
  and (a.created_at, a.id) > (b.created_at, b.id);

-- 2. Starter rules.
insert into public.time_productivity_rules (app_name_contains, category, priority)
select v.needle, v.category, 60
from (values
  -- work tools (productive)
  ('github.com', 'productive'), ('gohighlevel.com', 'productive'), ('make.com', 'productive'),
  ('docs.google.com', 'productive'), ('sheets.google.com', 'productive'), ('drive.google.com', 'productive'),
  ('slides.google.com', 'productive'), ('mail.google.com', 'productive'), ('calendar.google.com', 'productive'),
  ('meet.google.com', 'productive'), ('zoom.us', 'productive'), ('notion.so', 'productive'),
  ('airtable.com', 'productive'), ('figma.com', 'productive'), ('canva.com', 'productive'),
  ('supabase.com', 'productive'), ('vercel.com', 'productive'), ('clickup.com', 'productive'),
  ('stripe.com', 'productive'), ('linkedin.com', 'productive'), ('claude.ai', 'productive'),
  ('kdsquares.com', 'productive'), ('Visual Studio Code', 'productive'), ('Code.exe', 'productive'),
  ('Terminal', 'productive'), ('Excel', 'productive'), ('Word', 'productive'), ('PowerPoint', 'productive'),
  ('Outlook', 'productive'), ('Teams', 'productive'), ('Zoom', 'productive'),
  -- not work (unproductive, red)
  ('facebook.com', 'unproductive'), ('instagram.com', 'unproductive'), ('tiktok.com', 'unproductive'),
  ('twitter.com', 'unproductive'), ('x.com', 'unproductive'), ('netflix.com', 'unproductive'),
  ('twitch.tv', 'unproductive'), ('reddit.com', 'unproductive'), ('9gag.com', 'unproductive'),
  ('Steam', 'unproductive'), ('Epic Games', 'unproductive'), ('uagame', 'unproductive'),
  -- the tracker itself should never count either way
  ('KD Ops Data Collector', 'neutral'), ('KD Ops Time Tracker', 'neutral')
) as v(needle, category)
where not exists (
  select 1 from public.time_productivity_rules r
  where lower(r.app_name_contains) = lower(v.needle) and r.title_contains is null
);
