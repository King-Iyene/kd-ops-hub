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
  icon: "📄",
  title: "Document Templates",
  subtitle: "Auto-fill letter templates, offer letters, contracts, and HR documents",
  tag: "Module 65 · Document Templates",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Template Library",
  cards: [
    { title: "Active Templates", desc: "Ready for use", icon: "📝", value: "24" },
    { title: "Offer Letters", desc: "Generated this quarter", icon: "✉️", value: "38" },
    { title: "Contracts", desc: "Auto-filled this month", icon: "📑", value: "15" },
    { title: "Custom Fields", desc: "Merge variables available", icon: "🔤", value: "52" },
    { title: "Approval Rate", desc: "Documents approved first time", icon: "✅", value: "91%" },
    { title: "Avg. Generation", desc: "Time to produce document", icon: "⏱️", value: "8 sec" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE TEMPLATE",
  labelColor: COLORS.accent,
  title: "Building a Template",
  steps: [
    { num: "1", title: "Choose Base", desc: "Select offer letter, contract, or blank template" },
    { num: "2", title: "Add Merge Fields", desc: "Insert employee name, salary, start date placeholders" },
    { num: "3", title: "Set Approval Flow", desc: "Route to HR Manager or MD for sign-off" },
    { num: "4", title: "Generate & Send", desc: "Auto-fill and email or download as PDF" },
  ],
  formTitle: "New Offer Letter",
  formFields: [
    { label: "Template", value: "Standard Offer Letter" },
    { label: "Candidate", value: "Tunde Bakare" },
    { label: "Position", value: "Senior Accountant" },
    { label: "Salary", value: "₦4,800,000/yr" },
    { label: "Start Date", value: "01 Nov 2026" },
    { label: "Approver", value: "Mrs. Folake Adeyemi" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Template Troubleshooting", [
  { problem: "Merge field showing blank", solution: "Verify the employee record has that field populated", fallback: "Manually fill the field before generating the document", icon: "🔤" },
  { problem: "PDF formatting broken", solution: "Check the template for unsupported HTML or fonts", fallback: "Use the built-in PDF preview to adjust layout before sending", icon: "📄" },
  { problem: "Approval stuck in queue", solution: "Confirm the approver has not been deactivated or reassigned", fallback: "Reassign the approval to another authorised manager", icon: "⏳" },
  { problem: "Template not appearing", solution: "Check if the template is published and not in draft status", fallback: "Duplicate an existing template and modify it", icon: "👻" },
]);

const OutroScene = makeOutroScene({
  icon: "📄",
  title: "Document Templates",
  subtitle: "Professional documents in seconds, not hours",
  upNext: ["Org Chart"],
});

export const DocumentTemplates: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateTemplate">
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
