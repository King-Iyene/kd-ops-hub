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
  title: "Flex Tables",
  subtitle: "Custom data tables with views, filters, formulas, and dynamic columns",
  tag: "Module 64 · Flex Tables",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Table Capabilities",
  cards: [
    { title: "Active Tables", desc: "Custom tables in use", icon: "📋", value: "18" },
    { title: "Saved Views", desc: "Filtered & sorted presets", icon: "👁️", value: "42" },
    { title: "Custom Columns", desc: "User-defined fields", icon: "🔧", value: "96" },
    { title: "Formula Fields", desc: "Computed columns active", icon: "🧮", value: "23" },
    { title: "Shared Tables", desc: "Cross-department access", icon: "🔗", value: "7" },
    { title: "Records Total", desc: "Across all tables", icon: "💾", value: "14,200" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE TABLE",
  labelColor: COLORS.accent,
  title: "Building a Flex Table",
  steps: [
    { num: "1", title: "Define Columns", desc: "Add text, number, date, dropdown, or formula columns" },
    { num: "2", title: "Import Data", desc: "Paste from Excel or upload a CSV file" },
    { num: "3", title: "Create Views", desc: "Set filters, grouping, and sort order for each view" },
    { num: "4", title: "Share & Permissions", desc: "Grant read or edit access to teams or individuals" },
  ],
  formTitle: "New Flex Table",
  formFields: [
    { label: "Table Name", value: "Staff Allowances" },
    { label: "Department", value: "Finance" },
    { label: "Primary Column", value: "Employee Name" },
    { label: "Default View", value: "All Records" },
    { label: "Row Limit", value: "Unlimited" },
    { label: "Created By", value: "Chidinma Obi" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Flex Tables Troubleshooting", [
  { problem: "Formula returning error", solution: "Check column references and data types match", fallback: "Recreate the formula using the formula builder wizard", icon: "🧮" },
  { problem: "View not showing records", solution: "Review active filters — a filter may be hiding rows", fallback: "Reset all filters and re-apply them one at a time", icon: "👁️" },
  { problem: "Cannot edit shared table", solution: "Confirm you have edit permission, not just view access", fallback: "Request edit access from the table owner", icon: "🔒" },
  { problem: "CSV import failed", solution: "Ensure column headers match and file encoding is UTF-8", fallback: "Use the column mapping tool during import to fix mismatches", icon: "📁" },
]);

const OutroScene = makeOutroScene({
  icon: "📊",
  title: "Flex Tables",
  subtitle: "Organise any data your way — no spreadsheet needed",
  upNext: ["Document Templates"],
});

export const FlexTables: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateTable">
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
