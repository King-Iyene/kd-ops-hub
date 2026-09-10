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
  icon: "🤝",
  title: "Referrals",
  subtitle: "Employee referral program — submit candidates, earn bonuses, track progress",
  tag: "Module 61 · Referrals",
});

const CardsSceneComp = makeCardsScene({
  label: "PROGRAM STATS",
  labelColor: COLORS.green,
  title: "Referral Overview",
  cards: [
    { title: "Total Referrals", desc: "Submitted this year", icon: "📨", value: "67" },
    { title: "Hired", desc: "Successfully placed", icon: "✅", value: "14" },
    { title: "In Progress", desc: "Under review", icon: "🔄", value: "9" },
    { title: "Bonuses Paid", desc: "Total rewards", icon: "💰", value: "₦4.2M" },
    { title: "Top Referrer", desc: "Most submissions", icon: "🏆", value: "Bola Adekunle" },
    { title: "Avg. Time to Hire", desc: "From referral to offer", icon: "⏱️", value: "22 days" },
  ],
});

const StepsScene = makeStepsScene({
  label: "SUBMIT REFERRAL",
  labelColor: COLORS.accent,
  title: "Referring a Candidate",
  steps: [
    { num: "1", title: "Choose Position", desc: "Select from open roles eligible for referral" },
    { num: "2", title: "Enter Candidate Info", desc: "Provide name, email, phone, and upload CV" },
    { num: "3", title: "Add Notes", desc: "Describe how you know them and why they fit" },
    { num: "4", title: "Submit & Track", desc: "Submit the referral and follow its progress" },
  ],
  formTitle: "New Referral",
  formFields: [
    { label: "Candidate Name", value: "Chiamaka Obi" },
    { label: "Position", value: "Senior Accountant" },
    { label: "Email", value: "chiamaka@email.com" },
    { label: "Phone", value: "+234 812 345 6789" },
    { label: "Relationship", value: "Former colleague" },
    { label: "CV Attached", value: "chiamaka_cv.pdf" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Referrals Troubleshooting", [
  { problem: "Cannot find the open position", solution: "Check with HR — the role may not be referral-eligible", fallback: "Contact your recruiter to add the role to the program", icon: "🔍" },
  { problem: "Referral bonus not received", solution: "Bonuses are paid after the hire completes probation", fallback: "Check the bonus timeline in the Referral Policy page", icon: "💰" },
  { problem: "Duplicate referral warning", solution: "Another employee already referred this candidate", fallback: "Contact HR to verify who submitted first", icon: "⚠️" },
  { problem: "Status stuck on 'Under Review'", solution: "The hiring team may still be evaluating", fallback: "Ask the recruiter for an update on your referral", icon: "🔄" },
]);

const OutroScene = makeOutroScene({
  icon: "🤝",
  title: "Referrals",
  subtitle: "Help grow the team and earn rewards for great referrals",
  upNext: ["Placements Module"],
});

export const ReferralsModule: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ProgramStats">
          <CardsSceneComp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="SubmitReferral">
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
