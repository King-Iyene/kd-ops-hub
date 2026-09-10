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
  icon: "🛡️",
  title: "Roles & Permissions",
  subtitle: "Control who sees what — role-based access, custom roles, and permission matrices",
  tag: "Module 99 · Roles & Permissions",
});

const CardsSceneComp = makeCardsScene({
  label: "ACCESS",
  labelColor: COLORS.green,
  title: "Permission Overview",
  cards: [
    { title: "System Roles", desc: "Built-in roles like Admin, Manager, Staff", icon: "🏷️", value: "8" },
    { title: "Custom Roles", desc: "Organisation-specific roles created", icon: "✨", value: "15" },
    { title: "Users Assigned", desc: "Total users with active role assignments", icon: "👥", value: "1,247" },
    { title: "Permission Groups", desc: "Grouped permissions for easy management", icon: "📦", value: "26" },
    { title: "Pending Reviews", desc: "Role changes awaiting approval", icon: "⏳", value: "9" },
    { title: "Audit Entries", desc: "Permission changes logged this month", icon: "📋", value: "342" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CREATE ROLE",
  labelColor: COLORS.accent,
  title: "Creating a Custom Role",
  steps: [
    { num: "1", title: "Open Role Manager", desc: "Navigate to Settings → Roles & Permissions" },
    { num: "2", title: "Click New Role", desc: "Name the role and add a description for clarity" },
    { num: "3", title: "Assign Permissions", desc: "Toggle modules and actions — view, create, edit, delete" },
    { num: "4", title: "Assign Users", desc: "Add employees to the role and save" },
  ],
  formTitle: "New Custom Role",
  formFields: [
    { label: "Role Name", value: "Regional Finance Lead" },
    { label: "Description", value: "Manages budgets and approvals for a region" },
    { label: "Base Role", value: "Cloned from Finance Manager" },
    { label: "Modules", value: "Payroll, Expenses, Budgets, Reports" },
    { label: "Special Access", value: "Approve payments up to ₦5,000,000" },
    { label: "Users Assigned", value: "Tunde Bakare, Ngozi Obi" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Permissions Troubleshooting", [
  { problem: "User cannot access a module", solution: "Check their role includes the required module permission", fallback: "Assign them to an additional role or upgrade their current one", icon: "🔒" },
  { problem: "Role changes not taking effect", solution: "Ask the user to log out and back in to refresh permissions", fallback: "Clear the session cache from Admin → Active Sessions", icon: "🔄" },
  { problem: "Cannot delete a custom role", solution: "Reassign all users from the role first — roles with users cannot be deleted", fallback: "Archive the role instead if it may be needed later", icon: "🗑️" },
  { problem: "Conflicting permissions between roles", solution: "The most permissive role wins — review all assigned roles", fallback: "Use the Permission Matrix view to spot overlaps and conflicts", icon: "⚠️" },
]);

const OutroScene = makeOutroScene({
  icon: "🛡️",
  title: "Roles & Permissions",
  subtitle: "Right access for the right people — secure and flexible",
  upNext: ["Backup & Recovery"],
});

export const RolePermissions: React.FC = () => {
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
