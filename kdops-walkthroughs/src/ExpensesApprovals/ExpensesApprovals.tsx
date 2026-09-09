import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { EAIntroScene } from "./EAIntroScene";
import { EAExpenseListScene } from "./EAExpenseListScene";
import { EASubmitExpenseScene } from "./EASubmitExpenseScene";
import { EAApprovalFlowScene } from "./EAApprovalFlowScene";
import { EATroubleshootScene } from "./EATroubleshootScene";
import { EAOutroScene } from "./EAOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 330,
        file: "voiceover/08-ExpensesApprovals/intro.mp3"
    },
    {
        startFrame: 315,
        durationFrames: 480,
        file: "voiceover/08-ExpensesApprovals/list.mp3"
    },
    {
        startFrame: 780,
        durationFrames: 570,
        file: "voiceover/08-ExpensesApprovals/submit.mp3"
    },
    {
        startFrame: 1335,
        durationFrames: 510,
        file: "voiceover/08-ExpensesApprovals/approval.mp3"
    },
    {
        startFrame: 1830,
        durationFrames: 600,
        file: "voiceover/08-ExpensesApprovals/troubleshoot.mp3"
    },
    {
        startFrame: 2415,
        durationFrames: 300,
        file: "voiceover/08-ExpensesApprovals/outro.mp3"
    }
];

export const ExpensesApprovals: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={11 * fps} name="Intro">
        <EAIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Expense List — 8s */}
      <TransitionSeries.Sequence durationInFrames={16 * fps} name="ExpenseList">
        <EAExpenseListScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Submit Expense — 8s */}
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="SubmitExpense">
        <EASubmitExpenseScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Approval Flow — 8s */}
      <TransitionSeries.Sequence durationInFrames={17 * fps} name="ApprovalFlow">
        <EAApprovalFlowScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Troubleshooting">
        <EATroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <EAOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
