import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { DDIntroScene } from "./DDIntroScene";
import { DDStatCardsScene } from "./DDStatCardsScene";
import { DDFinanceScene } from "./DDFinanceScene";
import { DDQuickActionsScene } from "./DDQuickActionsScene";
import { DDComplianceScene } from "./DDComplianceScene";
import { DDTroubleshootScene } from "./DDTroubleshootScene";
import { DDOutroScene } from "./DDOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 240,
        file: "voiceover/02-DashboardDeepDive/intro.mp3"
    },
    {
        startFrame: 225,
        durationFrames: 780,
        file: "voiceover/02-DashboardDeepDive/stat-cards.mp3"
    },
    {
        startFrame: 990,
        durationFrames: 690,
        file: "voiceover/02-DashboardDeepDive/finance.mp3"
    },
    {
        startFrame: 1665,
        durationFrames: 570,
        file: "voiceover/02-DashboardDeepDive/quick-actions.mp3"
    },
    {
        startFrame: 2220,
        durationFrames: 660,
        file: "voiceover/02-DashboardDeepDive/compliance.mp3"
    },
    {
        startFrame: 2865,
        durationFrames: 570,
        file: "voiceover/02-DashboardDeepDive/troubleshoot.mp3"
    },
    {
        startFrame: 3420,
        durationFrames: 300,
        file: "voiceover/02-DashboardDeepDive/outro.mp3"
    }
];

export const DashboardDeepDive: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Intro">
        <DDIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Stat Cards — 8s */}
      <TransitionSeries.Sequence durationInFrames={26 * fps} name="StatCards">
        <DDStatCardsScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Financial Health & Cash Burn — 8s */}
      <TransitionSeries.Sequence durationInFrames={23 * fps} name="Finance">
        <DDFinanceScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Quick Actions & Renewals — 8s */}
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="QuickActions">
        <DDQuickActionsScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Compliance & Tasks — 8s */}
      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Compliance">
        <DDComplianceScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Troubleshooting">
        <DDTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 7: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <DDOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
