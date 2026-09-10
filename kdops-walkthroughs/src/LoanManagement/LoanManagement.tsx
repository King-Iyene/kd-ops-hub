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
  icon: "💳",
  title: "Loan Management",
  subtitle: "Process employee loans, manage repayment schedules, and automate deductions",
  tag: "Module 87 · Loan Management",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Loan Dashboard",
  cards: [
    { title: "Active Loans", desc: "Currently being repaid", icon: "📋", value: "28" },
    { title: "Pending Applications", desc: "Awaiting approval", icon: "⏳", value: "5" },
    { title: "Total Disbursed", desc: "This year", icon: "💰", value: "₦12.4M" },
    { title: "Monthly Deductions", desc: "Current cycle", icon: "📉", value: "₦1.8M" },
    { title: "Fully Repaid", desc: "Loans closed this year", icon: "✅", value: "16" },
    { title: "Default Rate", desc: "Overdue repayments", icon: "⚠️", value: "2.1%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "APPLY FOR LOAN",
  labelColor: COLORS.accent,
  title: "Processing a Loan Application",
  steps: [
    { num: "1", title: "Submit Application", desc: "Employee fills in loan amount, purpose, and tenure" },
    { num: "2", title: "Eligibility Check", desc: "System verifies salary, existing loans, and service years" },
    { num: "3", title: "Approval Workflow", desc: "Route to HR and finance for review and sign-off" },
    { num: "4", title: "Disburse & Schedule", desc: "Credit the employee and set up payroll deductions" },
  ],
  formTitle: "Loan Application",
  formFields: [
    { label: "Employee", value: "Kemi Ogundimu" },
    { label: "Loan Type", value: "Personal Loan" },
    { label: "Amount", value: "₦500,000" },
    { label: "Tenure", value: "12 months" },
    { label: "Monthly Deduction", value: "₦45,833" },
    { label: "Guarantor", value: "Femi Adegoke" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Loan Management Troubleshooting", [
  { problem: "Loan application rejected", solution: "Check eligibility criteria (salary ratio, existing loans)", fallback: "Adjust the loan amount or tenure and reapply", icon: "🚫" },
  { problem: "Deduction not reflecting", solution: "Verify the loan is linked to the payroll schedule", fallback: "Add the deduction manually in the next payroll run", icon: "💰" },
  { problem: "Repayment schedule wrong", solution: "Recalculate from the loan detail page with correct dates", fallback: "Manually adjust the schedule and notify the employee", icon: "📅" },
  { problem: "Guarantor not approved", solution: "Ensure the guarantor meets the minimum grade requirement", fallback: "Replace with an eligible guarantor and resubmit", icon: "👤" },
]);

const OutroScene = makeOutroScene({
  icon: "💳",
  title: "Loan Management",
  subtitle: "Transparent lending with automated repayment tracking",
  upNext: ["Pension Module"],
});

export const LoanManagement: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ApplyForLoan">
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
