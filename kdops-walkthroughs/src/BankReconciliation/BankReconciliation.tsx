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
  icon: "🏦",
  title: "Bank Reconciliation",
  subtitle: "Module 95 · Statement matching, unmatched items & reporting",
  tag: "Finance · Banking",
});

const CardsSceneComp = makeCardsScene({
  label: "Reconciliation at a Glance",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "Bank Accounts", desc: "Active bank accounts linked to the reconciliation module", icon: "🏦", value: "8 Accounts" },
    { title: "Matched Items", desc: "Transactions auto-matched this month", icon: "✅", value: "1,842 Items" },
    { title: "Unmatched", desc: "Transactions requiring manual review", icon: "❓", value: "47 Items" },
    { title: "Reconciled", desc: "Percentage of transactions reconciled for the period", icon: "📊", value: "97.5%" },
    { title: "Statement Balance", desc: "Combined closing balance across all accounts", icon: "💰", value: "₦324M" },
    { title: "Last Import", desc: "Most recent bank statement file imported", icon: "📥", value: "8 Sep 2026" },
  ],
});

const StepsScene = makeStepsScene({
  label: "Step-by-Step",
  labelColor: COLORS.accent,
  title: "Reconciling a Bank Account",
  steps: [
    { num: 1, title: "Import Statement", desc: "Upload the bank statement CSV or connect via direct bank feed" },
    { num: 2, title: "Auto-Match", desc: "Run the matching engine to pair statement lines with ledger entries" },
    { num: 3, title: "Resolve Exceptions", desc: "Review unmatched items and manually match or create adjusting entries" },
    { num: 4, title: "Finalise & Report", desc: "Lock the reconciliation period and generate the bank reconciliation report" },
  ],
  formTitle: "Reconciliation Summary",
  formFields: [
    { label: "Account", value: "GTBank — 0124587932" },
    { label: "Period", value: "August 2026" },
    { label: "Statement Bal.", value: "₦48,230,412" },
    { label: "Ledger Bal.", value: "₦48,187,650" },
    { label: "Variance", value: "₦42,762" },
    { label: "Status", value: "In Progress" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Bank Reconciliation Troubleshooting", [
  { problem: "Statement import fails", solution: "Verify the file format matches the expected template — CSV with headers in row 1", fallback: "Use the manual entry screen to key in transactions if the file cannot be parsed", icon: "📁" },
  { problem: "Auto-match rate is low", solution: "Check that payment references in the ledger match those on the bank statement", fallback: "Adjust the matching rules in Settings → Reconciliation Rules to allow fuzzy matching", icon: "🔍" },
  { problem: "Variance won't clear to zero", solution: "Look for timing differences — cheques issued but not yet presented, or deposits in transit", fallback: "Create a reconciling items schedule and attach it to the period report", icon: "⚖️" },
  { problem: "Period already locked", solution: "Only a Finance Manager can unlock a locked period — request access through the approvals queue", fallback: "Post adjustments in the next open period and reference the locked period", icon: "🔒" },
]);

const OutroScene = makeOutroScene({
  icon: "🏦",
  title: "Bank Reconciliation Complete",
  subtitle: "Statement matching, unmatched items and reporting — all in one place",
  upNext: ["Employee Directory"],
});

export const BankReconciliation: React.FC = () => {
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
