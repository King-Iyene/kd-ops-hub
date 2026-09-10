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
  icon: "💾",
  title: "Backup & Recovery",
  subtitle: "Automated backups, restore points, and disaster recovery — your data is always safe",
  tag: "Module 100 · Backup & Recovery",
});

const CardsSceneComp = makeCardsScene({
  label: "BACKUP",
  labelColor: COLORS.green,
  title: "Backup Status",
  cards: [
    { title: "Last Backup", desc: "Most recent successful backup", icon: "🕐", value: "2 hrs ago" },
    { title: "Backup Size", desc: "Total size of latest snapshot", icon: "📦", value: "18.4 GB" },
    { title: "Restore Points", desc: "Available snapshots to restore from", icon: "📍", value: "90" },
    { title: "Failed Backups", desc: "Failures in the last 30 days", icon: "❌", value: "1" },
    { title: "Recovery Time", desc: "Estimated time to full restore", icon: "⏱️", value: "~25 min" },
    { title: "Storage Used", desc: "Cloud backup storage consumed", icon: "☁️", value: "412 GB" },
  ],
});

const StepsScene = makeStepsScene({
  label: "RESTORE",
  labelColor: COLORS.accent,
  title: "Restoring from Backup",
  steps: [
    { num: "1", title: "Open Backup Centre", desc: "Go to Settings → Backup & Recovery" },
    { num: "2", title: "Select Restore Point", desc: "Choose the date and time you want to restore to" },
    { num: "3", title: "Choose Scope", desc: "Restore everything or select specific modules and tables" },
    { num: "4", title: "Confirm & Restore", desc: "Review the summary and click Restore — progress is tracked live" },
  ],
  formTitle: "Restore Configuration",
  formFields: [
    { label: "Restore Point", value: "09 Sep 2026 — 02:00 WAT" },
    { label: "Backup Type", value: "Full System Snapshot" },
    { label: "Scope", value: "All Modules — HR, Payroll, Finance" },
    { label: "Est. Duration", value: "~25 minutes" },
    { label: "Initiated By", value: "Emeka Obiora (System Admin)" },
    { label: "Notification", value: "Email + SMS on completion" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Backup Troubleshooting", [
  { problem: "Backup failed overnight", solution: "Check the error log — usually a storage quota or network timeout", fallback: "Trigger a manual backup and monitor for the same error", icon: "❌" },
  { problem: "Restore is taking too long", solution: "Large databases take time — check the progress bar for estimates", fallback: "Restore only the critical modules first, then do the rest", icon: "⏳" },
  { problem: "Missing data after restore", solution: "Ensure you selected the correct restore point with the latest data", fallback: "Check if incremental backups have the missing records", icon: "🔍" },
  { problem: "Storage quota exceeded", solution: "Delete old restore points you no longer need", fallback: "Upgrade your cloud storage plan from Settings → Billing", icon: "💽" },
]);

const OutroScene = makeOutroScene({
  icon: "💾",
  title: "Backup & Recovery",
  subtitle: "Sleep easy — your data is backed up and recoverable",
  upNext: ["Getting Started"],
});

export const BackupRecovery: React.FC = () => {
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
