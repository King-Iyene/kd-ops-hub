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
  title: "Gratuity",
  subtitle: "Module 90 · End-of-service calculations, gratuity provisions & accruals",
  tag: "HR · Benefits",
});

const CardsSceneComp = makeCardsScene({
  label: "Gratuity at a Glance",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "Total Provisions", desc: "Cumulative gratuity liability across the organisation", icon: "📊", value: "₦142M" },
    { title: "Eligible Staff", desc: "Employees who have completed the qualifying period", icon: "👥", value: "189 Staff" },
    { title: "Monthly Accrual", desc: "Current month's gratuity expense accrual", icon: "📅", value: "₦6.3M/mo" },
    { title: "Payouts YTD", desc: "Gratuity settlements paid to exiting employees", icon: "💳", value: "₦31.5M" },
    { title: "Avg Service Yrs", desc: "Average tenure of gratuity-eligible employees", icon: "⏳", value: "7.4 Years" },
    { title: "Pending Reviews", desc: "Gratuity calculations awaiting Finance sign-off", icon: "📝", value: "12 Reviews" },
  ],
});

const StepsScene = makeStepsScene({
  label: "Step-by-Step",
  labelColor: COLORS.accent,
  title: "Processing a Gratuity Payment",
  steps: [
    { num: 1, title: "Confirm Eligibility", desc: "Verify the employee meets the minimum service requirement under the Labour Act" },
    { num: 2, title: "Calculate Entitlement", desc: "Run the gratuity formula using final salary and years of service" },
    { num: 3, title: "Review & Approve", desc: "Route the computation to HR Head and Finance for dual sign-off" },
    { num: 4, title: "Process Payment", desc: "Generate the payment voucher and schedule the bank transfer" },
  ],
  formTitle: "Gratuity Calculation",
  formFields: [
    { label: "Employee", value: "Chukwuemeka Nwosu" },
    { label: "Staff ID", value: "KD-2198" },
    { label: "Date Joined", value: "15 Mar 2017" },
    { label: "Exit Date", value: "30 Sep 2026" },
    { label: "Final Salary", value: "₦1,850,000" },
    { label: "Gratuity Due", value: "₦16,650,000" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Gratuity Troubleshooting", [
  { problem: "Gratuity amount looks incorrect", solution: "Check the salary basis — confirm whether it uses basic or gross salary per company policy", fallback: "Review the gratuity formula in Settings → Gratuity Rules and compare with the employee's pay history", icon: "❌" },
  { problem: "Employee not showing as eligible", solution: "Verify the hire date and confirm the qualifying period in the gratuity policy settings", fallback: "Manually override eligibility with HR Director approval if records were migrated incorrectly", icon: "⏳" },
  { problem: "Accrual figures not updating", solution: "Run the monthly accrual batch job from Payroll → Gratuity Accruals", fallback: "Contact Finance to trigger a manual recalculation for the current period", icon: "💸" },
  { problem: "Payment voucher generation fails", solution: "Ensure the employee's bank details are complete and the gratuity has been fully approved", fallback: "Create the voucher manually in Finance → Payment Vouchers with the gratuity reference", icon: "🏦" },
]);

const OutroScene = makeOutroScene({
  icon: "💰",
  title: "Gratuity Module Complete",
  subtitle: "End-of-service calculations, provisions and accruals — all in one place",
  upNext: ["Employee Wellness"],
});

export const GratuityModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Steps">
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
