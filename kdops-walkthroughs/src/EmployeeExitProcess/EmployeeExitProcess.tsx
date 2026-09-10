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
  icon: "🚪",
  title: "Employee Exit Process",
  subtitle: "Handle resignations, terminations, exit interviews, and clearance workflows",
  tag: "Module 77 · Exit Process",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Exit Dashboard",
  cards: [
    { title: "Active Exits", desc: "Currently processing", icon: "📋", value: "6" },
    { title: "Pending Clearance", desc: "Awaiting department sign-off", icon: "✍️", value: "4" },
    { title: "Exit Interviews", desc: "Scheduled this month", icon: "🎤", value: "3" },
    { title: "Avg Notice Period", desc: "Days across exits", icon: "📅", value: "30" },
    { title: "Completed Exits", desc: "This quarter", icon: "✅", value: "11" },
    { title: "Final Settlements", desc: "Pending payout", icon: "💰", value: "₦4.1M" },
  ],
});

const StepsScene = makeStepsScene({
  label: "PROCESS EXIT",
  labelColor: COLORS.accent,
  title: "Processing an Employee Exit",
  steps: [
    { num: "1", title: "Initiate Exit", desc: "Record resignation or termination with effective date" },
    { num: "2", title: "Clearance Workflow", desc: "Route clearance form to IT, Admin, Finance, and HR" },
    { num: "3", title: "Exit Interview", desc: "Schedule and conduct the exit interview" },
    { num: "4", title: "Final Settlement", desc: "Calculate and process final pay, benefits, and pension" },
  ],
  formTitle: "Employee Exit Form",
  formFields: [
    { label: "Employee", value: "Chidinma Okafor" },
    { label: "Exit Type", value: "Voluntary Resignation" },
    { label: "Last Working Day", value: "30 Sep 2026" },
    { label: "Notice Period", value: "30 days" },
    { label: "Clearance Status", value: "In Progress" },
    { label: "Exit Interview", value: "15 Sep 2026" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Exit Process Troubleshooting", [
  { problem: "Clearance form not routed", solution: "Check if all department heads are assigned in settings", fallback: "Manually assign the clearance to each department", icon: "📨" },
  { problem: "Final pay calculation wrong", solution: "Verify outstanding leave days and loan balances", fallback: "Recalculate manually and adjust in payroll", icon: "💰" },
  { problem: "Exit interview not scheduled", solution: "Ensure the HR officer is assigned to the exit record", fallback: "Schedule the interview directly from the calendar", icon: "🎤" },
  { problem: "Employee access not revoked", solution: "Confirm IT clearance step is completed", fallback: "Notify IT admin to disable accounts immediately", icon: "🔒" },
]);

const OutroScene = makeOutroScene({
  icon: "🚪",
  title: "Employee Exit Process",
  subtitle: "Smooth, compliant offboarding from start to finish",
  upNext: ["Company Policies"],
});

export const EmployeeExitProcess: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ProcessExit">
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
