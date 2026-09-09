import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { EAIntroScene } from "./EAIntroScene";
import { EAExpenseListScene } from "./EAExpenseListScene";
import { EASubmitExpenseScene } from "./EASubmitExpenseScene";
import { EAApprovalFlowScene } from "./EAApprovalFlowScene";
import { EATroubleshootScene } from "./EATroubleshootScene";
import { EAOutroScene } from "./EAOutroScene";

export const ExpensesApprovals: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <EAIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Expense List — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="ExpenseList">
        <EAExpenseListScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Submit Expense — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="SubmitExpense">
        <EASubmitExpenseScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Approval Flow — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="ApprovalFlow">
        <EAApprovalFlowScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <EATroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <EAOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
