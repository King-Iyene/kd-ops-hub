# KD Ops Time Tracker — desktop agent

Native Electron agent for Section 10 of the Time Tracking module: window/app
activity capture and optional screenshots. **Not** part of the Vite web app's
build — self-contained, its own `package.json`/`tsconfig.json`, not linted or
type-checked by the root project's tooling.

Signs in against the **same Supabase Auth** as the web app (no second login
system). Writes land in `time_activity_logs` / `time_screenshots`, gated by
RLS so an employee can only write their own rows, and only while
`time_agent_settings.is_enabled` is true for them (checked server-side, not
just trusted from the agent) — an admin enables it per employee from
**Time Activity → Per-employee settings** in the web app.

## Setup

```bash
cd desktop-agent
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_ANON_KEY
npm install
npm start
```

## What's implemented

- Sign in / sign out (reuses the Supabase session, persisted via
  `electron-store` so it survives a restart).
- Background interval polling `time_agent_settings` every minute — starts or
  stops capture immediately if an admin flips the toggle.
- Active window title + app name capture via `active-win`.
- Client-side productivity classification from `time_productivity_rules`
  (admin-edited in the web app, no agent redeploy needed).
- Optional screenshot capture (`desktopCapturer`) with a cheap blur option,
  uploaded to the private `timetrack-screenshots` Storage bucket.
- Tray icon — closing the window doesn't stop tracking.

## Installing the app (no Node/checkout required)

Real installers — Windows (`.exe`), macOS (`.dmg`), Linux (`.AppImage`/`.deb`)
— are built by [`.github/workflows/build-desktop-agent.yml`](../.github/workflows/build-desktop-agent.yml)
and published as assets on a GitHub Release. Each OS is built **natively on
its own CI runner** (a macOS `.dmg` cannot be reliably produced on Linux).

To cut a real release: `git tag desktop-agent-v0.1.0 && git push origin desktop-agent-v0.1.0`.
The workflow also runs on manual dispatch (Actions tab) to produce verification
builds without tagging a release.

**Required repo configuration** (Settings → Secrets and variables → Actions),
one-time, before the first real build:
- `SUPABASE_URL` (Variable) — `https://mseeurrvdcfxdmvqjjki.supabase.co`
- `SUPABASE_ANON_KEY` (Secret or Variable) — the same public, RLS-gated anon
  key already used by the web app's `VITE_SUPABASE_ANON_KEY`. This is safe to
  ship inside a distributed installer (never the service role key) — RLS on
  the server is what actually gates access, same security model as the web
  app's bundled JS.

Without `SUPABASE_ANON_KEY` set, the installers still build and install fine,
but the app shows a "not configured" screen on launch instead of connecting
— see `src/supabaseClient.ts` / `scripts/write-config.js`.

**Builds are unsigned** — no Apple/Windows code-signing certificates exist
for this project yet. Users will see an "unidentified developer" (macOS) or
"Windows protected your PC" (SmartScreen) warning on first run; this is
expected, not a bug, until certificates are purchased and added as secrets.

## What's NOT implemented yet (see the Section 10 timeline estimate)

- **Code signing / auto-update** — builds above are real and installable but
  unsigned (see above). Auto-update (e.g. `electron-updater`) isn't wired up;
  a new version today means downloading the new installer again.
- **Idle detection** — not built. Would use `powerMonitor.getSystemIdleTime()`.
- **Mobile GPS/geofencing** — explicitly out of scope for this Electron app;
  it's a separate iOS/Android build (see the Section 10 proposal).
- **macOS screen-recording permission flow** — `active-win`'s window-title
  capture needs it granted once; this agent doesn't yet prompt/explain it.

## Known platform notes

- `active-win` ships native bindings per OS — if `npm install` fails on an
  unsupported platform, this is why; the tracker lazily `require()`s it so a
  missing binding fails per-tick rather than at startup.
- On macOS, window titles require the user to grant Screen Recording
  permission to the packaged app once (System Settings → Privacy & Security).
