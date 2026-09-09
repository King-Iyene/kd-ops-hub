import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { PSIntroScene } from "./PSIntroScene";
import { PSAccountTabScene } from "./PSAccountTabScene";
import { PSPayslipsTabScene } from "./PSPayslipsTabScene";
import { PSSecurityTabScene } from "./PSSecurityTabScene";
import { PSTroubleshootScene } from "./PSTroubleshootScene";
import { PSOutroScene } from "./PSOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 480,
        file: "voiceover/15-ProfileSetup/intro.mp3"
    },
    {
        startFrame: 465,
        durationFrames: 1080,
        file: "voiceover/15-ProfileSetup/account.mp3"
    },
    {
        startFrame: 1530,
        durationFrames: 960,
        file: "voiceover/15-ProfileSetup/payslips.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 1020,
        file: "voiceover/15-ProfileSetup/security.mp3"
    },
    {
        startFrame: 3480,
        durationFrames: 690,
        file: "voiceover/15-ProfileSetup/troubleshoot.mp3"
    },
    {
        startFrame: 4155,
        durationFrames: 540,
        file: "voiceover/15-ProfileSetup/outro.mp3"
    }
];

export const ProfileSetup: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
        <PSIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={36 * fps} name="AccountTab">
        <PSAccountTabScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={32 * fps} name="PayslipsTab">
        <PSPayslipsTabScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={34 * fps} name="SecurityTab">
        <PSSecurityTabScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={23 * fps} name="Troubleshooting">
        <PSTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Outro">
        <PSOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
