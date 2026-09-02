import React, { useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useComments, useCreateComment, useDeleteComment } from '../hooks/useComments';

interface RecordCommentsProps {
  baseId: string;
  tableId: string;
  recordId: string;
  userEmail?: string | null;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const AVATAR_COLORS = [
  '#3366FF', '#E11D48', '#16A34A', '#CA8A04', '#9333EA',
  '#0891B2', '#EA580C', '#4F46E5',
];

function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function RecordComments({ baseId, tableId, recordId, userEmail }: RecordCommentsProps) {
  const { data: comments, isLoading } = useComments(tableId, recordId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    createComment.mutate({
      baseId,
      tableId,
      recordId,
      userEmail: userEmail ?? null,
      comment: trimmed,
    });
    setText('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {isLoading && (
          <p className="text-xs text-[#9AA2AF] text-center py-4">Loading...</p>
        )}
        {!isLoading && (!comments || comments.length === 0) && (
          <div className="flex flex-col items-center justify-center py-8 text-[#9AA2AF]">
            <MessageSquare size={28} className="mb-2 opacity-40" />
            <p className="text-sm">No comments yet</p>
          </div>
        )}
        {comments?.map((c) => {
          const email = c.user_email || 'Unknown';
          const initial = email.charAt(0).toUpperCase();
          return (
            <div key={c.id} className="group flex gap-2.5">
              <div
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                style={{ backgroundColor: avatarColor(email) }}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
                    {email}
                  </span>
                  <span className="text-[10px] text-[#9AA2AF] shrink-0">
                    {timeAgo(c.created_at)}
                  </span>
                  <button
                    onClick={() =>
                      deleteComment.mutate({
                        commentId: c.id,
                        tableId,
                        recordId,
                      })
                    }
                    className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                    title="Delete comment"
                  >
                    <Trash2 size={12} className="text-[#9AA2AF] hover:text-red-500" />
                  </button>
                </div>
                <p className="text-sm text-[#374151] dark:text-[hsl(200,25%,88%)] mt-0.5 whitespace-pre-wrap break-words">
                  {c.comment}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] pt-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Write a comment..."
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none focus:border-[#3366FF] placeholder:text-[#9AA2AF]"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || createComment.isPending}
          className="p-2 rounded-lg bg-[#3366FF] text-white hover:bg-[#2952cc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
