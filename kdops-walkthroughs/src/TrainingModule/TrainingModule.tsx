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
  icon: "🎓",
  title: "Training & Development",
  subtitle: "Create training programs, track completion, and build a learning culture",
  tag: "Module 44 · Training",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Training Programs",
  cards: [
    { title: "Active Programs", desc: "Currently running", icon: "📚", value: "12" },
    { title: "Enrolled Staff", desc: "Total participants", icon: "👥", value: "89" },
    { title: "Completion Rate", desc: "Average across programs", icon: "✅", value: "76%" },
    { title: "Upcoming Sessions", desc: "Scheduled this month", icon: "📅", value: "5" },
    { title: "Certifications", desc: "Issued this year", icon: "🏆", value: "34" },
    { title: "Training Budget", desc: "Utilised this year", icon: "💰", value: "₦2.8M" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE PROGRAM",
  labelColor: COLORS.accent,
  title: "Creating a Program",
  steps: [
    { num: "1", title: "Program Details", desc: "Enter program name, category, and duration" },
    { num: "2", title: "Set Instructor", desc: "Assign an internal or external trainer" },
    { num: "3", title: "Configure Enrollment", desc: "Set max participants and enrollment deadline" },
    { num: "4", title: "Launch Program", desc: "Publish and notify eligible employees" },
  ],
  formTitle: "New Training Program",
  formFields: [
    { label: "Program Name", value: "Leadership Excellence" },
    { label: "Category", value: "Management" },
    { label: "Duration", value: "4 weeks" },
    { label: "Instructor", value: "Dr. Amaka Eze" },
    { label: "Max Participants", value: "25" },
    { label: "Start Date", value: "15 Oct 2026" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Training Troubleshooting", [
  { problem: "Employee cannot enroll", solution: "Check if the program has reached max capacity", fallback: "Add the employee manually via the Admin panel", icon: "🚫" },
  { problem: "Certificate not issued", solution: "Verify the employee completed all required modules", fallback: "Manually issue the certificate from the program page", icon: "📜" },
  { problem: "Attendance not recorded", solution: "Ensure the trainer marked attendance for the session", fallback: "Update attendance manually in the session log", icon: "📋" },
  { problem: "Program showing as full", solution: "Increase the max participants in program settings", fallback: "Create a waitlist and schedule an additional cohort", icon: "👥" },
]);

const OutroScene = makeOutroScene({
  icon: "🎓",
  title: "Training & Development",
  subtitle: "Build a culture of continuous learning",
  upNext: ["Attendance Tracking"],
});

export const TrainingModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateProgram">
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
