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
  icon: "💸",
  title: "Principal Disbursements",
  subtitle: "Manage principal payments, bulk transfers, and track every disbursement",
  tag: "Module 59 · Disbursements",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Disbursement Summary",
  cards: [
    { title: "Total Disbursed", desc: "This month", icon: "💰", value: "₦48.6M" },
    { title: "Pending Approvals", desc: "Awaiting sign-off", icon: "⏳", value: "7" },
    { title: "Bulk Transfers", desc: "Processed this week", icon: "📤", value: "3" },
    { title: "Failed Payments", desc: "Requiring attention", icon: "❌", value: "2" },
    { title: "Beneficiaries", desc: "Active recipients", icon: "👥", value: "124" },
    { title: "Avg. Processing", desc: "Time per batch", icon: "⏱️", value: "18 min" },
  ],
});

const StepsScene = makeStepsScene({
  label: "PROCESS PAYMENT",
  labelColor: COLORS.accent,
  title: "Making a Disbursement",
  steps: [
    { num: "1", title: "Select Beneficiaries", desc: "Choose individuals or upload a batch list" },
    { num: "2", title: "Enter Amounts", desc: "Set payment amounts and add narrations" },
    { num: "3", title: "Submit for Approval", desc: "Route to the designated approver(s)" },
    { num: "4", title: "Execute Transfer", desc: "Approved payments are sent to bank accounts" },
  ],
  formTitle: "New Disbursement",
  formFields: [
    { label: "Payment Type", value: "Principal Payment" },
    { label: "Beneficiary", value: "Okonkwo & Partners" },
    { label: "Amount", value: "₦3,750,000" },
    { label: "Bank", value: "GTBank" },
    { label: "Account No.", value: "012****890" },
    { label: "Narration", value: "Sept contract payment" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Disbursements Troubleshooting", [
  { problem: "Payment stuck in pending", solution: "Check if the approver has been notified", fallback: "Escalate to a secondary approver or admin", icon: "⏳" },
  { problem: "Bulk upload rejected", solution: "Validate the CSV format matches the template", fallback: "Check for invalid account numbers in the file", icon: "📄" },
  { problem: "Transfer failed at bank", solution: "Verify the beneficiary account details are correct", fallback: "Retry the payment or contact your bank liaison", icon: "🏦" },
  { problem: "Duplicate payment detected", solution: "Review the flagged transactions in the audit log", fallback: "Cancel the duplicate and process a reversal", icon: "⚠️" },
]);

const OutroScene = makeOutroScene({
  icon: "💸",
  title: "Principal Disbursements",
  subtitle: "Secure, auditable payments with full approval workflows",
  upNext: ["My Dashboard"],
});

export const PrincipalDisbursements: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ProcessPayment">
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
