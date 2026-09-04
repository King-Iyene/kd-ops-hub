import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useDatabaseUI } from '../lib/store';

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useDatabaseUI();
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setSearchQuery(localValue);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [localValue, setSearchQuery]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleClear = useCallback(() => {
    setLocalValue('');
    setSearchQuery('');
    setOpen(false);
  }, [setSearchQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpen]);

  if (!open && !searchQuery) {
    return (
      <button
        className="h-7 px-2 rounded text-xs flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)]"
        style={{ color: '#6A7184' }}
        onClick={handleOpen}
      >
        <Search size={14} />
      </button>
    );
  }

  return (
    <div
      className="flex items-center h-7 rounded border px-2 gap-1.5"
      style={{ borderColor: '#166EE1', width: 240 }}
    >
      <Search size={13} style={{ color: '#9AA2AF' }} className="shrink-0" />
      <input
        ref={inputRef}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') handleClear(); }}
        placeholder="Search records..."
        className="flex-1 text-xs outline-none bg-transparent text-[#374151] dark:text-[hsl(200,25%,88%)]"
      />
      {localValue && (
        <button onClick={handleClear} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)]">
          <X size={12} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
        </button>
      )}
    </div>
  );
}
