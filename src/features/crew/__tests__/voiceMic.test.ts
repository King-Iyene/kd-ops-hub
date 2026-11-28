import { afterEach, describe, expect, it, vi } from 'vitest';
import { listen, micProblem } from '../voice';

describe('the microphone', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('tells the person what to do for each way it can fail', () => {
    expect(micProblem('not-allowed')).toMatch(/blocked the microphone/);
    expect(micProblem('audio-capture')).toMatch(/No microphone/);
    expect(micProblem('no-speech')).toMatch(/did not hear/);
    expect(micProblem('network')).toMatch(/internet/);
    expect(micProblem(undefined)).toMatch(/stopped/);
  });

  it('reports a blocked microphone to the page instead of doing nothing', () => {
    class Fake {
      lang = ''; interimResults = false; continuous = false;
      onresult: unknown = null; onend: (() => void) | null = null; onerror: ((e: { error?: string }) => void) | null = null;
      start() { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }
      stop() { /* nothing */ }
    }
    vi.stubGlobal('window', { SpeechRecognition: Fake });
    const ended: (string | undefined)[] = [];
    listen(() => undefined, (p) => ended.push(p));
    expect(ended).toEqual(['not-allowed']);
  });

  it('tries plain English once when the browser does not know en-NG, and passes the words on', () => {
    const langs: string[] = [];
    class Fake {
      lang = ''; interimResults = false; continuous = false;
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: { error?: string }) => void) | null = null;
      start() {
        langs.push(this.lang);
        if (this.lang === 'en-NG') { this.onerror?.({ error: 'language-not-supported' }); this.onend?.(); return; }
        this.onresult?.({ results: [[{ transcript: 'pay the rent' }]] });
        this.onend?.();
      }
      stop() { /* nothing */ }
    }
    vi.stubGlobal('window', { webkitSpeechRecognition: Fake });
    const heard: string[] = [];
    const ended: (string | undefined)[] = [];
    listen((t) => heard.push(t), (p) => ended.push(p));
    expect(langs).toEqual(['en-NG', 'en-US']);
    expect(heard).toEqual(['pay the rent']);
    expect(ended).toEqual([undefined]);
  });
});
