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
  icon: "🔔",
  title: "Notifications Center",
  subtitle: "Push notifications, email alerts, and in-app notifications configured your way",
  tag: "Module 68 · Notifications",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Notification Stats",
  cards: [
    { title: "Sent Today", desc: "Notifications dispatched", icon: "📤", value: "234" },
    { title: "Email Alerts", desc: "Sent this week", icon: "✉️", value: "89" },
    { title: "Push Enabled", desc: "Staff with push on", icon: "📱", value: "112" },
    { title: "Unread", desc: "Average per employee", icon: "🔴", value: "4" },
    { title: "Channels", desc: "Active notification types", icon: "📡", value: "6" },
    { title: "Read Rate", desc: "Within 1 hour", icon: "👀", value: "78%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "CONFIGURE ALERTS",
  labelColor: COLORS.accent,
  title: "Setting Up Notifications",
  steps: [
    { num: "1", title: "Choose Channel", desc: "Select push, email, in-app, or SMS delivery" },
    { num: "2", title: "Set Triggers", desc: "Define which events fire a notification" },
    { num: "3", title: "Target Audience", desc: "All staff, specific department, or individual" },
    { num: "4", title: "Test & Activate", desc: "Send a test notification then enable the rule" },
  ],
  formTitle: "New Alert Rule",
  formFields: [
    { label: "Rule Name", value: "Leave Approval Alert" },
    { label: "Trigger", value: "Leave request approved" },
    { label: "Channel", value: "Push + Email" },
    { label: "Recipients", value: "Requesting employee" },
    { label: "Priority", value: "Normal" },
    { label: "Created By", value: "Adaeze Okwu" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Notification Troubleshooting", [
  { problem: "Not receiving push notifications", solution: "Check browser/device notification permissions are enabled", fallback: "Switch to email alerts as a fallback channel", icon: "📱" },
  { problem: "Too many notifications", solution: "Adjust frequency settings in Notification Preferences", fallback: "Mute non-critical channels and enable daily digest mode", icon: "🔕" },
  { problem: "Email alerts going to spam", solution: "Whitelist noreply@ops.kdsquares.com in your email client", fallback: "Use in-app notifications as the primary channel instead", icon: "📧" },
  { problem: "Notification delay", solution: "Check the notification queue status in Admin > System Health", fallback: "Restart the notification service or contact support", icon: "⏰" },
]);

const OutroScene = makeOutroScene({
  icon: "🔔",
  title: "Notifications Center",
  subtitle: "Stay informed without the noise",
  upNext: ["Bulk Operations"],
});

export const NotificationsCenter: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ConfigureAlerts">
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
