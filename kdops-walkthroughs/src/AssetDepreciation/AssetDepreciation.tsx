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
  icon: "📉",
  title: "Asset Depreciation",
  subtitle: "Module 94 · Depreciation schedules, book value & disposal",
  tag: "Finance · Assets",
});

const CardsSceneComp = makeCardsScene({
  label: "Depreciation at a Glance",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "Total Assets", desc: "Fixed assets currently on the depreciation register", icon: "🏗️", value: "1,247 Assets" },
    { title: "Net Book Value", desc: "Combined net book value of all depreciable assets", icon: "📊", value: "₦892M" },
    { title: "Monthly Charge", desc: "Total depreciation expense for the current month", icon: "📅", value: "₦14.3M" },
    { title: "Fully Depreciated", desc: "Assets that have reached zero book value", icon: "✅", value: "318 Assets" },
    { title: "Pending Disposal", desc: "Assets approved for disposal awaiting write-off", icon: "🗑️", value: "24 Items" },
    { title: "Revaluations", desc: "Asset revaluations processed this financial year", icon: "🔄", value: "15 Done" },
  ],
});

const StepsScene = makeStepsScene({
  label: "Step-by-Step",
  labelColor: COLORS.accent,
  title: "Running Monthly Depreciation",
  steps: [
    { num: 1, title: "Review Register", desc: "Open Assets → Depreciation and confirm all new acquisitions are tagged" },
    { num: 2, title: "Run Calculation", desc: "Execute the monthly depreciation batch using the configured method (straight-line or reducing balance)" },
    { num: 3, title: "Review Journal", desc: "Check the auto-generated journal entries before posting to the general ledger" },
    { num: 4, title: "Post & Report", desc: "Post the journal and generate the depreciation schedule report for Finance" },
  ],
  formTitle: "Depreciation Entry",
  formFields: [
    { label: "Asset", value: "Generator — CAT 500kVA" },
    { label: "Asset Tag", value: "FA-GEN-0042" },
    { label: "Cost", value: "₦45,000,000" },
    { label: "Method", value: "Straight Line" },
    { label: "Useful Life", value: "10 Years" },
    { label: "Monthly Charge", value: "₦375,000" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Asset Depreciation Troubleshooting", [
  { problem: "Depreciation batch shows zero entries", solution: "Confirm that new assets have been assigned a depreciation method and useful life", fallback: "Check the asset register for items with missing category codes and update them", icon: "❌" },
  { problem: "Journal entries not balancing", solution: "Verify the depreciation expense and accumulated depreciation accounts are correctly mapped", fallback: "Run the trial balance check and adjust the account mapping in Settings → Chart of Accounts", icon: "⚖️" },
  { problem: "Disposed asset still depreciating", solution: "Mark the asset as disposed in the register and set the disposal date", fallback: "Reverse the excess depreciation with a manual journal and notify Finance", icon: "🗑️" },
  { problem: "Revaluation not reflecting", solution: "Ensure the revaluation was approved and the new cost basis was saved", fallback: "Re-submit the revaluation request with supporting valuation documents", icon: "🔄" },
]);

const OutroScene = makeOutroScene({
  icon: "📉",
  title: "Asset Depreciation Complete",
  subtitle: "Depreciation schedules, book value and disposal — all in one place",
  upNext: ["Bank Reconciliation"],
});

export const AssetDepreciation: React.FC = () => {
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
