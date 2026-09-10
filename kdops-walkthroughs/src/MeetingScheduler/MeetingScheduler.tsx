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
  icon: "📅",
  title: "Meeting Scheduler",
  subtitle: "Schedule meetings, manage agendas, capture minutes, and track action items",
  tag: "Module 83 · Meetings",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Meetings Dashboard",
  cards: [
    { title: "Meetings Today", desc: "Scheduled for today", icon: "🕐", value: "4" },
    { title: "This Week", desc: "Total meetings", icon: "📅", value: "18" },
    { title: "Pending Minutes", desc: "Awaiting upload", icon: "📝", value: "3" },
    { title: "Action Items", desc: "Open and unresolved", icon: "✅", value: "22" },
    { title: "Recurring", desc: "Weekly/monthly meetings", icon: "🔄", value: "6" },
    { title: "Avg Duration", desc: "Minutes per meeting", icon: "⏱️", value: "45 min" },
  ],
});

const StepsScene = makeStepsScene({
  label: "SCHEDULE MEETING",
  labelColor: COLORS.accent,
  title: "Scheduling a Meeting",
  steps: [
    { num: "1", title: "Set Details", desc: "Enter title, date, time, location, and meeting type" },
    { num: "2", title: "Add Participants", desc: "Invite attendees and check calendar availability" },
    { num: "3", title: "Attach Agenda", desc: "Upload or create the meeting agenda" },
    { num: "4", title: "Send Invites", desc: "Notify all participants with calendar invitations" },
  ],
  formTitle: "New Meeting",
  formFields: [
    { label: "Title", value: "Q3 Budget Review" },
    { label: "Date & Time", value: "15 Sep 2026, 10:00 AM" },
    { label: "Location", value: "Boardroom A, Lagos HQ" },
    { label: "Organiser", value: "Funke Adewale" },
    { label: "Participants", value: "8 invited" },
    { label: "Recurrence", value: "Monthly" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Meeting Scheduler Troubleshooting", [
  { problem: "Calendar conflict detected", solution: "Check participant availability before scheduling", fallback: "Propose an alternative time slot to attendees", icon: "⚠️" },
  { problem: "Minutes not saving", solution: "Ensure you have edit permission for the meeting record", fallback: "Save minutes as a document and attach to the meeting", icon: "📝" },
  { problem: "Action items not assigned", solution: "Assign each action item to a participant with a due date", fallback: "Create tasks manually and link to the meeting record", icon: "✅" },
  { problem: "Invite emails not received", solution: "Verify participant email addresses are correct", fallback: "Resend invitations from the meeting detail page", icon: "📧" },
]);

const OutroScene = makeOutroScene({
  icon: "📅",
  title: "Meeting Scheduler",
  subtitle: "Run productive meetings with agendas, minutes, and follow-ups",
  upNext: ["Employee Recognition"],
});

export const MeetingScheduler: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="ScheduleMeeting">
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
