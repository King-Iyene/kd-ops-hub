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
  icon: "🏦",
  title: "Pension Management",
  subtitle: "Manage PFA assignments, pension contributions, and remittance schedules",
  tag: "Module 88 · Pension",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Pension Dashboard",
  cards: [
    { title: "Enrolled Employees", desc: "With active PFA", icon: "👥", value: "134" },
    { title: "Monthly Contribution", desc: "Employer + Employee", icon: "💰", value: "₦6.2M" },
    { title: "PFAs Registered", desc: "Active fund administrators", icon: "🏦", value: "12" },
    { title: "Pending Remittance", desc: "Awaiting transfer", icon: "⏳", value: "₦6.2M" },
    { title: "NHF Contributions", desc: "This month", icon: "🏠", value: "₦890K" },
    { title: "Compliance Status", desc: "PenCom filing", icon: "✅", value: "Up to date" },
  ],
});

const StepsScene = makeStepsScene({
  label: "REMITTANCE",
  labelColor: COLORS.accent,
  title: "Processing Pension Remittance",
  steps: [
    { num: "1", title: "Generate Schedule", desc: "Create the monthly contribution schedule from payroll" },
    { num: "2", title: "Verify Amounts", desc: "Review employer (10%) and employee (8%) contributions" },
    { num: "3", title: "Approve & Submit", desc: "Finance approves and submits to PenCom/PFAs" },
    { num: "4", title: "Confirm Remittance", desc: "Upload payment evidence and mark as remitted" },
  ],
  formTitle: "Pension Remittance",
  formFields: [
    { label: "Period", value: "September 2026" },
    { label: "Employees", value: "134" },
    { label: "Employee (8%)", value: "₦2,752,000" },
    { label: "Employer (10%)", value: "₦3,440,000" },
    { label: "Total", value: "₦6,192,000" },
    { label: "Due Date", value: "7 Oct 2026" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Pension Troubleshooting", [
  { problem: "Employee PFA not set", solution: "Update the PFA details from the employee pension profile", fallback: "Ask the employee to provide their RSA PIN and PFA name", icon: "🏦" },
  { problem: "Contribution amount wrong", solution: "Verify the basic salary and pension-eligible components", fallback: "Recalculate manually and adjust in the schedule", icon: "💰" },
  { problem: "Remittance rejected by PFA", solution: "Check for mismatched RSA PINs or names in the schedule", fallback: "Correct the entries and resubmit the schedule", icon: "🚫" },
  { problem: "NHF deduction missing", solution: "Ensure NHF is enabled for the employee in payroll settings", fallback: "Add the NHF line item manually to the next payroll", icon: "🏠" },
]);

const OutroScene = makeOutroScene({
  icon: "🏦",
  title: "Pension Management",
  subtitle: "Stay compliant with PenCom regulations and timely remittances",
  upNext: ["Multi-Currency Payments"],
  isFinal: true,
});

export const PensionModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Remittance">
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
