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
  icon: "🔄",
  title: "Shift Management",
  subtitle: "Create shift schedules, assign employees, and handle swaps — never understaffed again",
  tag: "Module 46 · Shifts",
});

const CardsSceneComp = makeCardsScene({
  label: "SHIFTS",
  labelColor: COLORS.green,
  title: "Shift Calendar",
  cards: [
    { title: "Morning Shift", desc: "6:00 AM – 2:00 PM", icon: "🌅", value: "32 staff" },
    { title: "Afternoon Shift", desc: "2:00 PM – 10:00 PM", icon: "☀️", value: "28 staff" },
    { title: "Night Shift", desc: "10:00 PM – 6:00 AM", icon: "🌙", value: "18 staff" },
    { title: "Total Assigned", desc: "All shifts today", icon: "👥", value: "78" },
    { title: "Swap Requests", desc: "Pending approval", icon: "🔄", value: "3" },
    { title: "Overtime Hours", desc: "This week", icon: "⏱️", value: "46 hrs" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE SHIFT",
  labelColor: COLORS.accent,
  title: "Creating Shifts",
  steps: [
    { num: "1", title: "Shift Details", desc: "Set shift name, start time, end time, and days" },
    { num: "2", title: "Assign Department", desc: "Link the shift to a specific department" },
    { num: "3", title: "Set Staffing", desc: "Define maximum staff and break duration" },
    { num: "4", title: "Publish Schedule", desc: "Notify assigned employees of their shifts" },
  ],
  formTitle: "New Shift",
  formFields: [
    { label: "Shift Name", value: "Morning Shift A" },
    { label: "Start Time", value: "06:00" },
    { label: "End Time", value: "14:00" },
    { label: "Days", value: "Mon – Fri" },
    { label: "Department", value: "Operations" },
    { label: "Max Staff", value: "35" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Shift Troubleshooting", [
  { problem: "Overlapping shifts for employee", solution: "Check the employee’s schedule in the calendar view", fallback: "Remove one shift assignment and reassign", icon: "📅" },
  { problem: "Employee double-booked", solution: "Use the Conflict Detector in Shift Settings", fallback: "Manually review and resolve in the weekly view", icon: "⚠️" },
  { problem: "Swap request not approved", solution: "Remind the shift manager to review pending swaps", fallback: "Escalate to HR if the manager is unavailable", icon: "🔄" },
  { problem: "Overtime miscalculated", solution: "Verify shift times and break deductions are correct", fallback: "Adjust overtime manually in the timesheet module", icon: "⏱️" },
]);

const OutroScene = makeOutroScene({
  icon: "🔄",
  title: "Shift Management",
  subtitle: "Efficient shift scheduling for your entire team",
  upNext: ["Timesheets"],
});

export const ShiftManagement: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ShiftCalendar">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateShift">
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
