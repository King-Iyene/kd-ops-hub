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
  icon: "🏢",
  title: "Org Chart",
  subtitle: "Visual organisation structure, reporting lines, and department hierarchy",
  tag: "Module 66 · Org Chart",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Organisation Structure",
  cards: [
    { title: "Departments", desc: "Active departments", icon: "🏗️", value: "12" },
    { title: "Reporting Lines", desc: "Manager relationships", icon: "📈", value: "87" },
    { title: "Team Leads", desc: "Direct report managers", icon: "👤", value: "14" },
    { title: "Open Positions", desc: "Vacant roles on chart", icon: "🪑", value: "6" },
    { title: "Hierarchy Levels", desc: "Max depth of chart", icon: "📐", value: "5" },
    { title: "Total Headcount", desc: "Employees on chart", icon: "👥", value: "142" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CONFIGURE CHART",
  labelColor: COLORS.accent,
  title: "Setting Up the Org Chart",
  steps: [
    { num: "1", title: "Define Departments", desc: "Create departments like Finance, Operations, HR" },
    { num: "2", title: "Assign Managers", desc: "Set reporting lines — who reports to whom" },
    { num: "3", title: "Add Positions", desc: "Place roles on the chart including vacant seats" },
    { num: "4", title: "Publish & Share", desc: "Make the chart visible to all staff or specific teams" },
  ],
  formTitle: "New Department",
  formFields: [
    { label: "Department Name", value: "Business Development" },
    { label: "Head of Dept", value: "Emeka Nwosu" },
    { label: "Parent Dept", value: "Executive Office" },
    { label: "Location", value: "Lagos HQ" },
    { label: "Headcount", value: "18" },
    { label: "Cost Centre", value: "CC-BD-001" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Org Chart Troubleshooting", [
  { problem: "Employee missing from chart", solution: "Ensure they have a department and manager assigned", fallback: "Manually add them via the chart editor drag-and-drop", icon: "👤" },
  { problem: "Reporting line incorrect", solution: "Update the employee's manager in their profile settings", fallback: "Use the chart editor to drag the employee under the correct manager", icon: "🔀" },
  { problem: "Chart not loading", solution: "Clear browser cache — large charts may need a moment to render", fallback: "Export as PDF and share the static version", icon: "⏳" },
  { problem: "Vacant role not showing", solution: "Mark the position as 'open' in the department settings", fallback: "Create a placeholder employee labelled 'Vacant' in that role", icon: "🪑" },
]);

const OutroScene = makeOutroScene({
  icon: "🏢",
  title: "Org Chart",
  subtitle: "See your entire organisation at a glance",
  upNext: ["Company Calendar"],
});

export const OrgChart: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ConfigureChart">
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
