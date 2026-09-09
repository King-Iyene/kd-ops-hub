import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { HRLIntroScene } from "./HRLIntroScene";
import { HLCreateLetterScene } from "./HLCreateLetterScene";
import { HLESignatureScene } from "./HLESignatureScene";
import { HRLTroubleshootScene } from "./HRLTroubleshootScene";
import { HRLOutroScene } from "./HRLOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 750,
        file: "voiceover/29-HRLettersModule/intro.mp3"
    },
    {
        startFrame: 735,
        durationFrames: 1440,
        file: "voiceover/29-HRLettersModule/CreateLetter.mp3"
    },
    {
        startFrame: 2160,
        durationFrames: 1230,
        file: "voiceover/29-HRLettersModule/ESignature.mp3"
    },
    {
        startFrame: 3375,
        durationFrames: 960,
        file: "voiceover/29-HRLettersModule/troubleshoot.mp3"
    },
    {
        startFrame: 4320,
        durationFrames: 570,
        file: "voiceover/29-HRLettersModule/outro.mp3"
    }
];

export const HRLettersModule: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={25 * fps} name="Intro">
        <HRLIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={48 * fps} name="CreateLetter">
        <HLCreateLetterScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={41 * fps} name="ESignature">
        <HLESignatureScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={32 * fps} name="Troubleshooting">
        <HRLTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Outro">
        <HRLOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
