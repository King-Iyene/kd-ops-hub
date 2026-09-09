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
        durationFrames: 300,
        file: "voiceover/30-GrievanceManagement/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/30-GrievanceManagement/file.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/30-GrievanceManagement/resolution.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 450,
        file: "voiceover/30-GrievanceManagement/troubleshoot.mp3"
    },
    {
        startFrame: 1890,
        durationFrames: 300,
        file: "voiceover/30-GrievanceManagement/outro.mp3"
    }
];

export const GrievanceManagement: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <GMIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="FileGrievance">
        <GMFileGrievanceScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="TrackResolution">
        <GMTrackResolutionScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <GMTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <GMOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
