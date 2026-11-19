import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { useAiStatus } from '@/queries/useOpsAgent';

/** Ask the agent questions about the business. Chat is built in Phase 4; this holds its place. */
export function ChatTab() {
  const status = useAiStatus();
  const off = status.data && (!status.data.key_configured || !status.data.ai_enabled);
  return (
    <EmptyState
      icon={MessageSquare}
      title="Chat is not available yet"
      description={
        off
          ? 'Chat arrives in a later phase and needs AI switched on in Settings (and the Claude key set). Nothing here can reach the AI today.'
          : 'Chat arrives in a later phase. Nothing here can reach the AI today.'
      }
    />
  );
}
