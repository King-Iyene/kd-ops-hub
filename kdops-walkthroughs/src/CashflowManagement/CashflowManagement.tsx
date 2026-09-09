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
  icon: "📊",
  title: "Cash Flow Management",
  subtitle:
    "Track money in and out, forecast cash position, and never be caught off guard",
  tag: "Module 40 · Cash Flow",
});

const CardsSceneComp = makeCardsScene({
  label: "METRICS",
  labelColor: COLORS.green,
  title: "Cash Flow Overview",
  cards: [
    { title: "Cash In", desc: "Total incoming funds", icon: "💵", value: "₦12.4M" },
    { title: "Cash Out", desc: "Total outgoing payments", icon: "💸", value: "₦9.1M" },
    { title: "Net Position", desc: "Current cash balance", icon: "🏦", value: "₦3.3M" },
    { title: "30-Day Forecast", desc: "Projected cash position", icon: "📈", value: "₦4.8M" },
    { title: "Burn Rate", desc: "Monthly cash consumption", icon: "🔥", value: "₦2.1M/mo" },
    { title: "Runway", desc: "Months of cash remaining", icon: "🛫", value: "8.2 months" },
  ],
});

const StepsScene = makeStepsScene({
  label: "MANAGEMENT",
  labelColor: COLORS.accent,
  title: "Managing Cash Flow",
  steps: [
    { num: "1", title: "Log Income", desc: "Record all incoming payments with source and category" },
    { num: "2", title: "Log Expense", desc: "Enter outgoing payments with vendor and approval reference" },
    { num: "3", title: "Categorise", desc: "Tag each transaction for accurate reporting" },
    { num: "4", title: "Set Alerts", desc: "Configure low-balance warnings to avoid surprises" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Cash Flow Troubleshooting", [
  { problem: "Negative forecast showing", solution: "Review upcoming obligations and expected receivables", fallback: "Adjust payment schedules to improve cash position", icon: "📉" },
  { problem: "Uncategorised transactions", solution: "Use bulk-categorise to tag multiple entries at once", fallback: "Set default categories for recurring transactions", icon: "🏷️" },
  { problem: "Duplicate entries", solution: "Check import logs for double-posted transactions", fallback: "Delete duplicates and re-reconcile the period", icon: "📋" },
  { problem: "Projection mismatch", solution: "Update recurring income/expense templates", fallback: "Manually adjust the forecast with override entries", icon: "🔮" },
]);

const OutroScene = makeOutroScene({
  icon: "📊",
  title: "Cash Flow Management",
  subtitle: "Stay on top of your cash position at all times",
  upNext: ["HR Analytics"],
});

export const CashflowManagement: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Metrics">
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
