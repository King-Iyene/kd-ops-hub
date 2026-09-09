import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { PBIntroScene } from "./PBIntroScene";
import { PBBatchOverviewScene } from "./PBBatchOverviewScene";
import { PBCreateBatchScene } from "./PBCreateBatchScene";
import { PBBatchApprovalScene } from "./PBBatchApprovalScene";
import { PBTroubleshootScene } from "./PBTroubleshootScene";
import { PBOutroScene } from "./PBOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 120,
        file: "voiceover/07-PaymentBatches/intro.mp3"
    },
    {
        startFrame: 105,
        durationFrames: 240,
        file: "voiceover/07-PaymentBatches/overview.mp3"
    },
    {
        startFrame: 330,
        durationFrames: 240,
        file: "voiceover/07-PaymentBatches/create.mp3"
    },
    {
        startFrame: 555,
        durationFrames: 240,
        file: "voiceover/07-PaymentBatches/approval.mp3"
    },
    {
        startFrame: 780,
        durationFrames: 180,
        file: "voiceover/07-PaymentBatches/troubleshoot.mp3"
    },
    {
        startFrame: 945,
        durationFrames: 120,
        file: "voiceover/07-PaymentBatches/outro.mp3"
    }
];

export const PaymentBatches: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <PBIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="BatchOverview">
        <PBBatchOverviewScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="CreateBatch">
        <PBCreateBatchScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="BatchApproval">
        <PBBatchApprovalScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <PBTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <PBOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
