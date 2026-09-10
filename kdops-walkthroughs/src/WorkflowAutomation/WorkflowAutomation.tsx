import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { makeIntroScene } from "../shared/makeIntroScene";
import { makeCardsScene, makeStepsScene } from "../shared/makeContentScene";
import { makeTroubleshootScene } from "../shared/makeTroubleshootScene";
import { makeOutroScene } from "../shared/makeOutroScene";
import { COLORS } from "../WelcomeToKDOps/theme";

const IntroScene = makeIntroScene({
  icon: "⚙️",
  title: "Workflow Automation",
  subtitle: "Custom workflows, triggers, conditions, and automated actions across KDOps",
  tag: "Module 74 · Workflow Automation",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Automation Stats",
  cards: [
    { title: "Active Workflows", desc: "Running automations", icon: "🔄", value: "16" },
    { title: "Triggers Fired", desc: "This month", icon: "⚡", value: "1,240" },
    { title: "Actions Executed", desc: "Automated steps run", icon: "✅", value: "3,780" },
    { title: "Time Saved", desc: "Estimated hours/month", icon: "⏱️", value: "48 hrs" },
    { title: "Error Rate", desc: "Failed automations", icon: "⚠️", value: "0.8%" },
    { title: "Custom Rules", desc: "Conditional branches", icon: "🔀", value: "32" },
  ],
});

const StepsScene = makeStepsScene({
  label: "BUILD WORKFLOW",
  labelColor: COLORS.accent,
  title: "Creating an Automation",
  steps: [
    { num: "1", title: "Define Trigger", desc: "Choose the event — new hire, leave approved, payroll run, etc." },
    { num: "2", title: "Set Conditions", desc: "Add if/else rules like department, role, or amount thresholds" },
    { num: "3", title: "Add Actions", desc: "Send email, update record, create task, or notify manager" },
    { num: "4", title: "Test & Activate", desc: "Run a dry test with sample data then enable the workflow" },
  ],
  formTitle: "New Workflow",
  formFields: [
    { label: "Workflow Name", value: "Onboarding Checklist" },
    { label: "Trigger", value: "New employee created" },
    { label: "Condition", value: "Department = Engineering" },
    { label: "Action 1", value: "Create onboarding tasks" },
    { label: "Action 2", value: "Notify line manager" },
    { label: "Created By", value: "Obiora Eze" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Workflow Troubleshooting", [
  { problem: "Workflow not triggering", solution: "Verify the trigger event matches exactly — check spelling and type", fallback: "Manually run the workflow from the workflow history page", icon: "🔇" },
  { problem: "Wrong action executed", solution: "Review condition logic — an 'OR' may need to be an 'AND'", fallback: "Disable the workflow, fix the condition, then re-enable", icon: "🔀" },
  { problem: "Email action not sending", solution: "Check the email template and recipient field are configured", fallback: "Use the notification action as an alternative to direct email", icon: "📧" },
  { problem: "Workflow running in a loop", solution: "Ensure the action does not re-trigger the same workflow event", fallback: "Add a 'run once per record' guard condition to prevent loops", icon: "🔁" },
]);

const OutroScene = makeOutroScene({
  icon: "⚙️",
  title: "Workflow Automation",
  subtitle: "Let the system handle the repetitive work",
  upNext: ["Data Import/Export"],
});

export const WorkflowAutomation: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Overview">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="BuildWorkflow">
          <StepsScene />
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
