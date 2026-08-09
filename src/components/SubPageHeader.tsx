import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubPageHeaderProps {
  parentTitle: string;
  currentTitle: string;
  onBack: () => void;
}

export function SubPageHeader({ parentTitle, currentTitle, onBack }: SubPageHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">{parentTitle}</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{currentTitle}</span>
      </div>
    </div>
  );
}
