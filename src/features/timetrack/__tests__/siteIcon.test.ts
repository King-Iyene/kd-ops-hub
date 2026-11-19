import { describe, expect, it } from 'vitest';
import { domainFor } from '../ui/SiteIcon';

describe('which website a name belongs to', () => {
  it('knows the big sites by their plain name, so they get their real logo instead of a letter', () => {
    expect(domainFor('Instagram')).toBe('instagram.com');
    expect(domainFor('Facebook')).toBe('facebook.com');
    expect(domainFor('YouTube')).toBe('youtube.com');
    expect(domainFor('LinkedIn')).toBe('linkedin.com');
    expect(domainFor('Netflix')).toBe('netflix.com');
  });
  it('keeps YouTube Music apart from YouTube', () => {
    expect(domainFor('YouTube Music')).toBe('music.youtube.com');
  });
  it('still takes a real web address as it is, and the apps it already knew', () => {
    expect(domainFor('www.example.com')).toBe('example.com');
    expect(domainFor('Slack')).toBe('slack.com');
    expect(domainFor('Some unknown tool')).toBeNull();
  });
});
