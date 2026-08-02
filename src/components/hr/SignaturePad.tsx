import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PenLine, Eraser, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SignaturePad — pure HTML5 canvas draw-to-sign.
 *
 * Design choices:
 *   • Pointer events (unified mouse + touch + stylus). Passive listeners
 *     switched off on canvas so touchmove drawing doesn't scroll the page.
 *   • Fixed device-pixel-ratio scaling so signatures don't pixelate on
 *     retina / android displays.
 *   • Emits a PNG data-URL on change so callers can persist it directly
 *     without a Storage round-trip. (For documents that need it, we
 *     archive to Storage separately.)
 *   • Simple, dependency-free — no react-signature-canvas / signature_pad
 *     to keep bundle size + supply chain minimal.
 *
 * Callers:
 *   • Offer letters (HireApplicantDialog → SignOfferLetterDialog)
 *   • Policy acknowledgements
 *   • Disciplinary responses
 */

interface Props {
  onChange: (dataUrl: string | null) => void;
  label?: string;
  height?: number;
  disabled?: boolean;
  className?: string;
}

export const SignaturePad = ({
  onChange,
  label = 'Sign here',
  height = 160,
  disabled = false,
  className,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.floor(rect.width  * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // White background so the exported PNG isn't transparent on print.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => {
    setup();
    const onResize = () => {
      setup();
      setHasStroke(false);
      onChange(null);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  const pointerPos = (ev: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    };
  };

  const startStroke = (ev: React.PointerEvent) => {
    if (disabled) return;
    ev.preventDefault();
    drawing.current = true;
    lastPos.current = pointerPos(ev);
    canvasRef.current?.setPointerCapture(ev.pointerId);
  };

  const drawStroke = (ev: React.PointerEvent) => {
    if (!drawing.current || disabled) return;
    ev.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPos.current) return;
    const pos = pointerPos(ev);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    if (!hasStroke) setHasStroke(true);
  };

  const endStroke = (ev: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    canvasRef.current?.releasePointerCapture(ev.pointerId);
    // Emit the current canvas as data URL on stroke end.
    const canvas = canvasRef.current;
    if (canvas && hasStroke) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    setup();
    setHasStroke(false);
    onChange(null);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <PenLine className="h-3.5 w-3.5" />
          {label}
        </span>
        {hasStroke && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={clear}
          >
            <Eraser className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>
      <div
        className={cn(
          'rounded-md border-2 bg-white overflow-hidden touch-none',
          hasStroke ? 'border-emerald-400' : 'border-dashed border-muted-foreground/30',
          disabled && 'opacity-60 pointer-events-none',
        )}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-crosshair"
          onPointerDown={startStroke}
          onPointerMove={drawStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
      </div>
      {hasStroke ? (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <Check className="h-3 w-3" /> Signature captured
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Draw with your mouse, finger, or stylus.
        </p>
      )}
    </div>
  );
};

export default SignaturePad;
