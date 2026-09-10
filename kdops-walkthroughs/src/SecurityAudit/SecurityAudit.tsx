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
  icon: "🔐",
  title: "Security & Audit",
  subtitle: "Two-factor authentication, session management, IP whitelisting, and audit logs",
  tag: "Module 71 · Security",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Security Dashboard",
  cards: [
    { title: "2FA Enabled", desc: "Staff with 2FA active", icon: "🔑", value: "94%" },
    { title: "Active Sessions", desc: "Currently logged in", icon: "💻", value: "67" },
    { title: "Failed Logins", desc: "Blocked this week", icon: "🚫", value: "12" },
    { title: "IP Whitelist", desc: "Approved IP ranges", icon: "🌐", value: "4" },
    { title: "Audit Events", desc: "Logged this month", icon: "📝", value: "8,340" },
    { title: "Last Breach Attempt", desc: "Days since last alert", icon: "🛡️", value: "45 days" },
  ],
});

const StepsScene = makeStepsScene({
  label: "ENABLE 2FA",
  labelColor: COLORS.accent,
  title: "Setting Up Two-Factor Auth",
  steps: [
    { num: "1", title: "Navigate to Security", desc: "Go to Settings > Security > Two-Factor Authentication" },
    { num: "2", title: "Choose Method", desc: "Select authenticator app, SMS, or email verification" },
    { num: "3", title: "Scan QR Code", desc: "Use Google Authenticator or similar app to scan" },
    { num: "4", title: "Enforce for All", desc: "Enable mandatory 2FA for all staff via admin policy" },
  ],
  formTitle: "Security Policy",
  formFields: [
    { label: "2FA Method", value: "Authenticator App" },
    { label: "Session Timeout", value: "30 minutes" },
    { label: "Max Login Attempts", value: "5" },
    { label: "IP Whitelist", value: "Office + VPN" },
    { label: "Password Expiry", value: "90 days" },
    { label: "Configured By", value: "Chukwuemeka Okafor" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Security Troubleshooting", [
  { problem: "Locked out after failed attempts", solution: "Wait 15 minutes for auto-unlock or ask an admin to reset", fallback: "Use the 'Forgot Password' flow with your registered email", icon: "🔒" },
  { problem: "2FA code not working", solution: "Ensure your device clock is synced — time drift breaks TOTP codes", fallback: "Use backup codes or request an admin to temporarily disable 2FA", icon: "🔑" },
  { problem: "Cannot access from new IP", solution: "Your IP is not on the whitelist — request admin to add it", fallback: "Connect via the company VPN which uses an approved IP range", icon: "🌐" },
  { problem: "Audit log missing entries", solution: "Check the date range filter and ensure the event type is selected", fallback: "Export the full audit log and search within the downloaded file", icon: "📋" },
]);

const OutroScene = makeOutroScene({
  icon: "🔐",
  title: "Security & Audit",
  subtitle: "Protect your organisation's data with confidence",
  upNext: ["Tax Compliance"],
});

export const SecurityAudit: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Enable2FA">
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
