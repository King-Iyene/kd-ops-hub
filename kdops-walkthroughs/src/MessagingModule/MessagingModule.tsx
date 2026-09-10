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
  icon: "💬",
  title: "Messaging",
  subtitle: "Internal chat, direct messages, and group conversations — all in one place",
  tag: "Module 54 · Messaging",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Messaging at a Glance",
  cards: [
    { title: "Active Chats", desc: "Open conversations", icon: "💬", value: "34" },
    { title: "Group Channels", desc: "Team & project groups", icon: "👥", value: "12" },
    { title: "Messages Today", desc: "Across all channels", icon: "📨", value: "487" },
    { title: "Unread", desc: "Your pending messages", icon: "🔔", value: "8" },
    { title: "Files Shared", desc: "This week", icon: "📎", value: "56" },
    { title: "Avg. Response", desc: "Reply time", icon: "⏱️", value: "4 min" },
  ],
});

const StepsScene = makeStepsScene({
  label: "START CONVERSATION",
  labelColor: COLORS.accent,
  title: "Starting a Chat",
  steps: [
    { num: "1", title: "Choose Type", desc: "Select DM, group chat, or project channel" },
    { num: "2", title: "Add Participants", desc: "Search and add team members by name or department" },
    { num: "3", title: "Name the Channel", desc: "Give group chats a descriptive name" },
    { num: "4", title: "Start Messaging", desc: "Send text, files, or voice notes" },
  ],
  formTitle: "New Group Chat",
  formFields: [
    { label: "Channel Name", value: "Lagos Office Updates" },
    { label: "Type", value: "Group Channel" },
    { label: "Members", value: "Chidi, Amara, Tunde" },
    { label: "Description", value: "Daily ops sync" },
    { label: "Notifications", value: "All Messages" },
    { label: "Pin to Sidebar", value: "Yes" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Messaging Troubleshooting", [
  { problem: "Messages not delivering", solution: "Check your internet connection and refresh the page", fallback: "Log out and back in to re-establish the connection", icon: "📡" },
  { problem: "Cannot add someone to a group", solution: "Verify the person is an active employee in the system", fallback: "Ask an admin to check their account status", icon: "🚫" },
  { problem: "File upload failing", solution: "Ensure the file is under the 25 MB limit", fallback: "Compress the file or share via the Documents module", icon: "📎" },
  { problem: "Notifications not working", solution: "Check notification settings in your profile preferences", fallback: "Enable browser notifications in your system settings", icon: "🔕" },
]);

const OutroScene = makeOutroScene({
  icon: "💬",
  title: "Messaging",
  subtitle: "Fast, secure internal communication for your entire team",
  upNext: ["AI Assistant"],
});

export const MessagingModule: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="StartConversation">
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
