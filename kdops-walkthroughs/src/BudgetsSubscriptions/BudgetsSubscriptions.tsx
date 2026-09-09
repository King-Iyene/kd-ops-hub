import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { BSIntroScene } from "./BSIntroScene";
import { BSBudgetOverviewScene } from "./BSBudgetOverviewScene";
import { BSCreateBudgetScene } from "./BSCreateBudgetScene";
import { BSSubscriptionTrackerScene } from "./BSSubscriptionTrackerScene";
import { BSTroubleshootScene } from "./BSTroubleshootScene";
import { BSOutroScene } from "./BSOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 270,
        file: "voiceover/10-BudgetsSubscriptions/intro.mp3"
    },
    {
        startFrame: 255,
        durationFrames: 540,
        file: "voiceover/10-BudgetsSubscriptions/overview.mp3"
    },
    {
        startFrame: 780,
        durationFrames: 600,
        file: "voiceover/10-BudgetsSubscriptions/create.mp3"
    },
    {
        startFrame: 1365,
        durationFrames: 570,
        file: "voiceover/10-BudgetsSubscriptions/subscriptions.mp3"
    },
    {
        startFrame: 1920,
        durationFrames: 630,
        file: "voiceover/10-BudgetsSubscriptions/troubleshoot.mp3"
    },
    {
        startFrame: 2535,
        durationFrames: 300,
        file: "voiceover/10-BudgetsSubscriptions/outro.mp3"
    }
];

export const BudgetsSubscriptions: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={9 * fps} name="Intro">
        <BSIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Budget Overview — 8s */}
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="BudgetOverview">
        <BSBudgetOverviewScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Create Budget — 8s */}
      <TransitionSeries.Sequence durationInFrames={20 * fps} name="CreateBudget">
        <BSCreateBudgetScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Subscription Tracker — 8s */}
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="SubscriptionTracker">
        <BSSubscriptionTrackerScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={21 * fps} name="Troubleshooting">
        <BSTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <BSOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
