import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { FFIntroScene } from "./FFIntroScene";
import { FFFleetOverviewScene } from "./FFFleetOverviewScene";
import { FFFuelTrackingScene } from "./FFFuelTrackingScene";
import { FFVendorManagementScene } from "./FFVendorManagementScene";
import { FFTroubleshootScene } from "./FFTroubleshootScene";
import { FFOutroScene } from "./FFOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 300,
        file: "voiceover/12-FleetFuel/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 570,
        file: "voiceover/12-FleetFuel/fleet.mp3"
    },
    {
        startFrame: 840,
        durationFrames: 600,
        file: "voiceover/12-FleetFuel/fuel.mp3"
    },
    {
        startFrame: 1425,
        durationFrames: 540,
        file: "voiceover/12-FleetFuel/vendor.mp3"
    },
    {
        startFrame: 1950,
        durationFrames: 540,
        file: "voiceover/12-FleetFuel/troubleshoot.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 300,
        file: "voiceover/12-FleetFuel/outro.mp3"
    }
];

export const FleetFuel: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <FFIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="FleetOverview">
        <FFFleetOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={20 * fps} name="FuelTracking">
        <FFFuelTrackingScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="VendorManagement">
        <FFVendorManagementScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Troubleshooting">
        <FFTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <FFOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
