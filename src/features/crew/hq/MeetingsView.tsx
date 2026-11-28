// MEETINGS: call and watch live meetings, read the team channel, and read the owner's inbox history. All three are the existing screens.
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChannelTab } from '../components/ChannelTab';
import { MeetingsTab } from '../components/MeetingsTab';
import { MessagesTab } from '../components/MessagesTab';

export type MeetingsSub = 'meetings' | 'channel' | 'messages';
const SUBS: { key: MeetingsSub; label: string }[] = [{ key: 'meetings', label: 'Meetings' }, { key: 'channel', label: 'Team channel' }, { key: 'messages', label: 'Messages' }];

export function MeetingsView({ topic, sub, onSub }: { topic?: string; sub: MeetingsSub; onSub: (s: MeetingsSub) => void }) {
  const [seen] = useState(topic);
  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap rounded-xl bg-muted p-1" role="tablist" aria-label="Meetings and conversations">
        {SUBS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={sub === s.key} onClick={() => onSub(s.key)} className={cn('hq-focus rounded-lg px-3 py-1.5 text-sm font-bold transition', sub === s.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{s.label}</button>)}
      </div>
      {sub === 'meetings' ? <MeetingsTab initialTopic={topic ?? seen} /> : null}
      {sub === 'channel' ? <ChannelTab /> : null}
      {sub === 'messages' ? <MessagesTab /> : null}
    </div>
  );
}
