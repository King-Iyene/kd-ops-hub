// InfoTip — thin wrapper around <InfoHint> that takes a text string
// instead of children. Kept for backwards compatibility with the
// many call sites that pass `text="..."`. New code should prefer
// <InfoHint>...</InfoHint> directly.
import { InfoHint } from './InfoHint';

interface Props {
  text: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function InfoTip({ text, side = 'bottom' }: Props) {
  return <InfoHint side={side}>{text}</InfoHint>;
}
