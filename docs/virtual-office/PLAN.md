# Virtual Office ("KD Office") — plan, tools and checklist

A Gather Town style virtual office built **inside KD Ops** (not a separate product): walk around a shared
2D/3D office as an avatar, see colleagues live, talk face to face when you walk close to someone, have private
rooms, meetings with recording, guests, and a personal office for every employee.

Written: November 2026, from the planning conversation. **All prices and limits below are from third-party
summaries and docs excerpts found at that time. Re-check each one on the provider's own page before spending
money.** Nothing in this document has been built yet.

---

## 1. Decisions already made

| # | Decision |
|---|---|
| 1 | Users: **staff and guests** (clients join by an invite link). |
| 2 | Team size today: **about 20 to 30 people**. Design with no hard limit, but cost grows with minutes of video. |
| 3 | **One office per company** (KD Squares, Niger Delta Innovate) **plus a personal office for each employee**. A new employee gets one automatically from a template, and admins can build or edit it. |
| 4 | Look: **modern**. Start 2.5D (stylised top-down/isometric). **3D is wanted later**, so keep the drawing layer swappable. |
| 5 | Users can **customise** their avatar, desk, computer and office furniture. |
| 6 | **Recording meetings is required.** Only designated people can record. Everyone in the room and nearby is notified. |
| 7 | **No time-tracker status** above avatars for now (privacy). Do not show productivity data in the world. |
| 8 | **No new paid tools for now.** Use Supabase (already paid) and free options. Revisit when usage is measured. |
| 9 | Backend stays **Supabase**. **We are not going back to DigitalOcean.** |

---

## 2. What each part is (plain language)

- **The world:** a tile map you walk around. Walls, doors, rooms, desks, portals between rooms.
- **Presence:** everyone sees everyone move, live.
- **Proximity calls:** walk near someone and video and audio connect; volume fades with distance; private spaces
  isolate conversations.
- **Objects:** whiteboards, documents, links, posters.
- **Chat:** nearby, everyone, direct messages.
- **Map editor:** admins (and people in their own office) place walls, floors and furniture.
- **Recording and consent:** start/stop by designated people, banner and sound for everyone present.
- **Guests:** expiring invite links that only open chosen rooms.

---

## 3. Tools and accounts

### 3a. Already have (no new account, no new bill)
| Tool | Used for |
|---|---|
| **Supabase** (Pro) | Database, logins, permissions (RLS), Realtime messaging, file Storage, Edge Functions. |
| **GitHub** (+ Actions) | Code, CI, automatic deploys of migrations and edge functions. |
| **Vercel** (the web host, see `vercel.json`) | Hosting the KD Ops web app. |
| **KD Ops codebase** (React, Vite, TypeScript) | The office becomes a new module here. |
| **Sentry** (already in the site's security policy) | Error reporting. |

### 3b. Needed now, at $0 extra
| Tool | What for | Notes |
|---|---|---|
| **WebRTC** (built into browsers) | Peer-to-peer video and audio. | Free. Limit is small groups, about 4 to 6 people per call. |
| **MediaRecorder** (built into browsers) | Recording in the recorder's browser, uploaded to Supabase Storage. | Free. Recording stops if the recorder closes the tab or the laptop sleeps. |
| **Public STUN servers** (for example Google's) | Lets browsers find each other. | Free. |
| **Free TURN relay: Open Relay by Metered** | Relay for the 10 to 20 percent of connections that cannot connect directly. | Free account. Reported at about **20 GB a month** (sources disagree, one review says it is not production grade). **Watch usage.** |
| **Phaser or PixiJS** (npm, open source) | 2D drawing engine for the world. | Free. Installing packages needs the owner's permission in this environment. |
| **Free art packs** | Tilesets, furniture, avatar parts. | Kenney (kenney.nl) and Quaternius (quaternius.com) publish free low-poly and 2D packs. **Check each pack's licence.** |
| **Tiled** or the built-in editor | Designing the first maps. | Free. |
| **Blender** (only for 3D later) | Making or adjusting 3D models. | Free. |

### 3c. Later, only if usage proves the need (all optional)
| Tool | When | Rough cost |
|---|---|---|
| **LiveKit Cloud** (media server) | Bigger groups, all-hands meetings, server-side recording. | Free Build plan: 5,000 participant-minutes a month, hard cap, 100 concurrent. Ship: $50 a month with 150,000 minutes, then about $0.0005 a minute. Recording is billed per minute on top (confirm the rate). |
| **Self-hosted LiveKit** | To avoid per-minute fees. | Needs a server. Options: Oracle Cloud Always Free (4 ARM cores, 24 GB, 10 TB outbound a month, free, but capacity is hard to get and the instance can be reclaimed if limits are exceeded), or a small paid server ($4 to $6 a month class). Someone must maintain it. |
| **Own TURN relay (coturn)** | If the free relay allowance runs out. | A small server, about $4 to $6 a month. |
| **Cloudflare Realtime SFU** | A cheaper media server, but lower level so more work. | $0.05 per GB, first 1,000 GB a month free. |
| **Cloudflare R2** | Recording storage if many people watch recordings. | $0.015 per GB-month, no download fees, 10 GB free. |
| **Artist or asset budget** | Custom modern art, custom avatars, 3D models. | Quote needed. |
| **Legal review** | Before recording goes live. | Check consent wording against Nigeria's data protection law (NDPA 2023), and guest consent. |

---

## 4. How it will work

### Movement (cheap, important)
Do **not** broadcast positions many times a second. Supabase counts Realtime messages (about 5 million a month
included on Pro, then about $2.50 per million), and fan-out to every listener multiplies them. Instead send
**events**: "started walking left", "stopped at tile X", "changed direction". Other browsers animate the walk
themselves. Use nearby-only channels (a channel per area) if needed. Supabase Realtime limits to keep in mind (Pro):
500 concurrent connections, 500 messages a second, 50 presence messages a second.

### Calls
Browsers connect to each other with WebRTC. Supabase Realtime only carries the setup handshake ("signalling").
STUN finds the route, the free TURN relay is the fallback. Connect when two avatars are within a radius; fade
volume with distance; private-space tiles isolate conversations; spotlight tiles broadcast to a room.
Build the video layer behind one interface so it can later be swapped for LiveKit without touching the world.

### Recording and consent
1. Only users with a "can record" permission see the Record button.
2. Starting a recording broadcasts a message: every client shows a banner, plays a sound, and keeps a visible
   REC indicator. Anyone can leave the area.
3. The recorder's browser mixes the call and uploads the file to Supabase Storage.
4. Every recording is logged (who, when, which room, who was present) with a retention period.
5. Guests accept recording on entering.

### Personal offices
A trigger creates a default personal office from a template when an employee profile is created (same pattern as
the existing automatic agent settings row). The owner can edit furniture; admins can edit anyone's. Visitors
knock, or the door is locked.

### Guests
Invite link with an expiry, limited to specific rooms, never private offices. A guest can only be in the rooms
named on the invite. Guests accept the recording notice.

---

## 5. Staged plan and checklist

Rough effort assumes focused work. A solid version for about 25 people is about **3.5 to 4.5 months**. Full
Gather parity would be 6 to 12 months. 3D adds roughly 2 to 4 months and needs 3D art.

- [x] **Stage 0 (built, commit 5c0b7c54): walkable office.** Team office (open floor, lounge, 3 meeting rooms),
      a personal office per employee, avatars, furniture editor, quiet live presence. Canvas 2D (no new
      dependencies; renderer kept swappable for 3D later). 50 unit tests. Soft-launched: nav link shows for
      admins only; page reachable by URL for everyone. Traffic budget: movement is sent only on start, turn and
      stop plus a 4 s correction; nothing while standing or when the tab is hidden; channels close after 2 min
      hidden. Not yet verified live: walking and portals in a visible browser, multi-user movement.
- [ ] **Stage 1 (2 to 3 weeks): calls.** Peer-to-peer proximity audio and video, mute and camera, screen share,
      relay fallback, browser-side recording to Supabase Storage with the consent banner.
- [ ] **Stage 2 (3 to 5 weeks): build.** Map editor, rooms, private spaces, doors and portals, per-company
      offices, personal offices with furniture and avatar customisation.
- [ ] **Stage 3 (2 to 3 weeks): KD Ops glue.** Chat (nearby, everyone, direct), announcements through the
      notifications we already have, meeting rooms linked to tasks, guest invites.
- [ ] **Stage 4 (3 to 4 weeks): hardening.** Mobile, scale tests with simulated users, Safari quirks, admin tools,
      permission audit, retention and legal checks.
- [ ] **Stage 5 (optional): 3D** renderer and 3D avatars and furniture.

---

## 6. Costs (very rough, 20 to 30 people)

| Item | Now | If usage grows |
|---|---|---|
| Supabase | Already paid. Movement events add little or nothing. | Storage past 100 GB is about $0.021 per GB-month. |
| Calls | **$0** (peer-to-peer plus free relay). | Relay traffic may pass the free 20 GB. About 25 people, 2 hours of calls a day, lower quality, 15 percent relayed is roughly 45 GB a month. Fix with a small relay server, or audio-first calls. |
| Media server (optional) | $0 | LiveKit Ship about $50 to $75 a month for this size. |
| Recording storage | Inside Supabase Pro (100 GB). About 0.7 to 1 GB per recorded hour. | R2 if playback is heavy. |
| Art | Free packs | Custom art is a separate quote. |

---

## 7. Risks and limits to remember
- Peer-to-peer gets heavy past about 4 to 6 people in one call. All-hands meetings need an audio-only or
  few-camera mode, or a paid media server.
- Some connections cannot connect without a relay. The free relay allowance may run out.
- Browser-side recording depends on the recorder's computer and browser staying open.
- Slow or unstable connections hurt peer-to-peer calls more than a media server.
- Safari and mobile browsers behave differently with WebRTC.
- Real multi-person video testing needs real people and cameras. Movement and load can be tested with simulated users.
- Recording people needs consent and a retention policy. Get the wording checked before launch.
- Gather's art, code and brand are theirs. Copy the mechanics, not the assets or name. Use our own art and name.

---

## 8. Open decisions
1. 2.5D first, or full 3D from the start? (Recommendation: 2.5D first, swappable renderer.)
2. When to adopt a paid media server (LiveKit or similar), if ever. Decide from measured usage.
3. Art: free packs only, or a budget for custom art?
4. Who counts as a "designated recorder"? (A new permission in the existing roles.)
5. Guest policy: invite expiry length, which rooms guests may enter, recording consent wording.
6. Default personal-office template: size, furniture, who may edit.
7. Legal review of recording and data retention.

---

## 9. Sources checked (November 2026)
- LiveKit pricing and limits: https://livekit.io/pricing , https://docs.livekit.io/deploy/admin/quotas-and-limits/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing
- Cloudflare Realtime SFU pricing: https://developers.cloudflare.com/realtime/sfu/platform/pricing/
- Supabase Realtime limits: https://supabase.com/docs/guides/realtime/limits
- Supabase pricing guides: https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/
- Open Relay free TURN: https://metered.ca/tools/openrelay/
- Oracle Cloud Always Free: https://cloud.oracle.com/free
- DigitalOcean (not planned): https://digitalocean.com/pricing

*Keep this file updated as decisions change. Check boxes in section 5 as stages are finished.*
