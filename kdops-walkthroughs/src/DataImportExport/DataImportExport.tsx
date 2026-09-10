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
  icon: "🔄",
  title: "Data Import/Export",
  subtitle: "CSV imports, data migration tools, and flexible export options",
  tag: "Module 75 · Data Import/Export",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Import/Export Activity",
  cards: [
    { title: "Imports Run", desc: "Total this quarter", icon: "📥", value: "56" },
    { title: "Exports Generated", desc: "Downloads this month", icon: "📤", value: "83" },
    { title: "Records Migrated", desc: "From legacy systems", icon: "🔀", value: "12,400" },
    { title: "Supported Formats", desc: "CSV, Excel, JSON, PDF", icon: "📁", value: "4" },
    { title: "Data Integrity", desc: "Validation pass rate", icon: "✅", value: "99.1%" },
    { title: "Scheduled Exports", desc: "Auto-running weekly", icon: "⏰", value: "5" },
  ],
});

const StepsScene = makeStepsScene({
  label: "IMPORT DATA",
  labelColor: COLORS.accent,
  title: "Importing Data into KDOps",
  steps: [
    { num: "1", title: "Prepare File", desc: "Format your data as CSV or Excel with matching headers" },
    { num: "2", title: "Upload & Validate", desc: "Upload the file — the system checks for errors and duplicates" },
    { num: "3", title: "Map Fields", desc: "Match source columns to KDOps fields using the mapper" },
    { num: "4", title: "Import & Verify", desc: "Run the import and review the summary report" },
  ],
  formTitle: "Data Import",
  formFields: [
    { label: "Source", value: "Legacy HR System" },
    { label: "File", value: "employees_export.csv" },
    { label: "Records", value: "342 rows" },
    { label: "Mapped Fields", value: "15 / 15" },
    { label: "Duplicates Found", value: "4 (will skip)" },
    { label: "Imported By", value: "Funke Olawale" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Import/Export Troubleshooting", [
  { problem: "Import rejected at upload", solution: "Check file size (max 10MB) and ensure it is CSV or XLSX format", fallback: "Split the file into smaller batches and import sequentially", icon: "📁" },
  { problem: "Field mapping mismatch", solution: "Rename CSV headers to match KDOps field names exactly", fallback: "Use the manual mapping dropdown to assign each column", icon: "🔗" },
  { problem: "Export missing columns", solution: "Select all required fields in the export configuration before running", fallback: "Use the 'Export All Fields' option and filter in Excel afterwards", icon: "📊" },
  { problem: "Migration data corrupted", solution: "Validate the source data for special characters and encoding issues", fallback: "Run a test migration with 10 records first to identify problems", icon: "⚠️" },
]);

const OutroScene = makeOutroScene({
  icon: "🔄",
  title: "Data Import/Export",
  subtitle: "Move your data in and out of KDOps with ease",
  upNext: ["Flex Tables"],
  isFinal: true,
});

export const DataImportExport: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ImportData">
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
