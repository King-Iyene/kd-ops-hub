# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Git workflow

- **Always work on and commit directly to `main`.** Do not create feature
  branches or pull requests for routine changes — commit to `main` and push to
  `origin/main`.
- Use normal (non-force) pushes. Never force-push `main`.

## Session behavior

- **Always auto-continue when token resets.** When a session runs out of
  context and restarts, pick up exactly where you left off without asking
  questions. Resume the last task as if the break never happened.
