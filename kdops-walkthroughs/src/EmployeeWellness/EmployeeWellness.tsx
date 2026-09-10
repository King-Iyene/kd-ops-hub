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
  icon: "🧘",
  title: "Wellness",
  subtitle: "Module 91 · Wellness programs, health checks & mental health resources",
  tag: "HR · People",
});

const CardsSceneComp = makeCardsScene({
  label: "Wellness at a Glance",
  labelColor: COLORS.green,
  title: "Key Metrics",
  cards: [
    { title: "Active Programs", desc: "Wellness initiatives currently running company-wide", icon: "🏃", value: "6 Programs" },
    { title: "Health Checks", desc: "Annual medical screenings completed this cycle", icon: "🩺", value: "278 Done" },
    { title: "Participation", desc: "Employees enrolled in at least one wellness program", icon: "👥", value: "74%" },
    { title: "Mental Health", desc: "Counselling sessions booked through the EAP provider", icon: "🧠", value: "43 Sessions" },
    { title: "Gym Subsidy", desc: "Monthly fitness allowance utilised across the workforce", icon: "💪", value: "₦1.8M/mo" },
    { title: "Satisfaction", desc: "Average wellness programme satisfaction rating", icon: "⭐", value: "4.6 / 5" },
  ],
});

const StepsScene = makeStepsScene({
  label: "Step-by-Step",
  labelColor: COLORS.accent,
  title: "Enrolling in a Wellness Program",
  steps: [
    { num: 1, title: "Browse Programs", desc: "View available wellness initiatives in the Wellness hub dashboard" },
    { num: 2, title: "Select & Register", desc: "Choose a programme and complete the registration form with your details" },
    { num: 3, title: "Book Health Check", desc: "Schedule your annual medical screening at a partner clinic" },
    { num: 4, title: "Track Progress", desc: "Monitor your wellness goals and participation history in your profile" },
  ],
  formTitle: "Wellness Enrolment",
  formFields: [
    { label: "Employee", value: "Folake Adeyemi" },
    { label: "Staff ID", value: "KD-3302" },
    { label: "Programme", value: "Fitness & Nutrition" },
    { label: "Health Check", value: "12 Nov 2026" },
    { label: "EAP Access", value: "Enabled" },
    { label: "Gym Partner", value: "BodyFit Lagos" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Wellness Troubleshooting", [
  { problem: "Cannot book a health check slot", solution: "Check the available dates in the clinic calendar — slots refresh every Monday", fallback: "Contact HR Wellness to request an off-cycle appointment with the partner clinic", icon: "📅" },
  { problem: "EAP counselling link not working", solution: "Clear your browser cache and use the direct link from the Wellness module dashboard", fallback: "Request a new access code from HR — the current one may have expired", icon: "🔗" },
  { problem: "Gym subsidy not reflecting on payslip", solution: "Verify your gym membership receipt was uploaded before the payroll cut-off date", fallback: "Submit a reimbursement request through Expenses with the gym receipt attached", icon: "💰" },
  { problem: "Programme not visible in dashboard", solution: "Confirm your department is included in the programme's eligibility settings", fallback: "Ask your line manager to request access from the Wellness coordinator", icon: "👁️" },
]);

const OutroScene = makeOutroScene({
  icon: "🧘",
  title: "Wellness Module Complete",
  subtitle: "Wellness programs, health checks and mental health resources — all in one place",
  upNext: ["Vehicle Tracking"],
});

export const EmployeeWellness: React.FC = () => {
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
