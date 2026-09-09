import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { BEIntroScene } from "./BEIntroScene";
import { BEEnrollBenefitScene } from "./BEEnrollBenefitScene";
import { BETrackEnrollmentsScene } from "./BETrackEnrollmentsScene";
import { BETroubleshootScene } from "./BETroubleshootScene";
import { BEOutroScene } from "./BEOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 780,
        file: "voiceover/35-BenefitsEnrollment/intro.mp3"
    },
    {
        startFrame: 765,
        durationFrames: 570,
        file: "voiceover/35-BenefitsEnrollment/EnrollBenefit.mp3"
    },
    {
        startFrame: 1320,
        durationFrames: 480,
        file: "voiceover/35-BenefitsEnrollment/TrackEnrollments.mp3"
    },
    {
        startFrame: 1785,
        durationFrames: 510,
        file: "voiceover/35-BenefitsEnrollment/troubleshoot.mp3"
    },
    {
        startFrame: 2280,
        durationFrames: 420,
        file: "voiceover/35-BenefitsEnrollment/outro.mp3"
    }
];

export const BenefitsEnrollment: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={26 * fps} name="Intro">
        <BEIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={19 * fps} name="EnrollBenefit">
        <BEEnrollBenefitScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={16 * fps} name="TrackEnrollments">
        <BETrackEnrollmentsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={17 * fps} name="Troubleshooting">
        <BETroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={14 * fps} name="Outro">
        <BEOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
