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
  title: "Insurance",
  subtitle: "Module 89 · HMO enrolment, group life cover & claims tracking",
  tag: "HR · Benefits",
});

const CardsSceneComp = makeCardsScene({
  label: "Insurance at a Glance",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "HMO Plans", desc: "Active health-maintenance plans across all tiers", icon: "🏥", value: "4 Plans" },
    { title: "Group Life", desc: "Group life-assurance cover for enrolled staff", icon: "🛡️", value: "₦85M Cover" },
    { title: "Active Claims", desc: "Claims currently being processed by the HMO", icon: "📋", value: "27 Claims" },
    { title: "Enrolled Staff", desc: "Employees registered on at least one plan", icon: "👥", value: "312 Staff" },
    { title: "Premium Cost", desc: "Total monthly premium paid to underwriters", icon: "💰", value: "₦4.2M/mo" },
    { title: "Claim Payouts", desc: "Total claims settled year-to-date", icon: "✅", value: "₦18.6M YTD" },
  ],
});

const StepsScene = makeStepsScene({
  label: "Step-by-Step",
  labelColor: COLORS.accent,
  title: "Creating an Insurance Enrolment",
  steps: [
    { num: 1, title: "Select Employee", desc: "Search by name or staff ID and confirm their NHIA number" },
    { num: 2, title: "Choose Plan", desc: "Pick an HMO tier and add dependants if applicable" },
    { num: 3, title: "Upload Documents", desc: "Attach passport photos and proof-of-identity for each enrollee" },
    { num: 4, title: "Submit for Approval", desc: "Route the enrolment request to HR and Finance for sign-off" },
  ],
  formTitle: "Enrolment Form",
  formFields: [
    { label: "Employee", value: "Adaeze Okonkwo" },
    { label: "Staff ID", value: "KD-4071" },
    { label: "NHIA Number", value: "NHIA-209831" },
    { label: "HMO Plan", value: "Tier 2 – Family" },
    { label: "Dependants", value: "3" },
    { label: "Effective Date", value: "01 Oct 2026" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Insurance Troubleshooting", [
  { problem: "Enrolment rejected by HMO", solution: "Verify the NHIA number and dependant details match the provider's records", fallback: "Contact the HMO liaison desk for manual verification", icon: "❌" },
  { problem: "Claim stuck in processing", solution: "Check the claim status in the Insurance module and re-submit supporting documents", fallback: "Escalate to HR Benefits with the claim reference number", icon: "⏳" },
  { problem: "Premium deduction mismatch", solution: "Compare the payroll deduction against the plan schedule in Settings → Insurance Tiers", fallback: "Run a reconciliation report and forward variances to Finance", icon: "💸" },
  { problem: "Dependant not showing on plan", solution: "Ensure the dependant was added before the monthly cut-off date", fallback: "Submit a mid-cycle addition request through HR", icon: "👤" },
]);

const OutroScene = makeOutroScene({
  icon: "🛡️",
  title: "Insurance Module Complete",
  subtitle: "HMO enrolments, group life cover and claims — all in one place",
  upNext: ["Gratuity"],
});

export const InsuranceModule: React.FC = () => {
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
