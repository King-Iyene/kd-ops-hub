import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { PSIntroScene } from "./PSIntroScene";
import { PSCCreateScheduleScene } from "./PSCCreateScheduleScene";
import { PSCManageSchedulesScene } from "./PSCManageSchedulesScene";
import { PSTroubleshootScene } from "./PSTroubleshootScene";
import { PSOutroScene } from "./PSOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 630,
        file: "voiceover/23-PaymentSchedule/intro.mp3"
    },
    {
        startFrame: 615,
        durationFrames: 1020,
        file: "voiceover/23-PaymentSchedule/create.mp3"
    },
    {
        startFrame: 1620,
        durationFrames: 960,
        file: "voiceover/23-PaymentSchedule/manage.mp3"
    },
    {
        startFrame: 2565,
        durationFrames: 600,
        file: "voiceover/23-PaymentSchedule/troubleshoot.mp3"
    },
    {
        startFrame: 3150,
        durationFrames: 420,
        file: "voiceover/23-PaymentSchedule/outro.mp3"
    }
];

export const PaymentSchedule: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={21 * fps} name="Intro">
        <PSIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={34 * fps} name="CreateSchedule">
        <PSCCreateScheduleScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={32 * fps} name="ManageSchedules">
        <PSCManageSchedulesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Troubleshooting">
        <PSTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={14 * fps} name="Outro">
        <PSOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
