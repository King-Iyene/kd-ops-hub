// The one door an executive's session uses to talk to the Crew gateway: node crew-call.mjs '{"op":"whoami"}'
// The key comes from the environment (CREW_KEY), set only for that session by the daemon, so it is never typed into a command or a transcript.
// The answer is printed, cut to a size that is easy on tokens.

const GATEWAY = process.env.CREW_GATEWAY || 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/crew-gateway';
const key = process.env.CREW_KEY;
const arg = process.argv.slice(2).join(' ').trim();

if (!key) { console.error('No CREW_KEY: run this only inside a Crew session.'); process.exit(2); }
let body;
try { body = JSON.parse(arg); } catch { console.error('Pass one JSON object, for example: node crew-call.mjs \'{"op":"whoami"}\''); process.exit(2); }

try {
  const res = await fetch(GATEWAY, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  const max = Number(process.env.CREW_CALL_MAX || 14000);
  console.log((res.ok ? '' : `HTTP ${res.status} `) + (text.length > max ? text.slice(0, max) + ` ...[cut: ${text.length - max} more characters; ask for fewer rows]` : text));
} catch (e) {
  console.error('Could not reach the gateway: ' + e.message);
  process.exit(1);
}
