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
  icon: "🏛️",
  title: "Tax Compliance",
  subtitle: "PAYE, pension, NHF, NSITF — automated Nigerian tax calculations and remittances",
  tag: "Module 72 · Tax Compliance",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Tax & Statutory Overview",
  cards: [
    { title: "PAYE Remitted", desc: "This month to FIRS", icon: "🏦", value: "₦2.1M" },
    { title: "Pension (CPS)", desc: "Employee + employer", icon: "👴", value: "₦1.4M" },
    { title: "NHF", desc: "National Housing Fund", icon: "🏠", value: "₦280K" },
    { title: "NSITF", desc: "Social insurance fund", icon: "🛡️", value: "₦95K" },
    { title: "ITF", desc: "Industrial Training Fund", icon: "🎓", value: "₦180K" },
    { title: "Filing Status", desc: "All returns up to date", icon: "✅", value: "Current" },
  ],
});

const StepsScene = makeStepsScene({
  label: "RUN PAYE",
  labelColor: COLORS.accent,
  title: "Processing PAYE Tax",
  steps: [
    { num: "1", title: "Review Payroll", desc: "Confirm gross salaries, allowances, and deductions" },
    { num: "2", title: "Calculate PAYE", desc: "System applies graduated tax table per FIRS guidelines" },
    { num: "3", title: "Generate Schedule", desc: "Produce the PAYE schedule for all employees" },
    { num: "4", title: "Remit & File", desc: "Submit payment to FIRS and file the monthly return" },
  ],
  formTitle: "PAYE Calculation",
  formFields: [
    { label: "Pay Period", value: "September 2026" },
    { label: "Total Gross", value: "₦24,500,000" },
    { label: "Relief (CRA)", value: "₦4,200,000" },
    { label: "Taxable Income", value: "₦20,300,000" },
    { label: "PAYE Due", value: "₦2,145,000" },
    { label: "Due Date", value: "10 Oct 2026" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Tax Compliance Troubleshooting", [
  { problem: "PAYE amount looks wrong", solution: "Verify the CRA (consolidated relief allowance) is correctly applied", fallback: "Recalculate manually using the FIRS graduated tax table to compare", icon: "🧮" },
  { problem: "Pension not deducting", solution: "Check the employee's pension opt-in status and PFA details", fallback: "Manually enter the pension deduction for this pay period", icon: "👴" },
  { problem: "NHF not appearing on payslip", solution: "Ensure NHF is enabled in the company statutory settings", fallback: "Add NHF as a custom deduction at 2.5% of basic salary", icon: "🏠" },
  { problem: "Filing deadline missed", solution: "Submit immediately — late filing attracts penalties from FIRS", fallback: "Generate the overdue schedule and file with a penalty note", icon: "⏰" },
]);

const OutroScene = makeOutroScene({
  icon: "🏛️",
  title: "Tax Compliance",
  subtitle: "Stay compliant with Nigerian tax laws automatically",
  upNext: ["Employee Self-Service"],
});

export const TaxCompliance: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="RunPAYE">
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
