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
        durationFrames: 300,
        file: "voiceover/32-GoalsSetting/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/32-GoalsSetting/create.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/32-GoalsSetting/progress.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 450,
        file: "voiceover/32-GoalsSetting/troubleshoot.mp3"
    },
    {
        startFrame: 1890,
        durationFrames: 300,
        file: "voiceover/32-GoalsSetting/outro.mp3"
    }
];

export const GoalsSetting: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <GSIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="CreateGoal">
        <GSCreateGoalScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="TrackProgress">
        <GSTrackProgressScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <GSTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <GSOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
