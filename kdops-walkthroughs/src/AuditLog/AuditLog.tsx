import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { makeIntroScene } from "../shared/makeIntroScene";
import { makeStepsScene, makeTableScene } from "../shared/makeContentScene";
import { makeTroubleshootScene } from "../shared/makeTroubleshootScene";
import { makeOutroScene } from "../shared/makeOutroScene";
import { COLORS } from "../WelcomeToKDOps/theme";

const IntroScene = makeIntroScene({
  icon: "🔍",
  title: "Audit Log",
  subtitle: "Every action tracked — who did what, when, and where. Full transparency and compliance",
  tag: "Module 50 · Audit",
});

const TableScene = makeTableScene({
  label: "TRAIL",
  labelColor: COLORS.accent,
  title: "Audit Trail",
  headers: ["Timestamp", "User", "Action", "Module", "Details"],
  rows: [
    ["09 Sep 2026 14:32", "Tunde Bakare", "Updated employee", "HR", "Changed department to Finance"],
    ["09 Sep 2026 14:15", "Ngozi Obi", "Approved expense", "Expenses", "₦450,000 travel claim"],
    ["09 Sep 2026 13:58", "Admin System", "Ran payroll", "Payroll", "September 2026 batch"],
    ["09 Sep 2026 13:40", "Chidi Eze", "Created task", "Tasks", "Q3 budget review"],
    ["09 Sep 2026 13:22", "Amaka Nwosu", "Uploaded document", "Docs", "NDA_template_v3.pdf"],
  ],
});

const StepsScene = makeStepsScene({
  label: "USAGE",
  labelColor: COLORS.green,
  title: "Using the Audit Log",
  steps: [
    { num: "1", title: "Filter by Date", desc: "Narrow down to a specific time range" },
    { num: "2", title: "Filter by User", desc: "See all actions performed by a particular user" },
    { num: "3", title: "Filter by Module", desc: "Focus on a specific module like Payroll or HR" },
    { num: "4", title: "Export for Compliance", desc: "Download the audit trail as CSV for external audits" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Audit Log Troubleshooting", [
  { problem: "Missing entries in the log", solution: "Check the date and module filters are not too restrictive", fallback: "Contact system admin — some actions may need audit enabled", icon: "🔍" },
  { problem: "Wrong timezone on entries", solution: "Update your timezone in Profile Settings", fallback: "The server timezone is WAT (UTC+1) — adjust accordingly", icon: "🕐" },
  { problem: "Too many results to review", solution: "Combine multiple filters to narrow the search", fallback: "Export and use Excel filters for complex analysis", icon: "📊" },
  { problem: "Export timing out", solution: "Reduce the date range to export in smaller batches", fallback: "Request a background export — you’ll get an email when ready", icon: "⏱️" },
]);

const OutroScene = makeOutroScene({
  icon: "🔍",
  title: "Audit Log",
  subtitle: "Complete transparency for every action in your organisation",
  upNext: ["Knowledge Base"],
});

export const AuditLog: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="AuditTrail">
          <TableScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="Usage">
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
