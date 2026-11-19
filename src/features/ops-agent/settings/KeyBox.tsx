import { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAiStatus, useClearClaudeKey, useSetClaudeKey } from '@/queries/useOpsAgent';
import { useAgentToast } from './useAgentToast';

/**
 * The Claude key, write only. Nothing here can show it: the box is cleared the moment it is sent, the server tries the
 * key with Claude before saving it, and this screen only ever learns "set" or "not set" and where it is kept.
 */
export function KeyBox({ readOnly }: { readOnly: boolean }) {
  const status = useAiStatus();
  const setKey = useSetClaudeKey();
  const clearKey = useClearClaudeKey();
  const toast = useAgentToast();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    const key = value.trim();
    if (!key) return;
    setProblem(null);
    setValue(''); // gone from the page whatever happens next
    setKey.mutate(key, {
      onSuccess: (r) => (r.ok ? toast.saved('Claude key saved. It works.') : setProblem(r.error ?? 'The key was not accepted.')),
      onError: (e) => setProblem(e.message),
    });
  };

  const s = status.data;
  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="key-box">
      <div className="flex flex-wrap items-center gap-3" data-testid="ai-status">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Claude key</span>
        {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : s ? (
          s.key_configured
            ? <Badge variant="outline" className="gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Set</Badge>
            : <Badge variant="outline" className="gap-1 text-amber-600"><XCircle className="h-3 w-3" /> Not set</Badge>
        ) : <Badge variant="outline">Unknown: the agent-ai function did not answer</Badge>}
        {s?.key_configured && <span className="text-xs text-muted-foreground">{s.key_source === 'env' ? 'Kept as a Supabase secret.' : 'Saved from this page and kept encrypted.'}</span>}
      </div>

      {!readOnly && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="password" name="claude-key-entry" autoComplete="off" spellCheck={false} data-lpignore="true" className="max-w-md flex-1 font-mono"
              placeholder={s?.key_configured ? 'Paste a new key to replace it' : 'Paste a Claude API key (starts with sk-ant-)'}
              value={value} onChange={(e) => setValue(e.target.value)} aria-label="Claude API key"
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
            <Button size="sm" onClick={save} disabled={!value.trim() || setKey.isPending} data-testid="key-save">
              {setKey.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Check and save
            </Button>
            {s?.key_source === 'vault' && (
              <Button size="sm" variant="ghost" disabled={clearKey.isPending} onClick={() => clearKey.mutate(undefined, { onSuccess: () => toast.saved('Saved key removed'), onError: toast.failed })}>
                Remove saved key
              </Button>
            )}
          </div>
          {problem && <p className="text-sm text-destructive" role="alert" data-testid="key-problem">{problem}</p>}
          <p className="text-xs text-muted-foreground">
            The key is sent to Claude once to make sure it works, then stored encrypted. It is never shown again here, in logs or in the change log.
            Use a key created inside a workspace in the Anthropic Console.
          </p>
        </>
      )}
    </div>
  );
}
