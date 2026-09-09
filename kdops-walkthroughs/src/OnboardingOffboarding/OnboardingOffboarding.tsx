import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { OOIntroScene } from "./OOIntroScene";
import { OOJoiningChecklistScene } from "./OOJoiningChecklistScene";
import { OOExitChecklistScene } from "./OOExitChecklistScene";
import { OOTrackProgressScene } from "./OOTrackProgressScene";
import { OOTroubleshootScene } from "./OOTroubleshootScene";
import { OOOutroScene } from "./OOOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 750,
        file: "voiceover/27-OnboardingOffboarding/intro.mp3"
    },
    {
        startFrame: 735,
        durationFrames: 1470,
        file: "voiceover/27-OnboardingOffboarding/JoiningChecklist.mp3"
    },
    {
        startFrame: 2190,
        durationFrames: 1350,
        file: "voiceover/27-OnboardingOffboarding/ExitChecklist.mp3"
    },
    {
        startFrame: 3525,
        durationFrames: 1140,
        file: "voiceover/27-OnboardingOffboarding/TrackProgress.mp3"
    },
    {
        startFrame: 4650,
        durationFrames: 930,
        file: "voiceover/27-OnboardingOffboarding/troubleshoot.mp3"
    },
    {
        startFrame: 5565,
        durationFrames: 570,
        file: "voiceover/27-OnboardingOffboarding/outro.mp3"
    }
];

export const OnboardingOffboarding: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={25 * fps} name="Intro">
        <OOIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={49 * fps} name="JoiningChecklist">
        <OOJoiningChecklistScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={45 * fps} name="ExitChecklist">
        <OOExitChecklistScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={38 * fps} name="TrackProgress">
        <OOTrackProgressScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={31 * fps} name="Troubleshooting">
        <OOTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Outro">
        <OOOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
