import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { CMIntroScene } from "./CMIntroScene";
import { CMManageCardsScene } from "./CMManageCardsScene";
import { CMCardControlsScene } from "./CMCardControlsScene";
import { CMTroubleshootScene } from "./CMTroubleshootScene";
import { CMOutroScene } from "./CMOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 630,
        file: "voiceover/22-CardsManagement/intro.mp3"
    },
    {
        startFrame: 615,
        durationFrames: 1080,
        file: "voiceover/22-CardsManagement/manage.mp3"
    },
    {
        startFrame: 1680,
        durationFrames: 990,
        file: "voiceover/22-CardsManagement/controls.mp3"
    },
    {
        startFrame: 2655,
        durationFrames: 690,
        file: "voiceover/22-CardsManagement/troubleshoot.mp3"
    },
    {
        startFrame: 3330,
        durationFrames: 420,
        file: "voiceover/22-CardsManagement/outro.mp3"
    }
];

export const CardsManagement: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={21 * fps} name="Intro">
        <CMIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={36 * fps} name="ManageCards">
        <CMManageCardsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={33 * fps} name="CardControls">
        <CMCardControlsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={23 * fps} name="Troubleshooting">
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
