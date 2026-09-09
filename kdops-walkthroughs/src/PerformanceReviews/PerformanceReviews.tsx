import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { PRIntroScene } from "./PRIntroScene";
import { PRCreateCycleScene } from "./PRCreateCycleScene";
import { PRRateCompetenciesScene } from "./PRRateCompetenciesScene";
import { PRAcknowledgeReviewScene } from "./PRAcknowledgeReviewScene";
import { PRTroubleshootScene } from "./PRTroubleshootScene";
import { PROutroScene } from "./PROutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 690,
        file: "voiceover/33-PerformanceReviews/intro.mp3"
    },
    {
        startFrame: 675,
        durationFrames: 1500,
        file: "voiceover/33-PerformanceReviews/CreateCycle.mp3"
    },
    {
        startFrame: 2160,
        durationFrames: 1500,
        file: "voiceover/33-PerformanceReviews/RateCompetencies.mp3"
    },
    {
        startFrame: 3645,
        durationFrames: 1260,
        file: "voiceover/33-PerformanceReviews/AcknowledgeReview.mp3"
    },
    {
        startFrame: 4890,
        durationFrames: 990,
        file: "voiceover/33-PerformanceReviews/troubleshoot.mp3"
    },
    {
        startFrame: 5865,
        durationFrames: 600,
        file: "voiceover/33-PerformanceReviews/outro.mp3"
    }
];

export const PerformanceReviews: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={23 * fps} name="Intro">
        <PRIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={50 * fps} name="CreateCycle">
        <PRCreateCycleScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={50 * fps} name="RateCompetencies">
        <PRRateCompetenciesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={42 * fps} name="AcknowledgeReview">
        <PRAcknowledgeReviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={33 * fps} name="Troubleshooting">
        <PRTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Outro">
        <PROutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
