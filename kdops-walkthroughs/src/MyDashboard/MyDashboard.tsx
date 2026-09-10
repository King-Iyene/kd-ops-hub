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
  icon: "🏠",
  title: "My Dashboard",
  subtitle: "Your personal command centre — widgets, quick actions, and notifications",
  tag: "Module 60 · My Dashboard",
});

const CardsSceneComp = makeCardsScene({
  label: "AT A GLANCE",
  labelColor: COLORS.green,
  title: "Dashboard Widgets",
  cards: [
    { title: "Pending Tasks", desc: "Assigned to you", icon: "📋", value: "5" },
    { title: "Approvals", desc: "Waiting for your action", icon: "✅", value: "3" },
    { title: "Notifications", desc: "Unread alerts", icon: "🔔", value: "12" },
    { title: "Leave Balance", desc: "Days remaining", icon: "🌴", value: "14" },
    { title: "Team Online", desc: "Currently active", icon: "🟢", value: "18" },
    { title: "Quick Links", desc: "Pinned shortcuts", icon: "⚡", value: "6" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CUSTOMISE",
  labelColor: COLORS.accent,
  title: "Personalising Your Dashboard",
  steps: [
    { num: "1", title: "Enter Edit Mode", desc: "Click the customise button in the top-right corner" },
    { num: "2", title: "Add Widgets", desc: "Choose from tasks, calendar, reports, and more" },
    { num: "3", title: "Arrange Layout", desc: "Drag and drop widgets to your preferred positions" },
    { num: "4", title: "Save Layout", desc: "Your layout is saved and synced across devices" },
  ],
  formTitle: "Add Widget",
  formFields: [
    { label: "Widget Type", value: "Pending Approvals" },
    { label: "Size", value: "Medium (2×1)" },
    { label: "Data Source", value: "My Approvals Queue" },
    { label: "Refresh Rate", value: "Every 5 minutes" },
    { label: "Position", value: "Top Right" },
    { label: "Theme", value: "Auto (match system)" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Dashboard Troubleshooting", [
  { problem: "Widgets not loading data", solution: "Refresh the page — widgets fetch data on load", fallback: "Check if the underlying module is accessible to you", icon: "📊" },
  { problem: "Layout reset after login", solution: "Ensure you clicked Save after customising", fallback: "Clear browser cache and re-save your layout", icon: "🔄" },
  { problem: "Notification count seems wrong", solution: "Click the bell icon to sync — count updates in real time", fallback: "Check notification settings for filtered-out types", icon: "🔔" },
  { problem: "Quick link broken", solution: "The linked module may have been renamed or moved", fallback: "Remove the old link and add a fresh one", icon: "🔗" },
]);

const OutroScene = makeOutroScene({
  icon: "🏠",
  title: "My Dashboard",
  subtitle: "Your personalised launchpad for everything in KDOps",
  upNext: ["Referrals Module"],
});

export const MyDashboard: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="AtAGlance">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Customise">
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
