/**
 * WhatsAppButton — opens a `wa.me` deep link for the given phone.
 *
 * Nigerian SMEs run on WhatsApp; surfacing a one-click message
 * action on contractor / employee profiles cuts the friction of
 * "copy phone → open WhatsApp → paste". Uses the wa.me handler so
 * web, iOS and Android all open the right WhatsApp client.
 *
 * Phone normalisation:
 *   • strips spaces, dashes, dots, parens
 *   • drops a leading "+"
 *   • converts a domestic Nigerian "0XXX..." prefix to "234XXX..."
 *     so the link works for numbers stored either way.
 */
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  phone: string | null | undefined;
  text?: string;
  size?: 'icon' | 'sm' | 'default';
  variant?: 'default' | 'outline' | 'ghost';
  label?: string;
  className?: string;
  /** When the parent is itself a clickable row, pass true so the
   *  button doesn't bubble the click and trigger row-level
   *  navigation. */
  stopPropagation?: boolean;
}

export function whatsAppHref(phone: string, text?: string): string | null {
  let p = phone.replace(/[\s.\-()]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0') && p.length === 11) p = '234' + p.slice(1);
  if (!/^\d{10,15}$/.test(p)) return null;
  const url = `https://wa.me/${p}`;
  return text ? `${url}?text=${encodeURIComponent(text)}` : url;
}

export function WhatsAppButton({
  phone, text, size = 'icon', variant = 'ghost',
  label, className, stopPropagation,
}: Props) {
  const href = phone ? whatsAppHref(phone, text) : null;
  if (!href) return null;
  const onClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer');
  };
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onClick}
      title={label || 'Send WhatsApp message'}
      aria-label={label || 'Send WhatsApp message'}
      className={cn(
        'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10',
        'dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-400/10',
        className,
      )}
    >
      <MessageCircle className={cn(size === 'icon' ? 'h-4 w-4' : 'h-4 w-4 mr-1.5')} />
      {size !== 'icon' && (label || 'WhatsApp')}
    </Button>
  );
}
