import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { TAIntroScene } from "./TAIntroScene";
import { TATaskBoardScene } from "./TATaskBoardScene";
import { TACreateTaskScene } from "./TACreateTaskScene";
import { TATroubleshootScene } from "./TATroubleshootScene";
import { TAOutroScene } from "./TAOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 270,
        file: "voiceover/06-TasksAccountability/intro.mp3"
    },
    {
        startFrame: 255,
        durationFrames: 660,
        file: "voiceover/06-TasksAccountability/taskboard.mp3"
    },
    {
        startFrame: 900,
        durationFrames: 690,
        file: "voiceover/06-TasksAccountability/create.mp3"
    },
    {
        startFrame: 1575,
        durationFrames: 570,
        file: "voiceover/06-TasksAccountability/troubleshoot.mp3"
    },
    {
        startFrame: 2130,
        durationFrames: 300,
        file: "voiceover/06-TasksAccountability/outro.mp3"
    }
];

export const TasksAccountability: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={9 * fps} name="Intro">
        <TAIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={22 * fps} name="TaskBoard">
        <TATaskBoardScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={23 * fps} name="CreateTask">
        <TACreateTaskScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Troubleshooting">
        <TATroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <TAOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
