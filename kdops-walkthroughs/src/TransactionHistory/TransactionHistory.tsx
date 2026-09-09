import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { THIntroScene } from "./THIntroScene";
import { THSearchTransactionsScene } from "./THSearchTransactionsScene";
import { THTransactionDetailScene } from "./THTransactionDetailScene";
import { THTroubleshootScene } from "./THTroubleshootScene";
import { THOutroScene } from "./THOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 660,
        file: "voiceover/21-TransactionHistory/intro.mp3"
    },
    {
        startFrame: 645,
        durationFrames: 990,
        file: "voiceover/21-TransactionHistory/search.mp3"
    },
    {
        startFrame: 1620,
        durationFrames: 870,
        file: "voiceover/21-TransactionHistory/details.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 660,
        file: "voiceover/21-TransactionHistory/troubleshoot.mp3"
    },
    {
        startFrame: 3120,
        durationFrames: 450,
        file: "voiceover/21-TransactionHistory/outro.mp3"
    }
];

export const TransactionHistory: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Intro">
        <THIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={33 * fps} name="SearchTransactions">
        <THSearchTransactionsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={29 * fps} name="TransactionDetail">
        <THTransactionDetailScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Troubleshooting">
        <THTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Outro">
        <THOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
