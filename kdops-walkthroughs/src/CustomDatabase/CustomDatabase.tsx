import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { makeIntroScene } from "../shared/makeIntroScene";
import { makeStepsScene, makeTableScene } from "../shared/makeContentScene";
import { makeTroubleshootScene } from "../shared/makeTroubleshootScene";
import { makeOutroScene } from "../shared/makeOutroScene";
import { COLORS } from "../WelcomeToKDOps/theme";

const IntroScene = makeIntroScene({
  icon: "\u{1F5C4}️",
  title: "Custom Databases",
  subtitle:
    "Build Airtable-like databases right inside KDOps — bases, tables, views, and records",
  tag: "Module 38 · Database",
});

const StepsScene = makeStepsScene({
  label: "GETTING STARTED",
  labelColor: COLORS.accent,
  title: "Creating a Base",
  steps: [
    { num: "1", title: "Create Base", desc: "Click New Base to start a fresh database" },
    { num: "2", title: "Name Your Base", desc: "Give it a descriptive name like 'Inventory' or 'CRM'" },
    { num: "3", title: "Add Tables", desc: "Create tables to organise your data by category" },
    { num: "4", title: "Define Fields", desc: "Add columns with the right field types for your data" },
  ],
});

const TableSceneComp = makeTableScene({
  label: "FIELD REFERENCE",
  labelColor: COLORS.gold,
  title: "Field Types",
  headers: ["Type", "Description", "Example"],
  rows: [
    ["Text", "Plain text input", "Adewale Fashola"],
    ["Number", "Numeric values", "45,000"],
    ["Email", "Email addresses", "adewale@kdsquares.com"],
    ["URL", "Web links", "https://ops.kdsquares.com"],
    ["Date", "Date picker", "15 Sep 2026"],
    ["Select", "Single choice dropdown", "Active"],
    ["Multi-select", "Multiple choices", "Lagos, Abuja"],
    ["Checkbox", "True/false toggle", "✓"],
    ["Attachment", "File uploads", "contract.pdf"],
    ["Formula", "Calculated fields", "=Price × Qty"],
  ],
});

const TroubleshootScene = makeTroubleshootScene("Database Troubleshooting", [
  { problem: "Field type mismatch when importing", solution: "Ensure CSV column types match your field definitions", fallback: "Re-create the field with the correct type", icon: "⚠️" },
  { problem: "Duplicate records appearing", solution: "Use the de-duplicate tool under Table Settings", fallback: "Export, clean in Excel, and re-import", icon: "📋" },
  { problem: "API auto-create fields not working", solution: "Enable 'Auto-create fields' in base settings", fallback: "Manually create fields before API calls", icon: "🔌" },
  { problem: "View not showing expected data", solution: "Check your filter and sort conditions", fallback: "Reset the view to default and reapply filters", icon: "👁️" },
]);

const OutroScene = makeOutroScene({
  icon: "\u{1F5C4}️",
  title: "Custom Databases",
  subtitle: "You can now build and manage custom databases in KDOps",
  upNext: ["Finance Dashboard"],
});

export const CustomDatabase: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Steps">
          <StepsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="FieldTypes">
          <TableSceneComp />
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
