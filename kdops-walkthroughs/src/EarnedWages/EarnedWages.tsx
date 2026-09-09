import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { EWIntroScene } from "./EWIntroScene";
import { EWRequestEWAScene } from "./EWRequestEWAScene";
import { EWTrackEWAScene } from "./EWTrackEWAScene";
import { EWTroubleshootScene } from "./EWTroubleshootScene";
import { EWOutroScene } from "./EWOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 810,
        file: "voiceover/20-EarnedWages/intro.mp3"
    },
    {
        startFrame: 795,
        durationFrames: 1320,
        file: "voiceover/20-EarnedWages/request.mp3"
    },
    {
        startFrame: 2100,
        durationFrames: 1140,
        file: "voiceover/20-EarnedWages/tracking.mp3"
    },
    {
        startFrame: 3225,
        durationFrames: 870,
        file: "voiceover/20-EarnedWages/troubleshoot.mp3"
    },
    {
        startFrame: 4080,
        durationFrames: 510,
        file: "voiceover/20-EarnedWages/outro.mp3"
    }
];

export const EarnedWages: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={27 * fps} name="Intro">
        <EWIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={44 * fps} name="RequestEWA">
        <EWRequestEWAScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={38 * fps} name="TrackEWA">
        <EWTrackEWAScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={29 * fps} name="Troubleshooting">
        <EWTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={17 * fps} name="Outro">
        <EWOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
