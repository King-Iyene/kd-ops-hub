-- Add 'duplicate_of' to task dependency types
ALTER TABLE public.task_dependencies
  DROP CONSTRAINT IF EXISTS task_dependencies_dependency_type_check;

ALTER TABLE public.task_dependencies
  ADD CONSTRAINT task_dependencies_dependency_type_check
  CHECK (dependency_type IN ('blocks', 'is_blocked_by', 'relates_to', 'duplicate_of'));
