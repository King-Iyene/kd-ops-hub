import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { makeIntroScene } from "../shared/makeIntroScene";
import { makeStepsScene, makeTableScene } from "../shared/makeContentScene";
import { makeTroubleshootScene } from "../shared/makeTroubleshootScene";
import { makeOutroScene } from "../shared/makeOutroScene";
import { COLORS } from "../WelcomeToKDOps/theme";

const IntroScene = makeIntroScene({
  icon: "✅",
  title: "Approval Workflows",
  subtitle: "Set up multi-step approval chains for expenses, leave, purchases — any process you need",
  tag: "Module 49 · Workflows",
});

const StepsScene = makeStepsScene({
  label: "BUILDER",
  labelColor: COLORS.accent,
  title: "Workflow Builder",
  steps: [
    { num: "1", title: "Name Workflow", desc: "Give the workflow a clear, descriptive name" },
    { num: "2", title: "Add Steps", desc: "Define each approval step and its requirements" },
    { num: "3", title: "Set Conditions", desc: "Add rules like amount thresholds or department filters" },
    { num: "4", title: "Assign Approvers", desc: "Pick approvers for each step — individuals or roles" },
    { num: "5", title: "Set Escalation", desc: "Define timeout periods and escalation paths" },
  ],
});

const TableScene = makeTableScene({
  label: "ACTIVE",
  labelColor: COLORS.green,
  title: "Active Workflows",
  headers: ["Workflow", "Steps", "Module", "Status", "Pending"],
  rows: [
    ["Expense Approval", "3", "Expenses", "Active", "7"],
    ["Leave Request", "2", "Leave", "Active", "4"],
    ["Purchase Order", "4", "Procurement", "Active", "2"],
    ["Travel Request", "3", "Travel", "Active", "1"],
    ["Salary Advance", "2", "Payroll", "Active", "3"],
  ],
});

const TroubleshootScene = makeTroubleshootScene("Workflow Troubleshooting", [
  { problem: "Approval stuck at a step", solution: "Check if the assigned approver is active and available", fallback: "Reassign the step to a backup approver", icon: "⏸️" },
  { problem: "Wrong approver assigned", solution: "Edit the workflow step and update the approver", fallback: "Admin can override and reassign pending approvals", icon: "👤" },
  { problem: "Step was skipped", solution: "Review the workflow conditions — a rule may have bypassed it", fallback: "Reset the request and resubmit through the full chain", icon: "⏭️" },
  { problem: "Escalation not triggering", solution: "Verify the timeout duration and escalation target", fallback: "Manually escalate from the request detail page", icon: "🔔" },
]);

const OutroScene = makeOutroScene({
  icon: "✅",
  title: "Approval Workflows",
  subtitle: "Automated approvals that keep things moving",
  upNext: ["Audit Log"],
});

export const ApprovalWorkflows: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Builder">
          <StepsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ActiveWorkflows">
          <TableScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
          <TroubleshootScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={14 * fps} name="Outro">
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
