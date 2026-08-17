-- CFO Notes: financial commentary, decision log, and risk journal
CREATE TABLE IF NOT EXISTS cfo_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body         text NOT NULL,
  category     text NOT NULL DEFAULT 'general'
               CHECK (category IN ('decision', 'risk', 'insight', 'forecast', 'general')),
  pinned       boolean NOT NULL DEFAULT false,
  period_label text,
  created_by   uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  company_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
);

ALTER TABLE cfo_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cfo_notes_select" ON cfo_notes
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "cfo_notes_insert" ON cfo_notes
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "cfo_notes_update" ON cfo_notes
    FOR UPDATE USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "cfo_notes_delete" ON cfo_notes
    FOR DELETE USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cfo_notes_category ON cfo_notes(category);
CREATE INDEX IF NOT EXISTS idx_cfo_notes_pinned ON cfo_notes(pinned DESC, created_at DESC);
