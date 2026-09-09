import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { GSIntroScene } from "./GSIntroScene";
import { GSCreateGoalScene } from "./GSCreateGoalScene";
import { GSTrackProgressScene } from "./GSTrackProgressScene";
import { GSTroubleshootScene } from "./GSTroubleshootScene";
import { GSOutroScene } from "./GSOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 780,
        file: "voiceover/32-GoalsSetting/intro.mp3"
    },
    {
        startFrame: 765,
        durationFrames: 1650,
        file: "voiceover/32-GoalsSetting/CreateGoal.mp3"
    },
    {
        startFrame: 2400,
        durationFrames: 1440,
        file: "voiceover/32-GoalsSetting/TrackProgress.mp3"
    },
    {
        startFrame: 3825,
        durationFrames: 930,
        file: "voiceover/32-GoalsSetting/troubleshoot.mp3"
    },
    {
        startFrame: 4740,
        durationFrames: 600,
        file: "voiceover/32-GoalsSetting/outro.mp3"
    }
];

export const GoalsSetting: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={26 * fps} name="Intro">
        <GSIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={55 * fps} name="CreateGoal">
        <GSCreateGoalScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={48 * fps} name="TrackProgress">
        <GSTrackProgressScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={31 * fps} name="Troubleshooting">
        <GSTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Outro">
        <GSOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
