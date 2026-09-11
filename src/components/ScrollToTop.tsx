import { useCallback, useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    const onScroll = () => setVisible(main.scrollTop > 400);
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  const scrollUp = useCallback(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <button
      type="button"
      onClick={scrollUp}
      aria-label="Scroll to top"
      className={cn(
        'fixed z-30 right-5 bottom-20 md:bottom-6 h-10 w-10 rounded-full',
        'bg-primary text-primary-foreground shadow-lg shadow-primary/25',
        'flex items-center justify-center',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        visible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-4 scale-75 pointer-events-none',
      )}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
