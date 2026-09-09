import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { MEIntroScene } from "./MEIntroScene";
import { MEDirectoryScene } from "./MEDirectoryScene";
import { MEAddEmployeeScene } from "./MEAddEmployeeScene";
import { MEModulesScene } from "./MEModulesScene";
import { METroubleshootScene } from "./METroubleshootScene";
import { MEOutroScene } from "./MEOutroScene";

export const ManagingEmployees: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <MEIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Directory">
        <MEDirectoryScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="AddEmployee">
        <MEAddEmployeeScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Modules">
        <MEModulesScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <METroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <MEOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
