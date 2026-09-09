import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { FRIntroScene } from "./FRIntroScene";
import { FRSubmitRequestScene } from "./FRSubmitRequestScene";
import { FRTrackingStatusScene } from "./FRTrackingStatusScene";
import { FRBankReminderScene } from "./FRBankReminderScene";
import { FRTroubleshootScene } from "./FRTroubleshootScene";
import { FROutroScene } from "./FROutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 720,
        file: "voiceover/18-FuelRequests/intro.mp3"
    },
    {
        startFrame: 705,
        durationFrames: 1470,
        file: "voiceover/18-FuelRequests/submit.mp3"
    },
    {
        startFrame: 2160,
        durationFrames: 1110,
        file: "voiceover/18-FuelRequests/tracking.mp3"
    },
    {
        startFrame: 3255,
        durationFrames: 1140,
        file: "voiceover/18-FuelRequests/bankreminder.mp3"
    },
    {
        startFrame: 4380,
        durationFrames: 870,
        file: "voiceover/18-FuelRequests/troubleshoot.mp3"
    },
    {
        startFrame: 5235,
        durationFrames: 480,
        file: "voiceover/18-FuelRequests/outro.mp3"
    }
];

export const FuelRequests: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={24 * fps} name="Intro">
        <FRIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={49 * fps} name="SubmitRequest">
        <FRSubmitRequestScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={37 * fps} name="TrackingStatus">
        <FRTrackingStatusScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={38 * fps} name="BankReminder">
        <FRBankReminderScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={29 * fps} name="Troubleshooting">
        <FRTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={16 * fps} name="Outro">
        <FROutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
