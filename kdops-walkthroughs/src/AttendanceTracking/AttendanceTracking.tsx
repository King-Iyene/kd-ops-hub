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
  icon: "⏰",
  title: "Attendance Tracking",
  subtitle: "Monitor clock-ins, track absences, and manage attendance policies",
  tag: "Module 45 · Attendance",
});

const CardsSceneComp = makeCardsScene({
  label: "TODAY",
  labelColor: COLORS.green,
  title: "Attendance Dashboard",
  cards: [
    { title: "Present Today", desc: "Clocked in", icon: "✅", value: "118" },
    { title: "Absent", desc: "Not clocked in", icon: "❌", value: "12" },
    { title: "Late Arrivals", desc: "After 9:00 AM", icon: "⏰", value: "7" },
    { title: "On Leave", desc: "Approved leave", icon: "🏖️", value: "9" },
    { title: "Work from Home", desc: "Remote today", icon: "🏠", value: "15" },
    { title: "Avg Attendance", desc: "This month", icon: "📊", value: "94.2%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "MANAGEMENT",
  labelColor: COLORS.accent,
  title: "Managing Attendance",
  steps: [
    { num: "1", title: "View Daily Log", desc: "See real-time clock-in/out status for all employees" },
    { num: "2", title: "Mark Manually", desc: "Override or add attendance entries for special cases" },
    { num: "3", title: "Set Policies", desc: "Define late thresholds, grace periods, and penalties" },
    { num: "4", title: "Generate Reports", desc: "Export attendance reports by department or period" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Attendance Troubleshooting", [
  { problem: "Wrong check-in time recorded", solution: "Edit the time entry in the employee’s attendance log", fallback: "Submit a correction request to HR admin", icon: "🕐" },
  { problem: "Duplicate entries for same day", solution: "Delete the incorrect entry and keep the valid one", fallback: "Run the Attendance Cleanup tool in Settings", icon: "📋" },
  { problem: "GPS location not working", solution: "Ensure location services are enabled on the device", fallback: "Allow manual check-in with supervisor approval", icon: "📍" },
  { problem: "Monthly report numbers mismatch", solution: "Reconcile against the daily logs for the period", fallback: "Re-generate the report after fixing individual entries", icon: "📊" },
]);

const OutroScene = makeOutroScene({
  icon: "⏰",
  title: "Attendance Tracking",
  subtitle: "Never miss an attendance record again",
  upNext: ["Shift Management"],
});

export const AttendanceTracking: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Dashboard">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Management">
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
