-- Add department head FK so the UI can display/assign a head of department.
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS head_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
