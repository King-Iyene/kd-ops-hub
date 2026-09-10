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
  icon: "📈",
  title: "Reports & Analytics",
  subtitle: "Custom reports, interactive dashboards, and data exports for decision-making",
  tag: "Module 70 · Reports & Analytics",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Reporting Dashboard",
  cards: [
    { title: "Active Reports", desc: "Custom reports saved", icon: "📊", value: "31" },
    { title: "Scheduled Reports", desc: "Auto-generated weekly", icon: "⏰", value: "8" },
    { title: "Dashboards", desc: "Interactive views", icon: "📉", value: "5" },
    { title: "Data Exports", desc: "Downloads this month", icon: "📥", value: "47" },
    { title: "Payroll Spend", desc: "Total this month", icon: "💰", value: "₦18.4M" },
    { title: "Headcount Trend", desc: "Growth this quarter", icon: "📈", value: "+12%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "BUILD REPORT",
  labelColor: COLORS.accent,
  title: "Creating a Custom Report",
  steps: [
    { num: "1", title: "Select Data Source", desc: "Choose employees, payroll, leave, or attendance data" },
    { num: "2", title: "Add Filters", desc: "Filter by department, date range, status, or location" },
    { num: "3", title: "Choose Visualisation", desc: "Pick table, bar chart, pie chart, or line graph" },
    { num: "4", title: "Save & Schedule", desc: "Name the report and set auto-delivery if needed" },
  ],
  formTitle: "New Custom Report",
  formFields: [
    { label: "Report Name", value: "Monthly Payroll Summary" },
    { label: "Data Source", value: "Payroll" },
    { label: "Date Range", value: "Sep 2026" },
    { label: "Group By", value: "Department" },
    { label: "Format", value: "Table + Bar Chart" },
    { label: "Schedule", value: "1st of each month" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Reports Troubleshooting", [
  { problem: "Report showing zero results", solution: "Check date range and filters — they may be too restrictive", fallback: "Clear all filters and rebuild the query step by step", icon: "🔍" },
  { problem: "Export file is empty", solution: "Ensure the report has data before exporting — preview first", fallback: "Try a different export format (CSV instead of PDF)", icon: "📄" },
  { problem: "Dashboard loading slowly", solution: "Reduce the date range or number of widgets on the dashboard", fallback: "Schedule the report to run overnight and view cached results", icon: "🐢" },
  { problem: "Scheduled report not arriving", solution: "Verify the recipient email and check spam/junk folders", fallback: "Re-create the schedule and test with a manual send first", icon: "📧" },
]);

const OutroScene = makeOutroScene({
  icon: "📈",
  title: "Reports & Analytics",
  subtitle: "Turn your data into actionable insights",
  upNext: ["Security & Audit"],
});

export const ReportsAnalytics: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="BuildReport">
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
