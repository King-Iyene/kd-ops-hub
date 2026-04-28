import { useMemo, useState } from 'react';

/**
 * Client-side pagination for already-loaded arrays. Returns the current page
 * slice plus helpers to move between pages. The pageSize defaults to 20 to
 * match the KDOps table convention.
 */
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const slice = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize],
  );

  const next = () => setPage((p) => Math.min(p + 1, totalPages - 1));
  const prev = () => setPage((p) => Math.max(p - 1, 0));
  const reset = () => setPage(0);

  return {
    page: safePage,
    pageSize,
    totalPages,
    totalItems: items.length,
    slice,
    items: slice, // alias — some pages use .items, others use .slice
    next,
    prev,
    setPage,
    reset,
    hasNext: safePage < totalPages - 1,
    hasPrev: safePage > 0,
  };
}
