import { Flag, Heart, Star, ThumbsUp } from 'lucide-react';
import type { RatingIcon } from '../../lib/ratingStyle';

const GLYPHS = { star: Star, heart: Heart, flag: Flag, thumb: ThumbsUp } as const;

/** One rating icon, filled or outlined, in the field's colour. Same size in the cell and the editor. */
export function RatingGlyph({
  icon,
  filled,
  hex,
  size = 14,
}: {
  icon: RatingIcon;
  filled: boolean;
  hex: string;
  size?: number;
}) {
  const Glyph = GLYPHS[icon];
  return (
    <Glyph
      size={size}
      fill={filled ? hex : 'none'}
      stroke={filled ? hex : 'currentColor'}
      strokeWidth={1.5}
      className={filled ? '' : 'text-[#D1D5DB] dark:text-[hsl(220,15%,35%)]'}
      aria-hidden
    />
  );
}
