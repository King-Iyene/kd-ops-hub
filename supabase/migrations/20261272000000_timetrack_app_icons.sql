-- Real icons for desktop apps. The tracker reads each app's own icon from its program file once
-- (first time it sees the app) and saves it here, so reports can show the actual logo instead of a
-- letter. One row per app name; icons are small PNGs stored as data URLs.
CREATE TABLE IF NOT EXISTS public.time_app_icons (
  app_name   text PRIMARY KEY,
  icon       text NOT NULL CHECK (length(icon) < 60000 AND icon LIKE 'data:image/png;base64,%'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_app_icons ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can see them (they are only app logos)...
DROP POLICY IF EXISTS time_app_icons_read ON public.time_app_icons;
CREATE POLICY time_app_icons_read ON public.time_app_icons FOR SELECT TO authenticated USING (true);

-- ...and the tracker, running as the signed-in employee, can add an app it has not reported before.
-- It cannot change or delete existing icons.
DROP POLICY IF EXISTS time_app_icons_insert ON public.time_app_icons;
CREATE POLICY time_app_icons_insert ON public.time_app_icons FOR INSERT TO authenticated WITH CHECK (true);
