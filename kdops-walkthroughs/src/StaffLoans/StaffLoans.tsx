import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { SLIntroScene } from "./SLIntroScene";
import { SLCreateLoanScene } from "./SLCreateLoanScene";
import { SLTrackLoansScene } from "./SLTrackLoansScene";
import { SLTroubleshootScene } from "./SLTroubleshootScene";
import { SLOutroScene } from "./SLOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 750,
        file: "voiceover/25-StaffLoans/intro.mp3"
    },
    {
        startFrame: 735,
        durationFrames: 1260,
        file: "voiceover/25-StaffLoans/create.mp3"
    },
    {
        startFrame: 1980,
        durationFrames: 1050,
        file: "voiceover/25-StaffLoans/tracking.mp3"
    },
    {
        startFrame: 3015,
        durationFrames: 630,
        file: "voiceover/25-StaffLoans/troubleshoot.mp3"
    },
    {
        startFrame: 3630,
        durationFrames: 390,
        file: "voiceover/25-StaffLoans/outro.mp3"
    }
];

export const StaffLoans: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={25 * fps} name="Intro">
        <SLIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={42 * fps} name="CreateLoan">
        <SLCreateLoanScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={35 * fps} name="TrackLoans">
        <SLTrackLoansScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={21 * fps} name="Troubleshooting">
        <SLTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={13 * fps} name="Outro">
        <SLOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
