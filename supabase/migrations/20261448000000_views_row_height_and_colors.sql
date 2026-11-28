-- A view's look is part of the view: row height and row colors are saved with it, like column widths already are,
-- so everyone who opens the view sees the same thing (until now they lived only in each person's browser).
--   row_height: null means "not chosen yet" (the screen's own default); otherwise short, medium, tall or extra-tall.
--   row_color_rules: the "color rows by" rules, in the same shape the screen already uses.

alter table nc_meta.views
  add column if not exists row_height text,
  add column if not exists row_color_rules jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'views_row_height_check' and conrelid = 'nc_meta.views'::regclass
  ) then
    alter table nc_meta.views
      add constraint views_row_height_check
      check (row_height is null or row_height in ('short', 'medium', 'tall', 'extra-tall'));
  end if;
end $$;
