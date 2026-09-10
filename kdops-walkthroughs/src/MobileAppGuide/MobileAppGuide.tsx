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
  icon: "📱",
  title: "Mobile App",
  subtitle: "Access KDOps on iOS and Android — approvals, payslips, and notifications on the go",
  tag: "Module 98 · Mobile App",
});

const CardsSceneComp = makeCardsScene({
  label: "MOBILE",
  labelColor: COLORS.green,
  title: "Mobile App Stats",
  cards: [
    { title: "Downloads", desc: "Total app installs across platforms", icon: "⬇️", value: "3,840" },
    { title: "Active Users", desc: "Monthly active mobile users", icon: "👤", value: "1,102" },
    { title: "Push Enabled", desc: "Users receiving push notifications", icon: "🔔", value: "924" },
    { title: "Avg Session", desc: "Average time per mobile session", icon: "⏱️", value: "4.2 min" },
    { title: "Offline Syncs", desc: "Pending syncs from offline mode", icon: "📴", value: "56" },
    { title: "App Rating", desc: "Average rating on app stores", icon: "⭐", value: "4.6" },
  ],
});

const StepsScene = makeStepsScene({
  label: "SETUP",
  labelColor: COLORS.accent,
  title: "Setting Up the Mobile App",
  steps: [
    { num: "1", title: "Download the App", desc: "Search 'KDOps' on the App Store or Google Play" },
    { num: "2", title: "Sign In", desc: "Use your KDOps credentials — SSO is supported" },
    { num: "3", title: "Enable Notifications", desc: "Allow push notifications for approvals and alerts" },
    { num: "4", title: "Set Up Biometrics", desc: "Enable fingerprint or Face ID for quick secure access" },
  ],
  formTitle: "Mobile Settings",
  formFields: [
    { label: "Device", value: "Samsung Galaxy S24 — Android 15" },
    { label: "App Version", value: "v3.8.1 (latest)" },
    { label: "Push Notifications", value: "Enabled — Approvals, Payroll" },
    { label: "Biometric Login", value: "Fingerprint enabled" },
    { label: "Offline Mode", value: "Active — syncs every 15 min" },
    { label: "Data Usage", value: "142 MB this month" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Mobile App Troubleshooting", [
  { problem: "App crashes on launch", solution: "Update to the latest version from your app store", fallback: "Clear app cache in device settings and reinstall", icon: "💥" },
  { problem: "Push notifications not arriving", solution: "Check notification permissions in your device settings", fallback: "Ensure 'Do Not Disturb' is off and battery saver is disabled", icon: "🔕" },
  { problem: "Offline data not syncing", solution: "Connect to stable Wi-Fi and open the app to trigger sync", fallback: "Force sync from Settings → Data → Sync Now in the app", icon: "📴" },
  { problem: "Biometric login failing", solution: "Re-register your fingerprint or face in the app settings", fallback: "Fall back to PIN or password login and re-enable biometrics", icon: "👆" },
]);

const OutroScene = makeOutroScene({
  icon: "📱",
  title: "Mobile App",
  subtitle: "KDOps in your pocket — approve, review, and stay informed anywhere",
  upNext: ["Roles & Permissions"],
});

export const MobileAppGuide: React.FC = () => {
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
