import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { IntroScene } from "./IntroScene";
import { LoginScene } from "./LoginScene";
import { DashboardScene } from "./DashboardScene";
import { SidebarScene } from "./SidebarScene";
import { TroubleshootScene } from "./TroubleshootScene";
import { OutroScene } from "./OutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 360,
        file: "voiceover/01-WelcomeToKDOps/intro.mp3"
    },
    {
        startFrame: 345,
        durationFrames: 570,
        file: "voiceover/01-WelcomeToKDOps/login.mp3"
    },
    {
        startFrame: 900,
        durationFrames: 840,
        file: "voiceover/01-WelcomeToKDOps/dashboard.mp3"
    },
    {
        startFrame: 1725,
        durationFrames: 660,
        file: "voiceover/01-WelcomeToKDOps/sidebar.mp3"
    },
    {
        startFrame: 2370,
        durationFrames: 570,
        file: "voiceover/01-WelcomeToKDOps/troubleshoot.mp3"
    },
    {
        startFrame: 2925,
        durationFrames: 390,
        file: "voiceover/01-WelcomeToKDOps/outro.mp3"
    }
];

export const WelcomeToKDOps: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      {/* Scene 1: Intro — 4 seconds */}
      <TransitionSeries.Sequence durationInFrames={12 * fps} name="Intro">
        <IntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Login — 7 seconds */}
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Login">
        <LoginScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Dashboard — 8 seconds */}
      <TransitionSeries.Sequence durationInFrames={28 * fps} name="Dashboard">
        <DashboardScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Sidebar Navigation — 8 seconds */}
      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Sidebar">
        <SidebarScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Troubleshooting — 6 seconds */}
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Troubleshooting">
        <TroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Outro — 4 seconds */}
      <TransitionSeries.Sequence durationInFrames={13 * fps} name="Outro">
        <OutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
