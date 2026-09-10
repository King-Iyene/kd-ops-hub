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
  icon: "🙋",
  title: "Employee Self-Service",
  subtitle: "Profile updates, leave requests, payslip downloads — all from one portal",
  tag: "Module 73 · Self-Service Portal",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Self-Service Activity",
  cards: [
    { title: "Profile Updates", desc: "This month by staff", icon: "👤", value: "34" },
    { title: "Leave Requests", desc: "Submitted this week", icon: "🏖️", value: "18" },
    { title: "Payslip Downloads", desc: "This pay period", icon: "📄", value: "126" },
    { title: "Document Requests", desc: "Letters & certificates", icon: "📋", value: "9" },
    { title: "Portal Logins", desc: "Unique logins today", icon: "🔑", value: "87" },
    { title: "Satisfaction", desc: "Portal rating by staff", icon: "⭐", value: "4.6/5" },
  ],
});

const StepsScene = makeStepsScene({
  label: "SUBMIT REQUEST",
  labelColor: COLORS.accent,
  title: "Making a Self-Service Request",
  steps: [
    { num: "1", title: "Log In to Portal", desc: "Access the self-service portal from the dashboard" },
    { num: "2", title: "Choose Request Type", desc: "Leave, document, profile update, or expense claim" },
    { num: "3", title: "Fill Details", desc: "Complete the form with required information and attachments" },
    { num: "4", title: "Submit & Track", desc: "Submit for approval and track status in real time" },
  ],
  formTitle: "Leave Request",
  formFields: [
    { label: "Employee", value: "Amina Yusuf" },
    { label: "Leave Type", value: "Annual Leave" },
    { label: "Start Date", value: "15 Oct 2026" },
    { label: "End Date", value: "22 Oct 2026" },
    { label: "Days", value: "5 working days" },
    { label: "Reliever", value: "Kemi Adebayo" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Self-Service Troubleshooting", [
  { problem: "Cannot update bank details", solution: "Bank detail changes require HR approval — submit a request first", fallback: "Contact HR directly to update sensitive financial information", icon: "🏦" },
  { problem: "Payslip not available", solution: "Payslips are published after payroll is finalised for the period", fallback: "Check with your payroll admin if the pay run has been completed", icon: "📄" },
  { problem: "Leave balance incorrect", solution: "Review leave history for any unapproved or cancelled entries", fallback: "Raise a query to HR with your expected balance calculation", icon: "🔢" },
  { problem: "Request stuck at pending", solution: "Check if the approver is on leave — it may need re-routing", fallback: "Ask your line manager to escalate or reassign the approval", icon: "⏳" },
]);

const OutroScene = makeOutroScene({
  icon: "🙋",
  title: "Employee Self-Service",
  subtitle: "Empower your staff to manage their own HR needs",
  upNext: ["Workflow Automation"],
});

export const EmployeeSelfService: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="SubmitRequest">
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
