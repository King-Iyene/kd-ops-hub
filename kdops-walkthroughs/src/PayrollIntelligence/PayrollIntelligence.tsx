import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { PIIntroScene } from "./PIIntroScene";
import { PIPayrollOverviewScene } from "./PIPayrollOverviewScene";
import { PIRunPayrollScene } from "./PIRunPayrollScene";
import { PIPayrollBreakdownScene } from "./PIPayrollBreakdownScene";
import { PIPayrollHistoryScene } from "./PIPayrollHistoryScene";
import { PITroubleshootScene } from "./PITroubleshootScene";
import { PIOutroScene } from "./PIOutroScene";

export const PayrollIntelligence: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <PIIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Payroll Overview — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="PayrollOverview">
        <PIPayrollOverviewScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Run Payroll — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="RunPayroll">
        <PIRunPayrollScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Payroll Breakdown — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="PayrollBreakdown">
        <PIPayrollBreakdownScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Payroll History — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="PayrollHistory">
        <PIPayrollHistoryScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <PITroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 7: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <PIOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
