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
  icon: "📊",
  title: "Project Tracking",
  subtitle: "Track projects, milestones, deliverables, and timelines in one place",
  tag: "Module 80 · Project Tracking",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Project Dashboard",
  cards: [
    { title: "Active Projects", desc: "Currently in progress", icon: "🚀", value: "9" },
    { title: "Milestones Due", desc: "This month", icon: "🎯", value: "7" },
    { title: "On Track", desc: "Projects meeting deadline", icon: "✅", value: "6" },
    { title: "At Risk", desc: "Behind schedule", icon: "⚠️", value: "2" },
    { title: "Deliverables", desc: "Pending review", icon: "📦", value: "18" },
    { title: "Budget Utilised", desc: "Across all projects", icon: "💰", value: "₦32.5M" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE PROJECT",
  labelColor: COLORS.accent,
  title: "Setting Up a New Project",
  steps: [
    { num: "1", title: "Project Details", desc: "Enter project name, client, budget, and timeline" },
    { num: "2", title: "Define Milestones", desc: "Break the project into milestones with due dates" },
    { num: "3", title: "Assign Team", desc: "Add project manager and team members" },
    { num: "4", title: "Launch & Track", desc: "Activate the project and begin tracking progress" },
  ],
  formTitle: "New Project",
  formFields: [
    { label: "Project Name", value: "KDOps Mobile App v2" },
    { label: "Client", value: "Internal" },
    { label: "Project Manager", value: "Ngozi Ibe" },
    { label: "Budget", value: "₦15,000,000" },
    { label: "Start Date", value: "01 Oct 2026" },
    { label: "Deadline", value: "31 Mar 2027" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Project Tracking Troubleshooting", [
  { problem: "Milestone not updating", solution: "Check if the deliverables under it are marked complete", fallback: "Manually update milestone progress percentage", icon: "🎯" },
  { problem: "Budget showing negative", solution: "Verify all expense entries are correctly categorised", fallback: "Request a budget revision from the finance team", icon: "💰" },
  { problem: "Team member cannot log hours", solution: "Ensure the member is added to the project roster", fallback: "Add the member and assign them to the relevant task", icon: "⏱️" },
  { problem: "Timeline view not loading", solution: "Clear browser cache and reload the project page", fallback: "Switch to list view and check data from there", icon: "📅" },
]);

const OutroScene = makeOutroScene({
  icon: "📊",
  title: "Project Tracking",
  subtitle: "Deliver projects on time with clear milestones and accountability",
  upNext: ["Inventory Module"],
});

export const ProjectTracking: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateProject">
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
