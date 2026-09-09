import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { SNIntroScene } from "./SNIntroScene";
import { SNHubOverviewScene } from "./SNHubOverviewScene";
import { SNFindingModulesScene } from "./SNFindingModulesScene";
import { SNTroubleshootScene } from "./SNTroubleshootScene";
import { SNOutroScene } from "./SNOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 540,
        file: "voiceover/16-SidebarNavigation/intro.mp3"
    },
    {
        startFrame: 525,
        durationFrames: 1350,
        file: "voiceover/16-SidebarNavigation/hubs.mp3"
    },
    {
        startFrame: 1860,
        durationFrames: 1440,
        file: "voiceover/16-SidebarNavigation/finding.mp3"
    },
    {
        startFrame: 3285,
        durationFrames: 810,
        file: "voiceover/16-SidebarNavigation/troubleshoot.mp3"
    },
    {
        startFrame: 4080,
        durationFrames: 540,
        file: "voiceover/16-SidebarNavigation/outro.mp3"
    }
];

export const SidebarNavigation: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Intro">
        <SNIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={45 * fps} name="HubOverview">
        <SNHubOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={48 * fps} name="FindingModules">
        <SNFindingModulesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={27 * fps} name="Troubleshooting">
        <SNTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Outro">
        <SNOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
