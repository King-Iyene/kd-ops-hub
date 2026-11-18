# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Git workflow

- **Work on a branch, verify, then merge to `main`.** Do not commit or push
  straight to `main`. Create a branch for each change (for example
  `feature/<short-name>` or `fix/<short-name>`) and commit there.
- **Verify before anything reaches `main`:** run lint on the changed files and
  the tests for the area you touched, and make sure the branch's CI run (or
  pull request checks) passes. Where the change can be seen in the app,
  check it there as well. Say plainly what was and was not verified.
- **Always run `npm run build` before merging.** Lint and tests can pass while
  the production build is broken (a duplicate variable name did exactly that
  and blocked every deploy). After merging, confirm the live site actually
  deployed the change; a failed deploy leaves everyone on the old version.
- **Never write to the database from a screen on every render or mount.**
  Only save when a value actually changed; the profile table streams live
  updates to every open tab, so a needless write can make the whole app
  reload in a loop.
- Only when the checks pass, merge the branch into `main` with a normal push
  or pull request merge. Use normal (non-force) pushes. Never force-push
  `main`.
- If the checks fail, fix the problem on the branch. Do not merge a failing
  branch to get past it.

## Deployment

- **Supabase migrations and edge functions auto-deploy via GitHub Actions on
  push to `main`** (that is, after the verified branch is merged). Never tell
  the user to manually run SQL in the Supabase dashboard. Merge to `main` and
  verify the workflow succeeded.
- After merging migration or edge function changes to `main`, check the GitHub
  Actions run status to confirm deployment. If it fails, investigate the
  workflow logs.

## Session behavior

- **Always auto-continue when token resets.** When a session runs out of
  context and restarts, pick up exactly where you left off without asking
  questions. Resume the last task as if the break never happened.
