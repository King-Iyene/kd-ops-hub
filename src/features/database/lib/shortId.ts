const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function uuidToShort(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  let num = BigInt('0x' + hex);
  let result = '';
  while (num > 0n) {
    result = CHARS[Number(num % 62n)] + result;
    num = num / 62n;
  }
  return result || '0';
}

export function shortToUuid(short: string): string {
  let num = 0n;
  for (const ch of short) {
    const idx = CHARS.indexOf(ch);
    if (idx < 0) return short;
    num = num * 62n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function resolveId(param: string): string {
  if (isUuid(param)) return param;
  return shortToUuid(param);
}
