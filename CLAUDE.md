# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Git workflow

- **Always work on and commit directly to `main`.** Do not create feature
  branches or pull requests for routine changes — commit to `main` and push to
  `origin/main`.
- Use normal (non-force) pushes. Never force-push `main`.

## Deployment

- **Supabase migrations and edge functions auto-deploy via GitHub Actions on
  push to `main`.** Never tell the user to manually run SQL in the Supabase
  dashboard. Just push to `main` and verify the workflow succeeded.
- After pushing migration or edge function changes, check the GitHub Actions
  run status to confirm deployment. If it fails, investigate the workflow logs.

## Session behavior

- **Always auto-continue when token resets.** When a session runs out of
  context and restarts, pick up exactly where you left off without asking
  questions. Resume the last task as if the break never happened.
