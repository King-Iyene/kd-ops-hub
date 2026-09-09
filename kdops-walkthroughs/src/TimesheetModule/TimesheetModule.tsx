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
  icon: "📝",
  title: "Timesheets",
  subtitle: "Log hours, track projects, and approve timesheets for accurate payroll",
  tag: "Module 47 · Timesheets",
});

const CardsSceneComp = makeCardsScene({
  label: "THIS WEEK",
  labelColor: COLORS.green,
  title: "Timesheet Overview",
  cards: [
    { title: "Hours Logged", desc: "This week", icon: "⏰", value: "38.5 hrs" },
    { title: "Pending Approval", desc: "Awaiting manager", icon: "⏳", value: "12" },
    { title: "Approved", desc: "Ready for payroll", icon: "✅", value: "98" },
    { title: "Rejected", desc: "Needs correction", icon: "❌", value: "3" },
    { title: "Billable Hours", desc: "Client-facing work", icon: "💰", value: "28 hrs" },
    { title: "Overtime", desc: "Above 40 hrs/week", icon: "⚡", value: "4.5 hrs" },
  ],
});

const StepsScene = makeStepsScene({
  label: "SUBMIT TIME",
  labelColor: COLORS.accent,
  title: "Submitting Time",
  steps: [
    { num: "1", title: "Select Week", desc: "Choose the week you want to log time for" },
    { num: "2", title: "Add Daily Entries", desc: "Enter hours worked for each day" },
    { num: "3", title: "Tag Project/Task", desc: "Link each entry to the relevant project or task" },
    { num: "4", title: "Submit for Approval", desc: "Send your timesheet to your line manager" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Timesheet Troubleshooting", [
  { problem: "Hours not matching expected total", solution: "Review each daily entry for missing or incorrect hours", fallback: "Use the calculator tool to reconcile the week", icon: "🔢" },
  { problem: "Missed submission deadline", solution: "Request a deadline extension from your manager", fallback: "HR admin can reopen the period for late submission", icon: "📅" },
  { problem: "Project not listed in dropdown", solution: "Ask the project manager to add you as a team member", fallback: "Select ‘Other’ and add the project name in notes", icon: "📋" },
  { problem: "Approval taking too long", solution: "Send a reminder to your approving manager", fallback: "Escalate to HR if payroll deadline is approaching", icon: "⏳" },
]);

const OutroScene = makeOutroScene({
  icon: "📝",
  title: "Timesheets",
  subtitle: "Accurate time tracking for seamless payroll",
  upNext: ["Employee Handbook"],
});

export const TimesheetModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="SubmitTime">
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
