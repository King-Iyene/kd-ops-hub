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
  icon: "💱",
  title: "Multi-Currency Payments",
  subtitle: "Manage foreign exchange, multi-currency payments, and rate management",
  tag: "Module 76 · Multi-Currency",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Currency Dashboard",
  cards: [
    { title: "Active Currencies", desc: "Supported for payments", icon: "🌍", value: "8" },
    { title: "FX Rate (USD/NGN)", desc: "Current market rate", icon: "📈", value: "₦1,580" },
    { title: "Pending Transfers", desc: "Awaiting conversion", icon: "⏳", value: "14" },
    { title: "Monthly Volume", desc: "Cross-border payments", icon: "💸", value: "₦45.2M" },
    { title: "GBP Payments", desc: "Processed this month", icon: "🇬🇧", value: "23" },
    { title: "EUR Payments", desc: "Processed this month", icon: "🇪🇺", value: "17" },
  ],
});

const StepsScene = makeStepsScene({
  label: "MAKE PAYMENT",
  labelColor: COLORS.accent,
  title: "Processing a Multi-Currency Payment",
  steps: [
    { num: "1", title: "Select Currency", desc: "Choose the destination currency and payment corridor" },
    { num: "2", title: "Enter Amount", desc: "Input NGN amount or foreign equivalent with live rate preview" },
    { num: "3", title: "Verify Rate & Fees", desc: "Confirm exchange rate, charges, and settlement timeline" },
    { num: "4", title: "Approve & Send", desc: "Submit for approval and track conversion status" },
  ],
  formTitle: "New FX Payment",
  formFields: [
    { label: "Beneficiary", value: "Olumide Adeyemi" },
    { label: "Currency", value: "USD" },
    { label: "Amount (USD)", value: "$3,200.00" },
    { label: "NGN Equivalent", value: "₦5,056,000" },
    { label: "Exchange Rate", value: "1,580.00" },
    { label: "Settlement Date", value: "12 Sep 2026" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Multi-Currency Troubleshooting", [
  { problem: "Exchange rate outdated", solution: "Refresh rates from the FX Rate Management page", fallback: "Manually override with the current CBN rate", icon: "📉" },
  { problem: "Payment stuck in conversion", solution: "Check if the treasury approval is pending", fallback: "Escalate to the finance team for manual settlement", icon: "⏳" },
  { problem: "Currency not available", solution: "Verify the currency is enabled in system settings", fallback: "Contact admin to add the currency corridor", icon: "🚫" },
  { problem: "Rate mismatch on receipt", solution: "Compare the locked rate vs. settlement rate timestamp", fallback: "Raise a dispute with the treasury desk", icon: "⚠️" },
]);

const OutroScene = makeOutroScene({
  icon: "💱",
  title: "Multi-Currency Payments",
  subtitle: "Seamless cross-border payments with real-time FX rates",
  upNext: ["Employee Exit Process"],
});

export const MultiCurrencyPayments: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="MakePayment">
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
