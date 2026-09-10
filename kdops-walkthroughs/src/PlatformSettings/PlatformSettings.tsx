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
  icon: "⚙️",
  title: "Platform Settings",
  subtitle: "Configure organisation settings, roles, permissions, and preferences",
  tag: "Module 57 · Settings",
});

const CardsSceneComp = makeCardsScene({
  label: "CONFIGURATION",
  labelColor: COLORS.green,
  title: "Settings Overview",
  cards: [
    { title: "Custom Roles", desc: "Defined in the system", icon: "🎭", value: "8" },
    { title: "Permission Sets", desc: "Active permission groups", icon: "🔐", value: "14" },
    { title: "Departments", desc: "Configured units", icon: "🏢", value: "11" },
    { title: "Approval Chains", desc: "Active workflows", icon: "✅", value: "6" },
    { title: "Audit Logs", desc: "Entries this month", icon: "📋", value: "3,240" },
    { title: "Active Users", desc: "Licensed seats in use", icon: "👥", value: "187" },
  ],
});

const StepsScene = makeStepsScene({
  label: "MANAGE ROLES",
  labelColor: COLORS.accent,
  title: "Creating a Custom Role",
  steps: [
    { num: "1", title: "Name the Role", desc: "e.g. 'Regional Manager' or 'Finance Approver'" },
    { num: "2", title: "Assign Permissions", desc: "Toggle access for each module and action" },
    { num: "3", title: "Set Hierarchy", desc: "Define reporting lines and approval authority" },
    { num: "4", title: "Apply to Users", desc: "Assign the role to one or more employees" },
  ],
  formTitle: "New Role",
  formFields: [
    { label: "Role Name", value: "Regional Manager" },
    { label: "Base Template", value: "Manager" },
    { label: "Modules", value: "All except Developer Hub" },
    { label: "Approval Limit", value: "₦5,000,000" },
    { label: "Reports To", value: "Director" },
    { label: "Users Assigned", value: "4" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Settings Troubleshooting", [
  { problem: "User cannot access a module", solution: "Check their role permissions under Settings > Roles", fallback: "Assign them to a role that includes that module", icon: "🔐" },
  { problem: "Approval chain not triggering", solution: "Verify the chain is linked to the correct module action", fallback: "Re-create the chain and test with a sample request", icon: "✅" },
  { problem: "Audit log seems incomplete", solution: "Logs update every few minutes — wait and refresh", fallback: "Export the full log to check for the missing entry", icon: "📋" },
  { problem: "Cannot delete a department", solution: "Move all employees out of the department first", fallback: "Archive the department instead of deleting", icon: "🏢" },
]);

const OutroScene = makeOutroScene({
  icon: "⚙️",
  title: "Platform Settings",
  subtitle: "Fine-tune every aspect of your KDOps environment",
  upNext: ["Platform Guide"],
});

export const PlatformSettings: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Configuration">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ManageRoles">
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
