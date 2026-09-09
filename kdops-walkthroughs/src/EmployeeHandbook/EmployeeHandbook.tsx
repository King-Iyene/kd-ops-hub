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
  icon: "📖",
  title: "Employee Handbook",
  subtitle: "Create, publish, and manage your company handbook and policies",
  tag: "Module 48 · Handbook",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Handbook Features",
  cards: [
    { title: "Published Policies", desc: "Active company policies", icon: "📋" },
    { title: "Policy Categories", desc: "Organised by department", icon: "🗂️" },
    { title: "Version Control", desc: "Track policy changes", icon: "🔄" },
    { title: "Acknowledgements", desc: "Employee sign-offs", icon: "✍️" },
    { title: "Custom Sections", desc: "Add company-specific content", icon: "📝" },
    { title: "Search", desc: "Full-text policy search", icon: "🔍" },
    { title: "Templates", desc: "Pre-built policy templates", icon: "📄" },
    { title: "Distribution", desc: "Auto-share with new hires", icon: "📤" },
  ],
  columns: 4,
});

const StepsScene = makeStepsScene({
  label: "CREATE POLICY",
  labelColor: COLORS.accent,
  title: "Publishing a Policy",
  steps: [
    { num: "1", title: "Choose Template", desc: "Select from built-in templates or start blank" },
    { num: "2", title: "Draft Content", desc: "Write the policy using the rich text editor" },
    { num: "3", title: "Set Audience", desc: "Choose which departments or roles see this policy" },
    { num: "4", title: "Publish & Notify", desc: "Publish and send acknowledgement requests to staff" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Handbook Troubleshooting", [
  { problem: "Employee hasn't acknowledged", solution: "Send a reminder from the policy page", fallback: "Check if the employee has access to the handbook section", icon: "⏳" },
  { problem: "Policy not visible to staff", solution: "Verify the audience settings include their department/role", fallback: "Check if the policy is in Published status, not Draft", icon: "👁️" },
  { problem: "Cannot edit published policy", solution: "Create a new version — published policies are locked", fallback: "Unpublish, edit, then republish (staff will be re-notified)", icon: "🔒" },
  { problem: "Template formatting issues", solution: "Clear formatting and re-apply using the editor toolbar", fallback: "Copy content to a plain text editor, then paste back", icon: "🎨" },
]);

const OutroScene = makeOutroScene({
  icon: "📖",
  title: "Employee Handbook",
  subtitle: "Keep your team informed with up-to-date policies",
  upNext: ["Approval Workflows"],
});

export const EmployeeHandbook: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Features">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreatePolicy">
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
