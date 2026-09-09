import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { GMIntroScene } from "./GMIntroScene";
import { GMFileGrievanceScene } from "./GMFileGrievanceScene";
import { GMTrackResolutionScene } from "./GMTrackResolutionScene";
import { GMTroubleshootScene } from "./GMTroubleshootScene";
import { GMOutroScene } from "./GMOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 780,
        file: "voiceover/30-GrievanceManagement/intro.mp3"
    },
    {
        startFrame: 765,
        durationFrames: 1500,
        file: "voiceover/30-GrievanceManagement/FileGrievance.mp3"
    },
    {
        startFrame: 2250,
        durationFrames: 1290,
        file: "voiceover/30-GrievanceManagement/TrackResolution.mp3"
    },
    {
        startFrame: 3525,
        durationFrames: 990,
        file: "voiceover/30-GrievanceManagement/troubleshoot.mp3"
    },
    {
        startFrame: 4500,
        durationFrames: 570,
        file: "voiceover/30-GrievanceManagement/outro.mp3"
    }
];

export const GrievanceManagement: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={26 * fps} name="Intro">
        <GMIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={50 * fps} name="FileGrievance">
        <GMFileGrievanceScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={43 * fps} name="TrackResolution">
        <GMTrackResolutionScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={33 * fps} name="Troubleshooting">
        <GMTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Outro">
        <GMOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
