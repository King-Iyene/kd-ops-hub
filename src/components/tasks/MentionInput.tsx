import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ProfileRow } from '@/lib/task-types';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  profiles: Map<string, ProfileRow>;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  minRows?: number;
}

export function MentionInput({
  value,
  onChange,
  onSubmit,
  profiles,
  placeholder,
  className,
  autoFocus,
  minRows = 2,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const profileList = useMemo(() => Array.from(profiles.values()), [profiles]);

  const filtered = useMemo(() => {
    if (!mentionQuery) return profileList.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return profileList
      .filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [profileList, mentionQuery]);

  const checkForMention = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1]);
      setMentionStart(cursorPos - atMatch[0].length);
      setSelectedIndex(0);
    } else {
      setShowMentions(false);
    }
  }, []);

  const insertMention = useCallback((profile: ProfileRow) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(textareaRef.current?.selectionStart ?? mentionStart + mentionQuery.length + 1);
    const mentionName = profile.full_name.replace(/\s+/g, '.');
    const newValue = `${before}@${mentionName} ${after}`;
    onChange(newValue);
    setShowMentions(false);
    setTimeout(() => {
      const pos = mentionStart + mentionName.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }, [value, mentionStart, mentionQuery, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filtered[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    checkForMention(newValue, e.target.selectionStart ?? newValue.length);
  };

  const handleClick = () => {
    if (textareaRef.current) {
      checkForMention(value, textareaRef.current.selectionStart ?? value.length);
    }
  };

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        placeholder={placeholder}
        rows={minRows}
        className={cn(
          'w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'resize-none',
          className,
        )}
      />
      <p className="text-[9px] text-muted-foreground mt-0.5">
        Ctrl+Enter to submit · Type @ to mention
      </p>
      {showMentions && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 bottom-full mb-1 w-64 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg z-50"
        >
          {filtered.map((p, i) => (
            <button
              key={p.id}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/60 transition-colors',
                i === selectedIndex && 'bg-muted/60',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(p);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="text-[7px] font-bold">
                  {p.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{p.full_name}</p>
                <p className="text-[9px] text-muted-foreground truncate">{p.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
