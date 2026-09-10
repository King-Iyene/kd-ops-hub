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
  title: "Health & Safety",
  subtitle: "Manage workplace safety, incident reports, and regulatory compliance",
  tag: "Module 85 · Health & Safety",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Safety Dashboard",
  cards: [
    { title: "Days Without Incident", desc: "Current streak", icon: "✅", value: "87" },
    { title: "Open Reports", desc: "Incidents under review", icon: "📋", value: "3" },
    { title: "Safety Drills", desc: "Conducted this quarter", icon: "🚨", value: "2" },
    { title: "NSITF Compliance", desc: "Registration status", icon: "📜", value: "Active" },
    { title: "First Aid Kits", desc: "Stations stocked", icon: "🩹", value: "8" },
    { title: "Training Completed", desc: "Staff with safety cert", icon: "🎓", value: "92%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "REPORT INCIDENT",
  labelColor: COLORS.accent,
  title: "Filing an Incident Report",
  steps: [
    { num: "1", title: "Report Details", desc: "Describe the incident, location, date, and time" },
    { num: "2", title: "Affected Persons", desc: "Identify employees involved and injuries sustained" },
    { num: "3", title: "Attach Evidence", desc: "Upload photos, witness statements, or documents" },
    { num: "4", title: "Submit & Investigate", desc: "Route to the safety officer for investigation" },
  ],
  formTitle: "Incident Report",
  formFields: [
    { label: "Report ID", value: "INC-2026-0034" },
    { label: "Type", value: "Slip & Fall" },
    { label: "Location", value: "Warehouse B, Ikeja" },
    { label: "Date & Time", value: "08 Sep 2026, 2:15 PM" },
    { label: "Severity", value: "Minor" },
    { label: "Reported By", value: "Yusuf Abdullahi" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Health & Safety Troubleshooting", [
  { problem: "Incident report not submitted", solution: "Ensure all required fields are completed", fallback: "Save as draft and complete with the safety officer", icon: "📋" },
  { problem: "NSITF records outdated", solution: "Update employee NSITF details from the compliance page", fallback: "Contact the NSITF liaison to reconcile records", icon: "📜" },
  { problem: "Safety drill not logged", solution: "Record the drill from Health & Safety > Drills > New", fallback: "Upload the drill report as a document attachment", icon: "🚨" },
  { problem: "Compliance certificate expired", solution: "Renew via the regulatory compliance module", fallback: "Contact the relevant authority for renewal steps", icon: "⚠️" },
]);

const OutroScene = makeOutroScene({
  icon: "🛡️",
  title: "Health & Safety",
  subtitle: "Protect your workforce and stay compliant",
  upNext: ["Travel Management"],
});

export const HealthSafety: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ReportIncident">
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
