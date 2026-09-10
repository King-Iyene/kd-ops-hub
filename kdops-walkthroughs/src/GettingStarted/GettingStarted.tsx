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
  icon: "🚀",
  title: "Getting Started",
  subtitle: "Your quick-start guide to KDOps — initial setup, first steps, and guided configuration",
  tag: "Module 101 · Getting Started",
});

const CardsSceneComp = makeCardsScene({
  label: "QUICK START",
  labelColor: COLORS.green,
  title: "Setup Progress",
  cards: [
    { title: "Setup Steps", desc: "Total steps in the onboarding wizard", icon: "📋", value: "12" },
    { title: "Completed", desc: "Steps finished so far", icon: "✅", value: "8 / 12" },
    { title: "Time to Complete", desc: "Estimated remaining setup time", icon: "⏱️", value: "~15 min" },
    { title: "Guided Tours", desc: "Interactive walkthroughs available", icon: "🎯", value: "6" },
    { title: "Help Articles", desc: "Knowledge base articles for setup", icon: "📖", value: "48" },
    { title: "Support Tickets", desc: "Open tickets from new users this month", icon: "🎫", value: "5" },
  ],
});

const StepsScene = makeStepsScene({
  label: "FIRST STEPS",
  labelColor: COLORS.accent,
  title: "Completing Initial Setup",
  steps: [
    { num: "1", title: "Company Profile", desc: "Enter your company name, RC number, and registered address" },
    { num: "2", title: "Add Employees", desc: "Import staff via CSV or add them one by one with BVN and NIN" },
    { num: "3", title: "Configure Payroll", desc: "Set pay schedules, tax tables (PAYE), pension (PFA), and HMO" },
    { num: "4", title: "Invite Your Team", desc: "Send login invites and assign roles — Admin, HR, Finance, Staff" },
  ],
  formTitle: "Company Setup",
  formFields: [
    { label: "Company Name", value: "KD Squared Enterprises Ltd" },
    { label: "RC Number", value: "RC 1234567" },
    { label: "Industry", value: "Technology & Business Services" },
    { label: "Employees", value: "150 (imported via CSV)" },
    { label: "Pay Schedule", value: "Monthly — 25th of each month" },
    { label: "Pension Provider", value: "ARM PFA — NHIA compliant" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Getting Started Troubleshooting", [
  { problem: "CSV import failing", solution: "Ensure the file matches the template — download it from the import page", fallback: "Try adding a few employees manually first, then retry the import", icon: "📄" },
  { problem: "Cannot complete company profile", solution: "All required fields (name, RC number, address) must be filled", fallback: "Save as draft and return later — progress is not lost", icon: "🏢" },
  { problem: "Team invites not received", solution: "Check spam folders — invite emails come from noreply@kdops.app", fallback: "Resend the invite or share the direct login link manually", icon: "📧" },
  { problem: "Payroll configuration confusing", solution: "Use the guided wizard — it walks you through PAYE, pension, and NHF", fallback: "Book a free onboarding call with KDOps support", icon: "💰" },
]);

const OutroScene = makeOutroScene({
  icon: "🚀",
  title: "Getting Started",
  subtitle: "You are all set — welcome to KDOps!",
  upNext: ["Welcome to KDOps"],
  isFinal: true,
});

export const GettingStarted: React.FC = () => {
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
