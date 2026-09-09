import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { PHOIntroScene } from "./PHOIntroScene";
import { PHPayDashboardScene } from "./PHPayDashboardScene";
import { PHPayNavigationScene } from "./PHPayNavigationScene";
import { PHOTroubleshootScene } from "./PHOTroubleshootScene";
import { PHOOutroScene } from "./PHOOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 570,
        file: "voiceover/24-PayHubOverview/intro.mp3"
    },
    {
        startFrame: 555,
        durationFrames: 900,
        file: "voiceover/24-PayHubOverview/dashboard.mp3"
    },
    {
        startFrame: 1440,
        durationFrames: 900,
        file: "voiceover/24-PayHubOverview/navigation.mp3"
    },
    {
        startFrame: 2325,
        durationFrames: 570,
        file: "voiceover/24-PayHubOverview/troubleshoot.mp3"
    },
    {
        startFrame: 2880,
        durationFrames: 450,
        file: "voiceover/24-PayHubOverview/outro.mp3"
    }
];

export const PayHubOverview: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Intro">
        <PHOIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={30 * fps} name="PayDashboard">
        <PHPayDashboardScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={30 * fps} name="PayNavigation">
        <PHPayNavigationScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Troubleshooting">
        <PHOTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Outro">
        <PHOOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
