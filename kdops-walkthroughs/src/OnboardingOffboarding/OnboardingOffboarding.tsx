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
        durationFrames: 300,
        file: "voiceover/27-OnboardingOffboarding/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/27-OnboardingOffboarding/joining.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/27-OnboardingOffboarding/exit.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 600,
        file: "voiceover/27-OnboardingOffboarding/progress.mp3"
    },
    {
        startFrame: 2040,
        durationFrames: 450,
        file: "voiceover/27-OnboardingOffboarding/troubleshoot.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 300,
        file: "voiceover/27-OnboardingOffboarding/outro.mp3"
    }
];

export const OnboardingOffboarding: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <OOIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="JoiningChecklist">
        <OOJoiningChecklistScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="ExitChecklist">
        <OOExitChecklistScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="TrackProgress">
        <OOTrackProgressScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <OOTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <OOOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
