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
  icon: "🏆",
  title: "Employee Recognition",
  subtitle: "Celebrate achievements with awards, kudos, badges, and employee of the month",
  tag: "Module 84 · Recognition",
});

const CardsSceneComp = makeCardsScene({
  label: "OVERVIEW",
  labelColor: COLORS.green,
  title: "Recognition Dashboard",
  cards: [
    { title: "Kudos Sent", desc: "This month", icon: "👏", value: "47" },
    { title: "Awards Given", desc: "This quarter", icon: "🏅", value: "8" },
    { title: "Employee of the Month", desc: "Current winner", icon: "⭐", value: "Bola Ige" },
    { title: "Badges Earned", desc: "Across all staff", icon: "🎖️", value: "126" },
    { title: "Top Department", desc: "Most recognitions", icon: "🏢", value: "Sales" },
    { title: "Participation Rate", desc: "Staff who sent kudos", icon: "📊", value: "68%" },
  ],
});

const StepsScene = makeStepsScene({
  label: "GIVE RECOGNITION",
  labelColor: COLORS.accent,
  title: "Recognising an Employee",
  steps: [
    { num: "1", title: "Select Employee", desc: "Search for the colleague you want to recognise" },
    { num: "2", title: "Choose Type", desc: "Pick kudos, badge, or nominate for an award" },
    { num: "3", title: "Add Message", desc: "Write a personalised recognition message" },
    { num: "4", title: "Submit & Share", desc: "Post to the recognition wall and notify the employee" },
  ],
  formTitle: "New Recognition",
  formFields: [
    { label: "Employee", value: "Adaeze Chukwu" },
    { label: "Type", value: "Kudos" },
    { label: "Category", value: "Teamwork" },
    { label: "Message", value: "Outstanding Q3 delivery!" },
    { label: "Badge", value: "Team Player" },
    { label: "Visibility", value: "Company-wide" },
  ],
});

const TroubleshootScene = makeTroubleshootScene("Recognition Troubleshooting", [
  { problem: "Kudos not showing on wall", solution: "Check if the recognition wall is enabled in settings", fallback: "Post the kudos manually via the announcements page", icon: "👁️" },
  { problem: "Badge not awarded", solution: "Verify the badge criteria are met by the employee", fallback: "Assign the badge manually from the admin panel", icon: "🎖️" },
  { problem: "Nomination not submitted", solution: "Ensure the nomination period is currently open", fallback: "Contact HR to reopen or extend the nomination window", icon: "📝" },
  { problem: "Employee not notified", solution: "Check notification preferences in the employee profile", fallback: "Send a direct message to inform the employee", icon: "🔔" },
]);

const OutroScene = makeOutroScene({
  icon: "🏆",
  title: "Employee Recognition",
  subtitle: "Build a culture of appreciation and motivation",
  upNext: ["Health & Safety"],
});

export const EmployeeRecognition: React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={15 * fps} name="GiveRecognition">
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
