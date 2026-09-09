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
  title: "HR Analytics",
  subtitle:
    "Workforce insights at your fingertips — headcount, turnover, demographics, and trends",
  tag: "Module 41 · HR Analytics",
});

const CardsSceneComp = makeCardsScene({
  label: "KEY METRICS",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "Total Headcount", desc: "Active employees", icon: "👥", value: "142" },
    { title: "New Hires", desc: "This month", icon: "🆕", value: "8" },
    { title: "Turnover Rate", desc: "Last 12 months", icon: "🔄", value: "12.3%" },
    { title: "Average Tenure", desc: "Years with company", icon: "📅", value: "3.4 yrs" },
    { title: "Gender Ratio", desc: "Male to female", icon: "⚖️", value: "58:42" },
    { title: "Departments", desc: "Active departments", icon: "🏢", value: "9" },
  ],
});

const StepsScene = makeStepsScene({
  label: "REPORTING",
  labelColor: COLORS.accent,
  title: "Reports & Trends",
  steps: [
    { num: "1", title: "Select Metric", desc: "Choose from headcount, turnover, demographics, or custom" },
    { num: "2", title: "Choose Time Period", desc: "Set the date range for your analysis" },
    { num: "3", title: "View Chart", desc: "Interactive charts update in real time" },
    { num: "4", title: "Download Report", desc: "Export as PDF or CSV for presentations" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("HR Analytics Troubleshooting", [
  { problem: "Data gaps in reports", solution: "Ensure all employee records have complete profiles", fallback: "Use the Data Health tool to find and fix gaps", icon: "📊" },
  { problem: "Employee not appearing in stats", solution: "Check their employment status is set to Active", fallback: "Re-sync the employee record from HR module", icon: "👤" },
  { problem: "Wrong department statistics", solution: "Verify department assignments in employee profiles", fallback: "Run the Department Audit report to find mismatches", icon: "🏢" },
  { problem: "Chart not loading", solution: "Clear browser cache and refresh the page", fallback: "Try a different chart type or reduce the date range", icon: "📉" },
]);

const OutroScene = makeOutroScene({
  icon: "📈",
  title: "HR Analytics",
  subtitle: "Data-driven workforce decisions start here",
  upNext: ["Vendor Management"],
});

export const HRAnalytics: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="KeyMetrics">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Reports">
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
