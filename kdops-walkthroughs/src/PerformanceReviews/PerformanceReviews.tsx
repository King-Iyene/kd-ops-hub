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
        durationFrames: 300,
        file: "voiceover/33-PerformanceReviews/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/33-PerformanceReviews/cycle.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/33-PerformanceReviews/rate.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 600,
        file: "voiceover/33-PerformanceReviews/acknowledge.mp3"
    },
    {
        startFrame: 2040,
        durationFrames: 450,
        file: "voiceover/33-PerformanceReviews/troubleshoot.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 300,
        file: "voiceover/33-PerformanceReviews/outro.mp3"
    }
];

export const PerformanceReviews: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <PRIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="CreateCycle">
        <PRCreateCycleScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="RateCompetencies">
        <PRRateCompetenciesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="AcknowledgeReview">
        <PRAcknowledgeReviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <PRTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <PROutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
