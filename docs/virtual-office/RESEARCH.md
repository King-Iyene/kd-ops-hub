# Virtual Office: competitor and market research

Researched 18 Nov 2026 from public web pages. Prices come from vendor pages and third-party listings that disagree with each other, so confirm on each vendor's own site before quoting them to anyone. Several sources are written by a competitor (SoWork's own blog), so treat their claims as marketing.

## What the other products do

| Product | Price (as found) | What stands out |
|---|---|---|
| **SoWork** | Free for up to 10 members (30-minute meeting limit); Premium about $12 per member per month (other sources say $6 to $15); Enterprise by quote | Walk up to someone and you connect if you are both "Available"; Focus modes; calendar sync (Google and Outlook); AI meeting memory (summaries); topic chat; **visitor pass that lets a guest in for 2 hours**; recordings on paid plans; SSO and SCIM for large teams |
| **Kumospace** | Free for up to 5 members; Business about $16 per user per month; Enterprise by quote | Spatial audio; fully customisable floor templates; integrations; desktop and mobile apps on every plan; unlimited chat history and user analytics are paid |
| **Gather** | Official: $15 per user per month billed monthly, $12 billed yearly (from 1 Jan 2026); 30-day trial; no free plan per most listings | Pixel-art spaces, unlimited audio, video and chat, recordings, calendar integration, up to 100 members on Essential, a Mapmaker, strong social feel |
| Katmai (one listing) | about $25 per user per month | Photorealistic 3D office |

Nobody here has a Nigerian offering, naira pricing, or a data-saver mode that we could find.

## Where our office already matches or beats them

- Proximity voice and video, screen share, meeting rooms with locks and knock, recordings (now video), reactions with a full emoji picker, follow, ring, wave, messages with pictures and links.
- Living world: pets that follow and fetch, ambient sound that fades with distance, Nigerian day and night on WAT, Harmattan and rainy seasons, live weather per person, a wall clock with several time zones, a core values wall and notice board that admins edit.
- Private claimable offices and desk seats, a Manage space hub, invite-only membership tied to payroll groups.
- Built into KD Ops itself, so people, payroll groups and roles are already there. No competitor has that.

## What they have that we do not (yet)

1. **Guest pass** (SoWork: 2 hours). Needs a sign-in for people without an account. Highest value for selling it, and for client or interview visits.
2. **Calendar link** so the office shows who is in a meeting and when people are free.
3. **AI meeting memory**: transcripts and summaries of recordings.
4. **Focus modes** that silence rings. (Added now: rings and waves are silent when your status is Focusing or In a meeting.)
5. **Analytics** for admins: who was where, meeting time, attendance.
6. **Mobile layout**. Many Nigerian staff will join on phones.
7. **SSO and SCIM** for bigger customers.

## The Nigerian market

- **Hybrid work is real but under-served.** One survey reports 31% of Nigerian businesses already hybrid, above the global figure of about 25%. Barriers named are power, internet cost and fragmented tools.
- **Data cost is the daily pain.** About 70% of internet users spend up to ₦1,000 a month on data, and remote staff usually carry the cost themselves. Employers are being asked for data allowances. A product that works well on low data is a real selling point.
- **Power is the other problem.** Most "internet problems" are power cuts. The product should reconnect quickly and never lose a meeting or a recording to a refresh.
- **Paying in naira matters.** Paystack and Flutterwave both do recurring billing that settles in a Nigerian account. Foreign-currency recurring payments are unreliable for many Nigerian firms, so naira pricing is an advantage over every competitor above, which all price in dollars. KD Ops already integrates Paystack.
- **Not found:** no source sizes the Nigerian virtual office or coworking market, and no survey says what Nigerian B2B buyers will pay for collaboration tools. Treat any market-size number as unknown until someone runs a few paid pilots.

## What this suggests we build, in order

1. Data-saver mode (small camera, low bitrate, audio first). Added now.
2. Rings and waves respect Focus and In a meeting. Added now.
3. Native desktop app with real notifications, tray and start-at-login (so people never go inactive). In progress.
4. Guest pass with a 2-hour link and a knock-to-enter step (needs anonymous sign-in switched on in Supabase, which is a security decision for the owner).
5. Mobile layout and a minimap.
6. Admin analytics and attendance.
7. AI meeting summaries from recordings.
8. Naira pricing page and Paystack subscriptions if it is ever sold outside KD Squares.

## Sources

- [SoWork pricing](https://sowork.com/digital-office-pricing), [SoWork features](https://sowork.com/features), [Capterra: SoWork](https://www.capterra.com.sg/software/1079506/SoWork)
- [Kumospace pricing (third party)](https://toolradar.com/tools/kumospace/pricing), [Kumospace pricing FAQ](https://development.kumospace.com/help/pricing-faq)
- [Gather pricing changes](https://support.gather.town/hc/en-us/articles/39590892978196)
- [Zoho: 31% of Nigerian businesses hybrid (Guardian Nigeria)](https://guardian.ng/news/31-of-businesses-in-nigeria-now-hybrid-zoho-reveals/)
- [The cost of connection: data and remote workers in Nigeria](https://innovation-village.com/the-cost-of-connection-how-data-is-draining-remote-workers-in-nigeria)
- [Paystack vs Flutterwave recurring billing, Nigeria 2026](https://kolonell.com/en/blog/paystack-vs-flutterwave-recurring-billing-subscriptions-nigeria-2026)
