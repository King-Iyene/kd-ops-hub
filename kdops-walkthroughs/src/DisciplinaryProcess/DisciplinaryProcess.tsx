import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { DPIntroScene } from "./DPIntroScene";
import { DPCreateRecordScene } from "./DPCreateRecordScene";
import { DPResponseThreadScene } from "./DPResponseThreadScene";
import { DPAcknowledgeExpungeScene } from "./DPAcknowledgeExpungeScene";
import { DPTroubleshootScene } from "./DPTroubleshootScene";
import { DPOutroScene } from "./DPOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 300,
        file: "voiceover/28-DisciplinaryProcess/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/28-DisciplinaryProcess/create.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/28-DisciplinaryProcess/response.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 600,
        file: "voiceover/28-DisciplinaryProcess/acknowledge.mp3"
    },
    {
        startFrame: 2040,
        durationFrames: 450,
        file: "voiceover/28-DisciplinaryProcess/troubleshoot.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 300,
        file: "voiceover/28-DisciplinaryProcess/outro.mp3"
    }
];

export const DisciplinaryProcess: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <DPIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="CreateRecord">
        <DPCreateRecordScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="ResponseThread">
        <DPResponseThreadScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="AcknowledgeExpunge">
        <DPAcknowledgeExpungeScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <DPTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <DPOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
