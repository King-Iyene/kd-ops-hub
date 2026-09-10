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
  icon: "📇",
  title: "Employee Directory",
  subtitle: "Searchable directory, org browser, and contact cards — find anyone in seconds",
  tag: "Module 96 · Employee Directory",
});

const CardsSceneComp = makeCardsScene({
  label: "DIRECTORY",
  labelColor: COLORS.green,
  title: "Directory at a Glance",
  cards: [
    { title: "Total Employees", desc: "Active staff across all branches", icon: "👥", value: "1,247" },
    { title: "Departments", desc: "Distinct departments and units", icon: "🏢", value: "34" },
    { title: "Locations", desc: "Office sites across Nigeria", icon: "📍", value: "12" },
    { title: "New Hires (Month)", desc: "Onboarded in September 2026", icon: "🆕", value: "28" },
    { title: "On Leave", desc: "Currently away from the office", icon: "🏖️", value: "63" },
    { title: "Contact Updates", desc: "Profile changes this quarter", icon: "✏️", value: "189" },
  ],
});

const StepsScene = makeStepsScene({
  label: "SEARCH",
  labelColor: COLORS.accent,
  title: "Looking Up an Employee",
  steps: [
    { num: "1", title: "Open Directory", desc: "Navigate to HR → Employee Directory from the sidebar" },
    { num: "2", title: "Search or Filter", desc: "Type a name, department, or location in the search bar" },
    { num: "3", title: "View Profile Card", desc: "Click an employee to see their contact details and org position" },
    { num: "4", title: "Take Action", desc: "Send a message, view payslips, or update their record" },
  ],
  formTitle: "Employee Lookup",
  formFields: [
    { label: "Employee Name", value: "Chinedu Okafor" },
    { label: "Department", value: "Finance — Accounts Payable" },
    { label: "Location", value: "Lagos HQ, Victoria Island" },
    { label: "Phone", value: "+234 803 456 7890" },
    { label: "Manager", value: "Adaeze Nwankwo" },
    { label: "Employment Date", value: "14 Mar 2022" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Directory Troubleshooting", [
  { problem: "Employee not appearing in search", solution: "Check if their profile has been activated by HR", fallback: "Ask your admin to confirm the employee is not archived", icon: "🔍" },
  { problem: "Contact details are outdated", solution: "Employees can update their own info via My Portal", fallback: "HR can edit the record directly from the admin panel", icon: "📞" },
  { problem: "Org chart not loading", solution: "Ensure reporting lines are set for all employees", fallback: "Clear browser cache and refresh — large org trees need time", icon: "🌳" },
  { problem: "Cannot export directory list", solution: "You need HR Admin or Reports permission to export", fallback: "Request export access from your system administrator", icon: "📥" },
]);

const OutroScene = makeOutroScene({
  icon: "📇",
  title: "Employee Directory",
  subtitle: "Find anyone in your organisation instantly",
  upNext: ["API Integrations"],
});

export const EmployeeDirectory: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Steps">
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
