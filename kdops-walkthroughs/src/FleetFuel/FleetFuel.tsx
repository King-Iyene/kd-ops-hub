import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { FFIntroScene } from "./FFIntroScene";
import { FFFleetOverviewScene } from "./FFFleetOverviewScene";
import { FFFuelTrackingScene } from "./FFFuelTrackingScene";
import { FFVendorManagementScene } from "./FFVendorManagementScene";
import { FFTroubleshootScene } from "./FFTroubleshootScene";
import { FFOutroScene } from "./FFOutroScene";

export const FleetFuel: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <FFIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="FleetOverview">
        <FFFleetOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="FuelTracking">
        <FFFuelTrackingScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="VendorManagement">
        <FFVendorManagementScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <FFTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <FFOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
