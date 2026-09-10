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
  icon: "⚡",
  title: "Bulk Operations",
  subtitle: "Mass imports, bulk updates, and CSV processing for large-scale changes",
  tag: "Module 69 · Bulk Operations",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Bulk Processing Stats",
  cards: [
    { title: "Records Imported", desc: "This month via CSV", icon: "📥", value: "3,450" },
    { title: "Bulk Updates", desc: "Mass edits completed", icon: "✏️", value: "27" },
    { title: "Success Rate", desc: "Records processed clean", icon: "✅", value: "98.2%" },
    { title: "Failed Rows", desc: "Errors caught & logged", icon: "⚠️", value: "62" },
    { title: "Templates", desc: "Import templates saved", icon: "📋", value: "9" },
    { title: "Avg. Speed", desc: "Records per second", icon: "🚀", value: "150" },
  ],
});

const StepsScene = makeStepsScene({
  label: "BULK IMPORT",
  labelColor: COLORS.accent,
  title: "Running a Bulk Import",
  steps: [
    { num: "1", title: "Download Template", desc: "Get the CSV template with required column headers" },
    { num: "2", title: "Fill & Upload", desc: "Populate the template and upload the CSV file" },
    { num: "3", title: "Map Columns", desc: "Match CSV columns to KDOps fields" },
    { num: "4", title: "Review & Execute", desc: "Preview changes, fix errors, then run the import" },
  ],
  formTitle: "Bulk Import Job",
  formFields: [
    { label: "Import Type", value: "Employee Records" },
    { label: "File", value: "staff_q3_update.csv" },
    { label: "Total Rows", value: "245" },
    { label: "Matched Columns", value: "12 / 12" },
    { label: "Errors Found", value: "3 (fixable)" },
    { label: "Initiated By", value: "Bola Adesanya" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Bulk Operations Troubleshooting", [
  { problem: "Import failing at validation", solution: "Check for required fields — employee ID and name cannot be blank", fallback: "Download the error report and fix flagged rows before re-uploading", icon: "🚫" },
  { problem: "Duplicate records created", solution: "Enable 'match by employee ID' to update existing records", fallback: "Use the bulk delete tool to remove duplicates, then re-import", icon: "👯" },
  { problem: "CSV encoding issues", solution: "Save the file as UTF-8 (without BOM) in Excel or Google Sheets", fallback: "Copy data into the provided template which is already UTF-8", icon: "🔤" },
  { problem: "Bulk update too slow", solution: "Split large files into batches of 500 rows or fewer", fallback: "Schedule the import for off-peak hours via the job scheduler", icon: "🐢" },
]);

const OutroScene = makeOutroScene({
  icon: "⚡",
  title: "Bulk Operations",
  subtitle: "Update thousands of records in minutes, not days",
  upNext: ["Reports & Analytics"],
});

export const BulkOperations: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="BulkImport">
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
