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
  icon: "✈️",
  title: "Travel Management",
  subtitle: "Handle travel requests, bookings, per diem, and expense claims",
  tag: "Module 86 · Travel",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Travel Dashboard",
  cards: [
    { title: "Open Requests", desc: "Pending approval", icon: "📝", value: "6" },
    { title: "Upcoming Trips", desc: "Scheduled this month", icon: "🗓️", value: "9" },
    { title: "Per Diem Budget", desc: "Allocated this quarter", icon: "💵", value: "₦3.6M" },
    { title: "Expense Claims", desc: "Pending reimbursement", icon: "🧾", value: "14" },
    { title: "Completed Trips", desc: "This quarter", icon: "✅", value: "22" },
    { title: "Avg Trip Cost", desc: "Per employee", icon: "📊", value: "₦185K" },
  ],
});

const StepsScene = makeStepsScene({
  label: "TRAVEL REQUEST",
  labelColor: COLORS.accent,
  title: "Submitting a Travel Request",
  steps: [
    { num: "1", title: "Trip Details", desc: "Enter destination, dates, purpose, and travel mode" },
    { num: "2", title: "Budget Estimate", desc: "Add flight, hotel, per diem, and transport estimates" },
    { num: "3", title: "Approval Routing", desc: "Submit to line manager and finance for approval" },
    { num: "4", title: "Book & Travel", desc: "Proceed with bookings after approval is granted" },
  ],
  formTitle: "Travel Request",
  formFields: [
    { label: "Employee", value: "Oluwaseun Ajayi" },
    { label: "Destination", value: "Abuja" },
    { label: "Travel Dates", value: "18 - 21 Sep 2026" },
    { label: "Purpose", value: "Client site visit" },
    { label: "Estimated Cost", value: "₦245,000" },
    { label: "Per Diem Rate", value: "₦25,000/day" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Travel Management Troubleshooting", [
  { problem: "Request not approved in time", solution: "Check if the approver is available or on leave", fallback: "Escalate to the next approver in the chain", icon: "⏳" },
  { problem: "Per diem rate incorrect", solution: "Verify the rate table for the destination in settings", fallback: "Override the rate with manager approval", icon: "💵" },
  { problem: "Expense claim rejected", solution: "Ensure all receipts are attached and amounts match", fallback: "Resubmit with corrected amounts and documentation", icon: "🧾" },
  { problem: "Booking not linked to request", solution: "Attach the booking confirmation to the travel record", fallback: "Create the link manually from the travel detail page", icon: "🔗" },
]);

const OutroScene = makeOutroScene({
  icon: "✈️",
  title: "Travel Management",
  subtitle: "Efficient travel planning with full expense tracking",
  upNext: ["Loan Management"],
});

export const TravelManagement: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="TravelRequest">
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
