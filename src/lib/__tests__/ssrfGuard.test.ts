import { describe, expect, it } from 'vitest';
import { checkUrlShape, isPrivateAddress } from '../../../supabase/functions/_shared/ssrf-guard';

describe('private addresses', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '[::1]',
  ])('%s is private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '203.0.113.9', '2606:4700:4700::1111'])('%s is public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it('treats unreadable text as unsafe', () => {
    expect(isPrivateAddress('')).toBe(true);
    expect(isPrivateAddress('999.1.1.1')).toBe(true);
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('webhook address shape', () => {
  it('accepts an ordinary https address', () => {
    expect(checkUrlShape('https://hooks.example.com/abc?x=1').ok).toBe(true);
  });

  it.each([
    'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url',
    'http://localhost:3000/x', 'http://api.localhost/x', 'http://db.internal/x', 'http://printer.local/x',
    'http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/x', 'http://10.0.0.5/x',
    'https://user:pass@example.com/x',
  ])('refuses %s', (url) => {
    expect(checkUrlShape(url).ok).toBe(false);
  });

  it('lets a public address literal through', () => {
    expect(checkUrlShape('http://8.8.8.8/x').ok).toBe(true);
  });
});
