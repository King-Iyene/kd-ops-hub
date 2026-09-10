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
  icon: "📍",
  title: "Placements",
  subtitle: "Track staff placements, client assignments, and deployment schedules",
  tag: "Module 62 · Placements",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Placement Tracker",
  cards: [
    { title: "Active Placements", desc: "Currently deployed", icon: "🏢", value: "78" },
    { title: "Ending This Month", desc: "Contracts expiring", icon: "📅", value: "11" },
    { title: "New Assignments", desc: "Started this month", icon: "🆕", value: "9" },
    { title: "Client Sites", desc: "Unique locations", icon: "📍", value: "23" },
    { title: "Avg. Duration", desc: "Per placement", icon: "⏱️", value: "6 months" },
    { title: "Revenue", desc: "Placement fees this quarter", icon: "💰", value: "₦32.4M" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE PLACEMENT",
  labelColor: COLORS.accent,
  title: "Deploying an Employee",
  steps: [
    { num: "1", title: "Select Employee", desc: "Choose from available staff or search by skill" },
    { num: "2", title: "Assign Client", desc: "Pick the client site and department" },
    { num: "3", title: "Set Duration", desc: "Define start date, end date, and renewal terms" },
    { num: "4", title: "Confirm & Notify", desc: "Finalise the placement and notify all parties" },
  ],
  formTitle: "New Placement",
  formFields: [
    { label: "Employee", value: "Tobi Ajayi" },
    { label: "Client", value: "Dangote Industries" },
    { label: "Role", value: "IT Support Specialist" },
    { label: "Start Date", value: "1 Oct 2026" },
    { label: "End Date", value: "31 Mar 2027" },
    { label: "Monthly Rate", value: "₦850,000" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Placements Troubleshooting", [
  { problem: "Employee shows as unavailable", solution: "Check if they are already on an active placement", fallback: "End the current placement before reassigning", icon: "🚫" },
  { problem: "Client not in the system", solution: "Add the client first via Contacts Directory", fallback: "Ask an admin to create the client record", icon: "🏢" },
  { problem: "Placement dates overlap", solution: "Adjust the end date of the current assignment", fallback: "Use the overlap report to identify conflicts", icon: "📅" },
  { problem: "Invoice not generated", solution: "Verify the billing schedule is set on the placement", fallback: "Manually create the invoice from the Finance module", icon: "💰" },
]);

const OutroScene = makeOutroScene({
  icon: "📍",
  title: "Placements",
  subtitle: "Streamline staff deployment and maximise client satisfaction",
  upNext: ["Public Links Module"],
});

export const PlacementsModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreatePlacement">
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
