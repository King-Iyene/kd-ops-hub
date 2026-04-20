import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — KDOps`;
    return () => { document.title = 'KDOps'; };
  }, [title]);
}
