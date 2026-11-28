import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCrewKnowledge, useSetKnowledge } from '../useCrew';
import { Empty } from './shared';
import { ago } from '../helpers';

export function BrainTab() {
  const { toast } = useToast();
  const brain = useCrewKnowledge();
  const save = useSetKnowledge();
  const [topic, setTopic] = useState('');
  const [body, setBody] = useState('');
  const edit = (t: string, b: string) => { setTopic(t); setBody(b); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">The company brain: what every agent reads first (clients, products, repos, money rules). Only you edit it directly. An agent that finds something wrong or missing proposes a change, which waits for you in Approvals.</p>
      <div className="rounded-lg border bg-card p-4">
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (for example: offers)" className="mb-2" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="What the agents must know. Facts only; say where each fact came from." />
        <Button className="mt-2" size="sm" disabled={topic.trim().length < 2 || save.isPending} onClick={() => save.mutate({ topic: topic.trim(), body }, {
          onSuccess: () => { toast({ title: 'Saved to the company brain' }); setTopic(''); setBody(''); },
          onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }),
        })}>Save</Button>
      </div>
      {!brain.isLoading && (brain.data ?? []).length === 0 ? <Empty>The brain is empty.</Empty> : null}
      <div className="space-y-3">
        {(brain.data ?? []).map((k) => (
          <div key={k.topic} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{k.topic}<span className="ml-2 text-xs font-normal text-muted-foreground">{ago(k.updated_at)}{k.updated_by_agent ? ' · changed by an agent (approved)' : ''}</span></div>
              <Button size="sm" variant="ghost" onClick={() => edit(k.topic, k.body)}>Edit</Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{k.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
