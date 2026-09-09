import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { PIIntroScene } from "./PIIntroScene";
import { PIPayrollOverviewScene } from "./PIPayrollOverviewScene";
import { PIRunPayrollScene } from "./PIRunPayrollScene";
import { PIPayrollBreakdownScene } from "./PIPayrollBreakdownScene";
import { PIPayrollHistoryScene } from "./PIPayrollHistoryScene";
import { PITroubleshootScene } from "./PITroubleshootScene";
import { PIOutroScene } from "./PIOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 300,
        file: "voiceover/09-PayrollIntelligence/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/09-PayrollIntelligence/overview.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/09-PayrollIntelligence/run.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 540,
        file: "voiceover/09-PayrollIntelligence/breakdown.mp3"
    },
    {
        startFrame: 1980,
        durationFrames: 570,
        file: "voiceover/09-PayrollIntelligence/history.mp3"
    },
    {
        startFrame: 2535,
        durationFrames: 540,
        file: "voiceover/09-PayrollIntelligence/troubleshoot.mp3"
    },
    {
        startFrame: 3060,
        durationFrames: 300,
        file: "voiceover/09-PayrollIntelligence/outro.mp3"
    }
];

export const PayrollIntelligence: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <PIIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Payroll Overview — 8s */}
      <TransitionSeries.Sequence durationInFrames={20 * fps} name="PayrollOverview">
        <PIPayrollOverviewScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Run Payroll — 8s */}
      <TransitionSeries.Sequence durationInFrames={20 * fps} name="RunPayroll">
        <PIRunPayrollScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Payroll Breakdown — 8s */}
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="PayrollBreakdown">
        <PIPayrollBreakdownScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Payroll History — 8s */}
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="PayrollHistory">
        <PIPayrollHistoryScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Troubleshooting">
        <PITroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 7: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <PIOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
