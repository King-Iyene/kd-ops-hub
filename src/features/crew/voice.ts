// Free voice for the agents, using the browser's own speech engines (no service, no cost, no tokens).
//   speak(): an agent talks to you. Each agent gets a stable voice (the same pitch and speed every time) picked from the voices on this computer.
//   listen(): you talk to an agent; the browser turns your speech into text. Nothing is sent anywhere by us.
// Both are optional: when a browser lacks them the buttons are hidden and everything else works.

export interface VoiceProfile { pitch: number; rate: number; voiceIndex: number }

/** A small stable number from a name, so the same agent always sounds the same. */
export function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function voiceFor(slug: string): VoiceProfile {
  const h = hash(slug);
  return { pitch: 0.8 + ((h % 7) / 7) * 0.7, rate: 0.95 + (((h >> 3) % 5) / 5) * 0.2, voiceIndex: (h >> 7) % 1000 };
}

/** Text that is pleasant to hear: no markdown marks, no raw ids, no links read letter by letter. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code omitted. ')
    .replace(/https?:\/\/\S+/g, ' a link ')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ' an id ')
    .replace(/[*_`#>|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export function speak(text: string, slug: string): void {
  if (!canSpeak()) return;
  const say = speakable(text);
  if (!say) return;
  const p = voiceFor(slug);
  const u = new SpeechSynthesisUtterance(say);
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (voices.length > 0) u.voice = voices[p.voiceIndex % voices.length];
  u.pitch = p.pitch;
  u.rate = p.rate;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

interface RecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = (): boolean => recognitionCtor() !== null;

/** Starts listening; returns a stop function. onText gets the whole sentence so far. */
export function listen(onText: (text: string, final: boolean) => void, onEnd: () => void, lang = 'en-NG'): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) { onEnd(); return () => undefined; }
  const r = new Ctor();
  r.lang = lang;
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    onText(text, false);
  };
  r.onerror = () => onEnd();
  r.onend = () => onEnd();
  r.start();
  return () => { try { r.stop(); } catch { /* already stopped */ } };
}
