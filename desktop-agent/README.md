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

## What's NOT implemented yet (see the Section 10 timeline estimate)

- **Packaging/signing/auto-update** — `electron-builder` config exists but
  nothing has been code-signed or distributed. Running this today means
  `npm start` on a machine with Node + this checkout, not installing a
  built app. Budget 3–5 days for proper packaging across macOS/Windows.
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
