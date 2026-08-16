import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  page: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onPageChange?: (page: number) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPrev,
  onNext,
  onPageChange,
  hasPrev,
  hasNext,
  className,
}: Props) {
  const canPrev = hasPrev ?? page > 0;
  const canNext = hasNext ?? page < totalPages - 1;

  const goPrev = () => {
    if (onPageChange) onPageChange(Math.max(0, page - 1));
    else onPrev?.();
  };
  const goNext = () => {
    if (onPageChange) onPageChange(Math.min(totalPages - 1, page + 1));
    else onNext?.();
  };

  return (
    <div className={cn('flex items-center justify-between gap-3 flex-wrap', className)}>
      {totalItems != null && pageSize != null ? (
        <span className="text-xs text-muted-foreground">
          Showing {totalItems === 0 ? 0 : page * pageSize + 1}-
          {Math.min((page + 1) * pageSize, totalItems)} of{' '}
          {totalItems.toLocaleString()}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canPrev} onClick={goPrev}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        {totalItems != null && (
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
        )}
        <Button variant="outline" size="sm" disabled={!canNext} onClick={goNext}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
