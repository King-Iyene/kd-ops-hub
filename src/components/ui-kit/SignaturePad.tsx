import { useRef, useState, useEffect, useCallback, type MouseEvent, type TouchEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Eraser, Check, Type, PenTool } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Props {
  onSign: (dataUrl: string) => void;
  onCancel?: () => void;
  signerName?: string;
  label?: string;
  className?: string;
}

export function SignaturePad({ onSign, onCancel, signerName, label = 'Sign below', className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState(signerName ?? '');

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  }, []);

  useEffect(() => {
    const c = getCtx();
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.canvas.getBoundingClientRect();
    c.canvas.width = rect.width * dpr;
    c.canvas.height = rect.height * dpr;
    c.ctx.scale(dpr, dpr);
    c.ctx.lineCap = 'round';
    c.ctx.lineJoin = 'round';
    c.ctx.lineWidth = 2;
    c.ctx.strokeStyle = '#1a1a2e';
  }, [getCtx]);

  const getPos = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const c = getCtx();
    if (!c) return;
    setDrawing(true);
    const { x, y } = getPos(e);
    c.ctx.beginPath();
    c.ctx.moveTo(x, y);
  };

  const draw = (e: MouseEvent | TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const c = getCtx();
    if (!c) return;
    const { x, y } = getPos(e);
    c.ctx.lineTo(x, y);
    c.ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    setDrawing(false);
  };

  const clear = () => {
    const c = getCtx();
    if (!c) return;
    const rect = c.canvas.getBoundingClientRect();
    c.ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const confirm = () => {
    if (mode === 'type') {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 120);
      ctx.fillStyle = '#1a1a2e';
      ctx.font = 'italic 32px "Georgia", "Times New Roman", serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName, 20, 60);
      onSign(canvas.toDataURL('image/png'));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSign(canvas.toDataURL('image/png'));
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium kd-transition',
              mode === 'draw' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <PenTool className="h-3 w-3" /> Draw
          </button>
          <button
            type="button"
            onClick={() => setMode('type')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium kd-transition',
              mode === 'type' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Type className="h-3 w-3" /> Type
          </button>
        </div>
      </div>

      {mode === 'draw' ? (
        <div className="relative rounded-xl border-2 border-dashed border-border bg-white dark:bg-zinc-950 overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full cursor-crosshair touch-none"
            style={{ height: 120 }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          <div className="absolute bottom-2 left-3 right-3 border-t border-muted-foreground/20" />
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground/40 select-none">
            Sign here
          </p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-border bg-white dark:bg-zinc-950 p-4">
          <Input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your full name"
            className="border-0 border-b rounded-none bg-transparent text-xl font-serif italic focus-visible:ring-0 px-0"
          />
          {typedName && (
            <p className="mt-3 text-[10px] text-muted-foreground/50">
              By typing your name you agree this constitutes your electronic signature.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {mode === 'draw' && (
            <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasDrawn}>
              <Eraser className="h-3.5 w-3.5 mr-1.5" /> Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={confirm}
            disabled={mode === 'draw' ? !hasDrawn : !typedName.trim()}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" /> Confirm Signature
          </Button>
        </div>
      </div>
    </div>
  );
}
