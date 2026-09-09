import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { TAIntroScene } from "./TAIntroScene";
import { TATaskBoardScene } from "./TATaskBoardScene";
import { TACreateTaskScene } from "./TACreateTaskScene";
import { TATroubleshootScene } from "./TATroubleshootScene";
import { TAOutroScene } from "./TAOutroScene";

export const TasksAccountability: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <TAIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="TaskBoard">
        <TATaskBoardScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="CreateTask">
        <TACreateTaskScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <TATroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <TAOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
