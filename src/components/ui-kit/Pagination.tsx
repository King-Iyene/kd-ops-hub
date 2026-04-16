import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  page: number; // 0-based
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: Props) {
  const start = totalItems === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t gap-3 flex-wrap">
      <span className="text-xs text-muted-foreground">
        Showing {start}-{end} of {totalItems.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
