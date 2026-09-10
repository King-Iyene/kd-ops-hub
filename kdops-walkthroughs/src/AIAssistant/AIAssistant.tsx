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
  icon: "🤖",
  title: "AI Assistant",
  subtitle: "Ask questions in plain English, get smart suggestions, and automate workflows",
  tag: "Module 55 · AI Assistant",
});

const CardsSceneComp = makeCardsScene({
  label: "CAPABILITIES",
  labelColor: COLORS.green,
  title: "What AI Can Do",
  cards: [
    { title: "Natural Language", desc: "Ask questions like 'Show unpaid invoices'", icon: "🗣️", value: "Query" },
    { title: "Smart Reports", desc: "Generate summaries on demand", icon: "📊", value: "Auto" },
    { title: "Task Suggestions", desc: "Recommended next actions", icon: "💡", value: "12/day" },
    { title: "Data Lookups", desc: "Instant employee & project info", icon: "🔍", value: "< 2s" },
    { title: "Workflow Automation", desc: "Trigger approvals and reminders", icon: "⚙️", value: "8 flows" },
    { title: "Learning Model", desc: "Improves with your usage", icon: "🧠", value: "Active" },
  ],
});

const StepsScene = makeStepsScene({
  label: "USE THE ASSISTANT",
  labelColor: COLORS.accent,
  title: "Asking the AI",
  steps: [
    { num: "1", title: "Open Assistant", desc: "Click the AI icon in the sidebar or press Ctrl+K" },
    { num: "2", title: "Type Your Query", desc: "Use plain language — 'Who is on leave today?'" },
    { num: "3", title: "Review Results", desc: "AI returns data, charts, or action suggestions" },
    { num: "4", title: "Take Action", desc: "Click to navigate, export, or trigger a workflow" },
  ],
  formTitle: "AI Conversation",
  formFields: [
    { label: "Your Query", value: "Show all pending approvals" },
    { label: "Context", value: "HR & Finance modules" },
    { label: "Response Type", value: "Table + Summary" },
    { label: "Follow-Up", value: "Email this to my manager" },
    { label: "Confidence", value: "94%" },
    { label: "Sources", value: "3 modules referenced" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("AI Assistant Troubleshooting", [
  { problem: "AI gives incorrect data", solution: "Rephrase your question with more specific terms", fallback: "Report the inaccuracy via the feedback button", icon: "❌" },
  { problem: "Assistant is slow to respond", solution: "Complex queries take longer — try breaking them down", fallback: "Check your network speed or try again shortly", icon: "🐌" },
  { problem: "Cannot access certain modules", solution: "AI respects your role permissions — ask your admin", fallback: "Request elevated access for the data you need", icon: "🔒" },
  { problem: "Suggested action did not work", solution: "Verify you have permission for that specific action", fallback: "Perform the action manually from the relevant module", icon: "⚠️" },
]);

const OutroScene = makeOutroScene({
  icon: "🤖",
  title: "AI Assistant",
  subtitle: "Your intelligent co-pilot for everything in KDOps",
  upNext: ["Developer Hub"],
});

export const AIAssistant: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Capabilities">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="UseAssistant">
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
