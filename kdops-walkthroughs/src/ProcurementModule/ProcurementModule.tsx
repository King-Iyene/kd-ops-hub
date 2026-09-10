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
  icon: "🛒",
  title: "Procurement",
  subtitle: "Manage purchase requests, vendor selection, and approval workflows",
  tag: "Module 82 · Procurement",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Procurement Dashboard",
  cards: [
    { title: "Open Requests", desc: "Awaiting processing", icon: "📝", value: "11" },
    { title: "Approved PRs", desc: "Ready for PO creation", icon: "✅", value: "7" },
    { title: "Active Vendors", desc: "Registered suppliers", icon: "🏪", value: "46" },
    { title: "Monthly Spend", desc: "Total procurement", icon: "💰", value: "₦8.3M" },
    { title: "Pending Approvals", desc: "Awaiting sign-off", icon: "⏳", value: "5" },
    { title: "Savings This Quarter", desc: "Vs. budget allocation", icon: "📉", value: "₦1.2M" },
  ],
});

const StepsScene = makeStepsScene({
  label: "PURCHASE REQUEST",
  labelColor: COLORS.accent,
  title: "Submitting a Purchase Request",
  steps: [
    { num: "1", title: "Raise Request", desc: "Specify items, quantities, and justification" },
    { num: "2", title: "Get Quotes", desc: "Attach vendor quotes for comparison" },
    { num: "3", title: "Approval Routing", desc: "Submit to line manager and procurement head" },
    { num: "4", title: "Generate PO", desc: "Convert approved request into a purchase order" },
  ],
  formTitle: "Purchase Request",
  formFields: [
    { label: "PR Number", value: "PR-2026-0142" },
    { label: "Requested By", value: "Aisha Bello" },
    { label: "Department", value: "Operations" },
    { label: "Items", value: "Office furniture (4 items)" },
    { label: "Estimated Cost", value: "₦1,850,000" },
    { label: "Urgency", value: "High" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Procurement Troubleshooting", [
  { problem: "PR stuck in approval", solution: "Check the approval chain for any skipped approvers", fallback: "Reassign to an alternate approver with the right role", icon: "⏳" },
  { problem: "Vendor not in system", solution: "Register the vendor via Procurement > Vendor Management", fallback: "Use a one-time vendor entry with manager approval", icon: "🏪" },
  { problem: "Budget exceeded warning", solution: "Verify the department budget allocation for the period", fallback: "Request a budget reallocation from the finance team", icon: "💰" },
  { problem: "Quote attachments missing", solution: "Check file size limits and supported formats (PDF, JPG)", fallback: "Upload quotes separately via the document manager", icon: "📎" },
]);

const OutroScene = makeOutroScene({
  icon: "🛒",
  title: "Procurement",
  subtitle: "Streamlined purchasing with full audit trails",
  upNext: ["Meeting Scheduler"],
});

export const ProcurementModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="PurchaseRequest">
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
