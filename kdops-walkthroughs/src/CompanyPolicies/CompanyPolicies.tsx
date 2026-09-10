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
  icon: "📜",
  title: "Company Policies",
  subtitle: "Manage policies, track acknowledgements, and maintain version control",
  tag: "Module 78 · Company Policies",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Policy Dashboard",
  cards: [
    { title: "Active Policies", desc: "Currently enforced", icon: "📄", value: "24" },
    { title: "Pending Reviews", desc: "Due for annual update", icon: "🔄", value: "5" },
    { title: "Acknowledgement Rate", desc: "Staff who signed off", icon: "✅", value: "91%" },
    { title: "New This Quarter", desc: "Recently published", icon: "🆕", value: "3" },
    { title: "Departments Covered", desc: "With active policies", icon: "🏢", value: "8" },
    { title: "Overdue Sign-offs", desc: "Staff yet to acknowledge", icon: "⚠️", value: "12" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE POLICY",
  labelColor: COLORS.accent,
  title: "Publishing a New Policy",
  steps: [
    { num: "1", title: "Draft Policy", desc: "Write the policy document with effective date and scope" },
    { num: "2", title: "Review & Approve", desc: "Route to legal and management for sign-off" },
    { num: "3", title: "Publish & Notify", desc: "Publish the policy and notify all affected employees" },
    { num: "4", title: "Track Acknowledgement", desc: "Monitor staff sign-offs and send reminders" },
  ],
  formTitle: "New Policy",
  formFields: [
    { label: "Policy Title", value: "Remote Work Policy v2.0" },
    { label: "Category", value: "HR / Work Arrangement" },
    { label: "Effective Date", value: "01 Oct 2026" },
    { label: "Applies To", value: "All Employees" },
    { label: "Approved By", value: "Emeka Nwosu (MD)" },
    { label: "Review Cycle", value: "Annual" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Policy Troubleshooting", [
  { problem: "Employee cannot view policy", solution: "Check if the policy is published and not in draft", fallback: "Share the policy document link directly", icon: "👁️" },
  { problem: "Acknowledgement not recording", solution: "Ensure the employee is in the target audience group", fallback: "Record the acknowledgement manually in the system", icon: "✍️" },
  { problem: "Old version still showing", solution: "Verify the new version is set as the active version", fallback: "Archive the old version and republish", icon: "🔄" },
  { problem: "Reminder emails not sent", solution: "Check the notification schedule in policy settings", fallback: "Send a manual reminder from the policy page", icon: "📧" },
]);

const OutroScene = makeOutroScene({
  icon: "📜",
  title: "Company Policies",
  subtitle: "Keep your organisation aligned with clear, versioned policies",
  upNext: ["Team Management"],
});

export const CompanyPolicies: React.FC = () => {
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
