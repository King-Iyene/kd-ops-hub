import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuickCreateDialog } from '../tasks/QuickCreateDialog';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable || el.getAttribute('role') === 'textbox';
}

/** The "+ Task" primary button in the top bar (section 6.3) and its `T`
 *  shortcut (section 7.11) — mounted only while on a /task route. */
export function TaskQuickCreateHeaderButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 't' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <Button size="sm" className="h-8 gap-1" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Task
      </Button>
      <QuickCreateDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
