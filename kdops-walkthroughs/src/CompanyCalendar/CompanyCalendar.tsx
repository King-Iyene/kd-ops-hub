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
  title: "Company Calendar",
  subtitle: "Holidays, events, leave calendar, and team scheduling in one place",
  tag: "Module 67 · Company Calendar",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Calendar at a Glance",
  cards: [
    { title: "Public Holidays", desc: "Nigerian holidays this year", icon: "🇳🇬", value: "14" },
    { title: "Company Events", desc: "Scheduled this quarter", icon: "🎉", value: "8" },
    { title: "Leave Requests", desc: "Pending approval", icon: "🏖️", value: "11" },
    { title: "Team Meetings", desc: "Recurring weekly events", icon: "🤝", value: "6" },
    { title: "Training Days", desc: "Upcoming this month", icon: "🎓", value: "3" },
    { title: "Birthdays", desc: "Staff birthdays this month", icon: "🎂", value: "5" },
  ],
});

const StepsScene = makeStepsScene({
  label: "ADD EVENT",
  labelColor: COLORS.accent,
  title: "Creating a Calendar Event",
  steps: [
    { num: "1", title: "Select Date", desc: "Click on the calendar or use the date picker" },
    { num: "2", title: "Event Details", desc: "Enter title, time, location, and description" },
    { num: "3", title: "Set Visibility", desc: "Choose company-wide, department, or private" },
    { num: "4", title: "Notify Staff", desc: "Send calendar invites and push notifications" },
  ],
  formTitle: "New Calendar Event",
  formFields: [
    { label: "Event Title", value: "End of Year Party" },
    { label: "Date", value: "20 Dec 2026" },
    { label: "Time", value: "4:00 PM" },
    { label: "Location", value: "Lagos Office Rooftop" },
    { label: "Visibility", value: "Company-wide" },
    { label: "Created By", value: "Ngozi Ibe" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Calendar Troubleshooting", [
  { problem: "Holiday not showing", solution: "Check the holiday list under Settings > Public Holidays", fallback: "Manually add the holiday as a company-wide event", icon: "🇳🇬" },
  { problem: "Leave overlap not flagged", solution: "Ensure overlap detection is enabled in calendar settings", fallback: "Check the team leave view to spot conflicts manually", icon: "⚠️" },
  { problem: "Event notifications not sent", solution: "Verify notification preferences are enabled for the event type", fallback: "Resend notifications from the event detail page", icon: "🔔" },
  { problem: "Calendar sync issues", solution: "Re-authorise the Google/Outlook calendar integration", fallback: "Export as .ics file and import into the external calendar", icon: "🔄" },
]);

const OutroScene = makeOutroScene({
  icon: "📅",
  title: "Company Calendar",
  subtitle: "Never miss a holiday, event, or team absence",
  upNext: ["Notifications Center"],
});

export const CompanyCalendar: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="AddEvent">
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
