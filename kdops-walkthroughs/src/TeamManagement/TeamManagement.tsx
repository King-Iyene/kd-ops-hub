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
  icon: "👥",
  title: "Team Management",
  subtitle: "Organise teams, assign leads, and manage departmental structures",
  tag: "Module 79 · Team Management",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Team Dashboard",
  cards: [
    { title: "Active Teams", desc: "Across the organisation", icon: "🏢", value: "15" },
    { title: "Total Members", desc: "Assigned to teams", icon: "👤", value: "142" },
    { title: "Team Leads", desc: "Currently assigned", icon: "⭐", value: "15" },
    { title: "Departments", desc: "With active teams", icon: "🗂️", value: "7" },
    { title: "Unassigned Staff", desc: "Not in any team", icon: "⚠️", value: "8" },
    { title: "Avg Team Size", desc: "Members per team", icon: "📊", value: "9" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE TEAM",
  labelColor: COLORS.accent,
  title: "Setting Up a New Team",
  steps: [
    { num: "1", title: "Team Details", desc: "Enter team name, department, and description" },
    { num: "2", title: "Assign Team Lead", desc: "Select a team lead from the employee directory" },
    { num: "3", title: "Add Members", desc: "Search and add employees to the team roster" },
    { num: "4", title: "Activate Team", desc: "Publish the team and notify all members" },
  ],
  formTitle: "New Team",
  formFields: [
    { label: "Team Name", value: "Product Engineering" },
    { label: "Department", value: "Technology" },
    { label: "Team Lead", value: "Tunde Bakare" },
    { label: "Members", value: "12 selected" },
    { label: "Location", value: "Lagos HQ" },
    { label: "Status", value: "Active" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Team Management Troubleshooting", [
  { problem: "Employee in multiple teams", solution: "Check if dual assignment is allowed in org settings", fallback: "Remove the employee from the incorrect team manually", icon: "👥" },
  { problem: "Team lead cannot approve", solution: "Verify the lead has the Team Lead role assigned", fallback: "Assign the role from the User Management page", icon: "🔑" },
  { problem: "Department not showing", solution: "Ensure the department is active in the org structure", fallback: "Create the department first, then assign the team", icon: "🏢" },
  { problem: "Member count mismatch", solution: "Sync the team roster from the employee directory", fallback: "Remove and re-add members to refresh the count", icon: "🔄" },
]);

const OutroScene = makeOutroScene({
  icon: "👥",
  title: "Team Management",
  subtitle: "Build effective teams with clear structure and leadership",
  upNext: ["Project Tracking"],
});

export const TeamManagement: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="CreateTeam">
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
