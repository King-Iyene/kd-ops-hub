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
  icon: "💰",
  title: "Finance Dashboard",
  subtitle:
    "Get a complete financial picture — revenue, expenses, cash flow, and projections all in one place",
  tag: "Module 39 · Finance",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Dashboard Overview",
  cards: [
    { title: "Total Revenue", desc: "Year-to-date income", icon: "💵", value: "₦48.2M" },
    { title: "Total Expenses", desc: "Year-to-date spending", icon: "📉", value: "₦31.7M" },
    { title: "Net Profit", desc: "Revenue minus expenses", icon: "📊", value: "₦16.5M" },
    { title: "Outstanding Invoices", desc: "Unpaid client invoices", icon: "📄", value: "₦5.8M" },
    { title: "Cash Flow Trend", desc: "Monthly cash movement", icon: "📈", value: "+12%" },
    { title: "Budget Utilisation", desc: "Spent vs allocated", icon: "🎯", value: "78%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "REPORTS",
  labelColor: COLORS.accent,
  title: "Financial Reports",
  steps: [
    { num: "1", title: "Select Date Range", desc: "Choose the reporting period — monthly, quarterly, or custom" },
    { num: "2", title: "Choose Report Type", desc: "Pick from P&L, balance sheet, cash flow, or budget variance" },
    { num: "3", title: "Generate Report", desc: "Click Generate to compile your financial data" },
    { num: "4", title: "Export", desc: "Download as PDF or CSV for sharing with stakeholders" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Finance Troubleshooting", [
  { problem: "Data not matching bank records", solution: "Reconcile transactions in the Reconciliation tab", fallback: "Contact finance admin to review posted entries", icon: "🏦" },
  { problem: "Missing transactions", solution: "Check the date range filter and transaction status", fallback: "Manually add the missing entry with reference number", icon: "🔍" },
  { problem: "Wrong currency display", solution: "Update default currency in Settings → Finance", fallback: "Use the currency toggle on individual reports", icon: "💱" },
  { problem: "Report generation fails", solution: "Reduce the date range or filter fewer modules", fallback: "Export raw data and build the report externally", icon: "📊" },
]);

const OutroScene = makeOutroScene({
  icon: "💰",
  title: "Finance Dashboard",
  subtitle: "Your financial overview is now at your fingertips",
  upNext: ["Cash Flow Management"],
});

export const FinanceDashboard: React.FC = () => {
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
