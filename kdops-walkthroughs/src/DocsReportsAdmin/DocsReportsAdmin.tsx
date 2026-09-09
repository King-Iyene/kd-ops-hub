import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { DRAIntroScene } from "./DRAIntroScene";
import { DRADocumentsOverviewScene } from "./DRADocumentsOverviewScene";
import { DRAReportsModuleScene } from "./DRAReportsModuleScene";
import { DRAAdminSettingsScene } from "./DRAAdminSettingsScene";
import { DRATroubleshootScene } from "./DRATroubleshootScene";
import { DRAOutroScene } from "./DRAOutroScene";

export const DocsReportsAdmin: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <DRAIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="DocumentsOverview">
        <DRADocumentsOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="ReportsModule">
        <DRAReportsModuleScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="AdminSettings">
        <DRAAdminSettingsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <DRATroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <DRAOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
