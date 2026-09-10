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
  icon: "🔗",
  title: "Public Links",
  subtitle: "Create shareable forms, application links, and public-facing pages",
  tag: "Module 63 · Public Links",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Public Links Summary",
  cards: [
    { title: "Active Links", desc: "Currently live", icon: "🌐", value: "16" },
    { title: "Total Views", desc: "This month", icon: "👁️", value: "4,320" },
    { title: "Form Submissions", desc: "Received this month", icon: "📝", value: "187" },
    { title: "Application Links", desc: "Job application pages", icon: "💼", value: "5" },
    { title: "Expired Links", desc: "Past deadline", icon: "⏰", value: "8" },
    { title: "Conversion Rate", desc: "Views to submissions", icon: "📊", value: "4.3%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE LINK",
  labelColor: COLORS.accent,
  title: "Creating a Public Link",
  steps: [
    { num: "1", title: "Choose Type", desc: "Select form, application page, or info page" },
    { num: "2", title: "Configure Fields", desc: "Add form fields, branding, and instructions" },
    { num: "3", title: "Set Expiry", desc: "Optionally set a deadline or submission limit" },
    { num: "4", title: "Publish & Share", desc: "Generate the link and share via email or social" },
  ],
  formTitle: "New Public Link",
  formFields: [
    { label: "Link Name", value: "Graduate Trainee Application" },
    { label: "Type", value: "Application Form" },
    { label: "Expiry Date", value: "30 Nov 2026" },
    { label: "Max Submissions", value: "500" },
    { label: "Branding", value: "KD Squares Logo" },
    { label: "Redirect URL", value: "ops.kdsquares.com/thank-you" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Public Links Troubleshooting", [
  { problem: "Link returns 404", solution: "Check if the link has expired or been deactivated", fallback: "Generate a new link and update your shared URLs", icon: "🔗" },
  { problem: "Submissions not appearing", solution: "Verify the form is linked to the correct list or module", fallback: "Check spam filters if submissions arrive via email", icon: "📬" },
  { problem: "Branding not showing", solution: "Upload your logo in Settings > Organisation Branding", fallback: "Use the default KDOps branding as a fallback", icon: "🎨" },
  { problem: "Cannot set submission limit", solution: "This feature requires the Professional plan", fallback: "Use the expiry date as an alternative cutoff", icon: "🔢" },
]);

const OutroScene = makeOutroScene({
  icon: "🔗",
  title: "Public Links",
  subtitle: "Extend your KDOps workflows to the outside world",
  upNext: ["Welcome to KDOps"],
  isFinal: true,
});

export const PublicLinksModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateLink">
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
