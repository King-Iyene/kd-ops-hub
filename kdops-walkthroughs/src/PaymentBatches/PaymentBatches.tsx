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
        durationFrames: 300,
        file: "voiceover/07-PaymentBatches/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 540,
        file: "voiceover/07-PaymentBatches/overview.mp3"
    },
    {
        startFrame: 810,
        durationFrames: 720,
        file: "voiceover/07-PaymentBatches/create.mp3"
    },
    {
        startFrame: 1515,
        durationFrames: 600,
        file: "voiceover/07-PaymentBatches/approval.mp3"
    },
    {
        startFrame: 2100,
        durationFrames: 540,
        file: "voiceover/07-PaymentBatches/troubleshoot.mp3"
    },
    {
        startFrame: 2625,
        durationFrames: 270,
        file: "voiceover/07-PaymentBatches/outro.mp3"
    }
];

export const PaymentBatches: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <PBIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={18 * fps} name="BatchOverview">
        <PBBatchOverviewScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={24 * fps} name="CreateBatch">
        <PBCreateBatchScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="BatchApproval">
        <PBBatchApprovalScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Troubleshooting">
        <PBTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={9 * fps} name="Outro">
        <PBOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
