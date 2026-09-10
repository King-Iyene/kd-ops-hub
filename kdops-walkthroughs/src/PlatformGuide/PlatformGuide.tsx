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
  icon: "🧭",
  title: "Platform Guide",
  subtitle: "Interactive tutorials, walkthroughs, and a built-in help centre",
  tag: "Module 58 · Platform Guide",
});

const CardsSceneComp = makeCardsScene({
  label: "RESOURCES",
  labelColor: COLORS.green,
  title: "Help & Learning",
  cards: [
    { title: "Video Tutorials", desc: "Step-by-step walkthroughs", icon: "🎬", value: "63" },
    { title: "Quick-Start Guides", desc: "Per-module guides", icon: "📖", value: "24" },
    { title: "FAQs", desc: "Common questions answered", icon: "❓", value: "86" },
    { title: "Interactive Tours", desc: "Guided UI walkthroughs", icon: "🗺️", value: "15" },
    { title: "Release Notes", desc: "Latest updates", icon: "🆕", value: "v4.2" },
    { title: "Support Tickets", desc: "Open this month", icon: "🎫", value: "7" },
  ],
});

const StepsScene = makeStepsScene({
  label: "GET STARTED",
  labelColor: COLORS.accent,
  title: "Using the Guide",
  steps: [
    { num: "1", title: "Open Guide", desc: "Click the Help icon or navigate to Platform Guide" },
    { num: "2", title: "Browse or Search", desc: "Find articles by category or keyword search" },
    { num: "3", title: "Watch Tutorials", desc: "Play embedded videos for visual walkthroughs" },
    { num: "4", title: "Start a Tour", desc: "Launch an interactive tour to learn by doing" },
  ],
  formTitle: "Support Request",
  formFields: [
    { label: "Subject", value: "Cannot find payroll report" },
    { label: "Module", value: "Payroll" },
    { label: "Priority", value: "Medium" },
    { label: "Description", value: "Need help locating..." },
    { label: "Attachments", value: "screenshot.png" },
    { label: "Submitted By", value: "Funke Adeyemi" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Platform Guide Troubleshooting", [
  { problem: "Tutorial video not playing", solution: "Check your browser supports HTML5 video playback", fallback: "Try a different browser or clear your cache", icon: "🎬" },
  { problem: "Interactive tour stuck", solution: "Click the X button to exit and restart the tour", fallback: "Refresh the page and re-launch from the Guide", icon: "🗺️" },
  { problem: "Search returns no results", solution: "Try broader keywords or check for typos", fallback: "Browse by category to find the topic manually", icon: "🔍" },
  { problem: "Support ticket not submitted", solution: "Ensure all required fields are filled in", fallback: "Email support directly at code@kdsquares.com", icon: "🎫" },
]);

const OutroScene = makeOutroScene({
  icon: "🧭",
  title: "Platform Guide",
  subtitle: "Everything you need to master KDOps, right at your fingertips",
  upNext: ["Principal Disbursements"],
});

export const PlatformGuide: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Resources">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="GetStarted">
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
