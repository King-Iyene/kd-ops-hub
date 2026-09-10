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
  icon: "📢",
  title: "Communications Hub",
  subtitle: "Broadcast announcements, manage internal comms, and keep everyone informed",
  tag: "Module 52 · Communications",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Internal Communications",
  cards: [
    { title: "Announcements", desc: "Published this month", icon: "📣", value: "14" },
    { title: "Read Rate", desc: "Average across all posts", icon: "📊", value: "87%" },
    { title: "Departments", desc: "With active channels", icon: "🏢", value: "9" },
    { title: "Pinned Notices", desc: "Currently highlighted", icon: "📌", value: "3" },
    { title: "Scheduled Posts", desc: "Queued for this week", icon: "📅", value: "6" },
    { title: "Staff Reach", desc: "Employees notified", icon: "👥", value: "245" },
  ],
});

const StepsScene = makeStepsScene({
  label: "SEND BROADCAST",
  labelColor: COLORS.accent,
  title: "Creating a Broadcast",
  steps: [
    { num: "1", title: "Compose Message", desc: "Write your announcement with rich formatting" },
    { num: "2", title: "Select Audience", desc: "Choose departments, roles, or all staff" },
    { num: "3", title: "Set Priority", desc: "Mark as normal, important, or urgent" },
    { num: "4", title: "Send or Schedule", desc: "Publish immediately or pick a delivery time" },
  ],
  formTitle: "New Announcement",
  formFields: [
    { label: "Subject", value: "Q3 Town Hall — 15 Sept" },
    { label: "Audience", value: "All Staff" },
    { label: "Priority", value: "Important" },
    { label: "Author", value: "Emeka Nwosu (MD)" },
    { label: "Schedule", value: "12 Sept, 9:00 AM" },
    { label: "Channel", value: "Email + In-App" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Communications Troubleshooting", [
  { problem: "Staff did not receive announcement", solution: "Check the audience filter — ensure their role is included", fallback: "Resend to specific individuals from the post menu", icon: "📬" },
  { problem: "Scheduled post not sent", solution: "Verify the scheduled time has not passed without publishing", fallback: "Manually publish and adjust the schedule settings", icon: "⏰" },
  { problem: "Cannot pin announcement", solution: "Only 5 posts can be pinned at once — unpin an older one", fallback: "Ask an admin if pinning is restricted to certain roles", icon: "📌" },
  { problem: "Formatting looks broken", solution: "Switch to the rich-text editor and re-apply formatting", fallback: "Clear formatting and paste as plain text first", icon: "🔧" },
]);

const OutroScene = makeOutroScene({
  icon: "📢",
  title: "Communications Hub",
  subtitle: "Keep your organisation aligned with clear, timely communications",
  upNext: ["Contacts Directory"],
});

export const CommunicationsHub: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="SendBroadcast">
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
