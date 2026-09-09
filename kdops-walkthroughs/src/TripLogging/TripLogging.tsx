import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { TLIntroScene } from "./TLIntroScene";
import { TLLogTripScene } from "./TLLogTripScene";
import { TLTripHistoryScene } from "./TLTripHistoryScene";
import { TLTroubleshootScene } from "./TLTroubleshootScene";
import { TLOutroScene } from "./TLOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 660,
        file: "voiceover/19-TripLogging/intro.mp3"
    },
    {
        startFrame: 645,
        durationFrames: 990,
        file: "voiceover/19-TripLogging/logging.mp3"
    },
    {
        startFrame: 1620,
        durationFrames: 930,
        file: "voiceover/19-TripLogging/history.mp3"
    },
    {
        startFrame: 2535,
        durationFrames: 660,
        file: "voiceover/19-TripLogging/troubleshoot.mp3"
    },
    {
        startFrame: 3180,
        durationFrames: 450,
        file: "voiceover/19-TripLogging/outro.mp3"
    }
];

export const TripLogging: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Intro">
        <TLIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={33 * fps} name="LogTrip">
        <TLLogTripScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={31 * fps} name="TripHistory">
        <TLTripHistoryScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Troubleshooting">
        <TLTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Outro">
        <TLOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
