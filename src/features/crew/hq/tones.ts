import type { Risk } from '../crewDb';

export type Tone = 'neutral' | 'signal' | 'ok' | 'warn' | 'risk' | 'meet';

export const riskTone = (r: Risk): Tone => (r === 'high' ? 'risk' : r === 'medium' ? 'warn' : 'ok');
export const statusTone = (s: string): 'ok' | 'signal' | 'warn' | 'meet' | 'neutral' => (s === 'idle' ? 'ok' : s === 'working' || s === 'thinking' || s === 'walking' ? 'signal' : s === 'waiting_approval' ? 'warn' : s === 'meeting' ? 'meet' : 'neutral');
export const STATUS_WORD: Record<string, string> = { idle: 'Idle', working: 'Working', thinking: 'Thinking', waiting_approval: 'Waiting for you', walking: 'Walking', meeting: 'In a meeting', offline: 'Offline' };
