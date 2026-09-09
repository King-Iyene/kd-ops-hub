import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { makeIntroScene } from "../shared/makeIntroScene";
import { makeTableScene, makeStepsScene } from "../shared/makeContentScene";
import { makeTroubleshootScene } from "../shared/makeTroubleshootScene";
import { makeOutroScene } from "../shared/makeOutroScene";
import { COLORS } from "../WelcomeToKDOps/theme";

const IntroScene = makeIntroScene({
  icon: "🖥️",
  title: "Asset Management",
  subtitle:
    "Track every company asset — laptops, phones, vehicles, furniture — from purchase to disposal",
  tag: "Module 43 · Assets",
});

const TableSceneComp = makeTableScene({
  label: "REGISTER",
  labelColor: COLORS.accent,
  title: "Asset Register",
  headers: ["Asset", "Category", "Assigned To", "Location", "Status", "Value"],
  rows: [
    ["MacBook Pro 16\"", "Laptop", "Tunde Bakare", "Lagos HQ", "In Use", "₦1.2M"],
    ["Toyota Hilux", "Vehicle", "Operations Pool", "Abuja Office", "In Use", "₦18.5M"],
    ["HP LaserJet Pro", "Printer", "Shared — Finance", "Lagos HQ", "In Use", "₦380K"],
    ["iPhone 14 Pro", "Phone", "Ngozi Obi", "Lagos HQ", "In Use", "₦650K"],
    ["Samsung 65\" TV", "Display", "Conference Room A", "Lagos HQ", "In Use", "₦420K"],
  ],
});

const StepsScene = makeStepsScene({
  label: "LIFECYCLE",
  labelColor: COLORS.green,
  title: "Managing Assets",
  steps: [
    { num: "1", title: "Register Asset", desc: "Enter asset details, serial number, purchase date, and value" },
    { num: "2", title: "Assign to Employee", desc: "Link the asset to a staff member or shared pool" },
    { num: "3", title: "Schedule Maintenance", desc: "Set up recurring maintenance reminders" },
    { num: "4", title: "Retire / Dispose", desc: "Mark assets as retired when no longer in service" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Asset Troubleshooting", [
  { problem: "Asset not assigned to anyone", solution: "Go to the asset record and click Assign Employee", fallback: "Check if the asset status is set to Available", icon: "👤" },
  { problem: "Missing asset in register", solution: "Search by serial number or tag in the global search", fallback: "Create a new asset entry with all known details", icon: "🔍" },
  { problem: "Depreciation calculation wrong", solution: "Verify the useful life and method in asset settings", fallback: "Recalculate using straight-line or reducing balance", icon: "📉" },
  { problem: "Duplicate serial numbers", solution: "Edit one record to correct the serial number", fallback: "Use the Duplicate Finder in Asset Settings", icon: "🔢" },
]);

const OutroScene = makeOutroScene({
  icon: "🖥️",
  title: "Asset Management",
  subtitle: "Every company asset tracked from purchase to disposal",
  upNext: ["Training & Development"],
});

export const AssetManagement: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Register">
          <TableSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Lifecycle">
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
