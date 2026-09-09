import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { CMIntroScene } from "./CMIntroScene";
import { CLMAddClientScene } from "./CLMAddClientScene";
import { CLMClientProfileScene } from "./CLMClientProfileScene";
import { CMTroubleshootScene } from "./CMTroubleshootScene";
import { CMOutroScene } from "./CMOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 480,
        file: "voiceover/36-ClientsManagement/intro.mp3"
    },
    {
        startFrame: 465,
        durationFrames: 450,
        file: "voiceover/36-ClientsManagement/AddClient.mp3"
    },
    {
        startFrame: 900,
        durationFrames: 510,
        file: "voiceover/36-ClientsManagement/ClientProfile.mp3"
    },
    {
        startFrame: 1395,
        durationFrames: 450,
        file: "voiceover/36-ClientsManagement/troubleshoot.mp3"
    },
    {
        startFrame: 1830,
        durationFrames: 420,
        file: "voiceover/36-ClientsManagement/outro.mp3"
    }
];

export const ClientsManagement: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={16 * fps} name="Intro">
        <CMIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="AddClient">
        <CLMAddClientScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={17 * fps} name="ClientProfile">
        <CLMClientProfileScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <CMTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={14 * fps} name="Outro">
        <CMOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
