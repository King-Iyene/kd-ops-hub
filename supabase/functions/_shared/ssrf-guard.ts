// Keeps outbound webhook calls from reaching the server's own network. Used by the automation runner so a
// "send webhook" step cannot be pointed at localhost, a private address or the cloud metadata service, either
// directly or through a hostname that resolves to one.
//
// The pure checks (isPrivateAddress, checkUrlShape) have no network access and are unit tested; assertSafeUrl adds
// the DNS lookup that only runs inside the edge function.

/** True for addresses that are not on the public internet. Accepts IPv4 and IPv6 text; anything unreadable is treated as unsafe. */
export function isPrivateAddress(address: string): boolean {
  const a = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (a === '') return true;

  // IPv4 (also IPv4-mapped IPv6 such as ::ffff:127.0.0.1)
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : /^\d+\.\d+\.\d+\.\d+$/.test(a) ? a : null;
  if (v4) {
    const p = v4.split('.').map(Number);
    if (p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [x, y] = p;
    return (
      x === 0 ||
      x === 10 ||
      x === 127 ||
      (x === 100 && y >= 64 && y <= 127) || // carrier-grade NAT
      (x === 169 && y === 254) || // link local, includes the cloud metadata address
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 0) ||
      (x === 192 && y === 168) ||
      (x === 198 && (y === 18 || y === 19)) ||
      x >= 224 // multicast and reserved
    );
  }

  if (a.includes(':')) {
    if (a === '::' || a === '::1') return true;
    return (
      a.startsWith('fc') || a.startsWith('fd') || // unique local
      a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb') || // link local
      a.startsWith('ff') // multicast
    );
  }

  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Everything that can be decided from the text of the address alone. */
export function checkUrlShape(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'The webhook address is not a valid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'Only http and https addresses are allowed' };
  if (url.username || url.password) return { ok: false, reason: 'Addresses with a username or password are not allowed' };
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return { ok: false, reason: 'Addresses on the local network are not allowed' };
  }
  const literal = host.replace(/^\[|\]$/g, '');
  if ((/^[\d.]+$/.test(literal) || literal.includes(':')) && isPrivateAddress(literal)) {
    return { ok: false, reason: 'Addresses on a private network are not allowed' };
  }
  return { ok: true, url };
}

/**
 * Shape check plus a DNS lookup, so a name that points at a private address is refused too. Returns a reason
 * to show in the run history, or null when the address is fine.
 */
export async function assertSafeUrl(raw: string): Promise<string | null> {
  const shape = checkUrlShape(raw);
  if (!shape.ok) return shape.reason;
  const host = shape.url.hostname.replace(/^\[|\]$/g, '');
  if (/^[\d.]+$/.test(host) || host.includes(':')) return null; // an address literal was already checked

  const found: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      found.push(...(await Deno.resolveDns(host, type)));
    } catch {
      // No record of this kind is normal; no records at all is handled below.
    }
  }
  if (found.length === 0) return 'The webhook address could not be resolved';
  if (found.some(isPrivateAddress)) return 'The webhook address points to a private network';
  return null;
}
