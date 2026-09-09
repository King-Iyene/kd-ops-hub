import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { DDIntroScene } from "./DDIntroScene";
import { DDStatCardsScene } from "./DDStatCardsScene";
import { DDFinanceScene } from "./DDFinanceScene";
import { DDQuickActionsScene } from "./DDQuickActionsScene";
import { DDComplianceScene } from "./DDComplianceScene";
import { DDTroubleshootScene } from "./DDTroubleshootScene";
import { DDOutroScene } from "./DDOutroScene";

export const DashboardDeepDive: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <DDIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Stat Cards — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="StatCards">
        <DDStatCardsScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Financial Health & Cash Burn — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Finance">
        <DDFinanceScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Quick Actions & Renewals — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="QuickActions">
        <DDQuickActionsScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Compliance & Tasks — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Compliance">
        <DDComplianceScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <DDTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 7: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <DDOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
