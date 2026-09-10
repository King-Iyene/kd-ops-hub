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
  title: "Visitor Management",
  subtitle: "Module 93 · Check-in, badges, pre-registration & visitor logs",
  tag: "Admin · Security",
});

const CardsSceneComp = makeCardsScene({
  label: "Visitors at a Glance",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "Today's Visitors", desc: "Guests checked in at all office locations today", icon: "🚶", value: "34 Visitors" },
    { title: "Pre-Registered", desc: "Visitors pre-registered for appointments this week", icon: "📋", value: "52 Pending" },
    { title: "Badges Issued", desc: "Temporary access badges currently active", icon: "🪪", value: "28 Active" },
    { title: "Avg Visit Time", desc: "Average duration of visitor stays this month", icon: "⏱️", value: "1h 42m" },
    { title: "Locations", desc: "Office sites with visitor management enabled", icon: "📍", value: "5 Sites" },
    { title: "Denied Entry", desc: "Visitor check-ins declined due to policy violations", icon: "🚫", value: "3 This Week" },
  ],
});

const StepsScene = makeStepsScene({
  label: "Step-by-Step",
  labelColor: COLORS.accent,
  title: "Pre-Registering a Visitor",
  steps: [
    { num: 1, title: "Create Invitation", desc: "Enter the visitor's name, company, email and purpose of visit" },
    { num: 2, title: "Set Date & Host", desc: "Choose the visit date, time slot and assign the host employee" },
    { num: 3, title: "Send Notification", desc: "The visitor receives an email with a QR code for quick check-in" },
    { num: 4, title: "Badge & Check-In", desc: "On arrival the visitor scans their QR code and receives a printed badge" },
  ],
  formTitle: "Visitor Registration",
  formFields: [
    { label: "Visitor Name", value: "Mrs. Ngozi Eze" },
    { label: "Company", value: "Sterling Partners Ltd" },
    { label: "Host", value: "Tunde Bakare" },
    { label: "Purpose", value: "Contract Review Meeting" },
    { label: "Visit Date", value: "10 Oct 2026" },
    { label: "Location", value: "Victoria Island HQ" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Visitor Management Troubleshooting", [
  { problem: "QR code not scanning at reception", solution: "Ask the visitor to increase screen brightness or use the manual check-in option", fallback: "Look up the visitor by name in the pre-registration list and check them in manually", icon: "📱" },
  { problem: "Badge printer not responding", solution: "Restart the badge printer and verify the USB connection to the reception kiosk", fallback: "Issue a handwritten temporary badge and log it in the system afterwards", icon: "🖨️" },
  { problem: "Visitor not receiving email invite", solution: "Confirm the email address is correct and check the visitor's spam folder", fallback: "Resend the invitation or share the QR code via WhatsApp", icon: "📧" },
  { problem: "Host not notified of arrival", solution: "Check that the host's notification preferences are enabled in their profile", fallback: "Call or message the host directly from the reception dashboard", icon: "🔔" },
]);

const OutroScene = makeOutroScene({
  icon: "🏢",
  title: "Visitor Management Complete",
  subtitle: "Check-in, badges, pre-registration and visitor logs — all in one place",
  upNext: ["Asset Depreciation"],
});

export const VisitorManagement: React.FC = () => {
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
