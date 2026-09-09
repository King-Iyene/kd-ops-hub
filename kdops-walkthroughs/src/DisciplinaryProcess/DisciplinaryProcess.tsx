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
        durationFrames: 810,
        file: "voiceover/28-DisciplinaryProcess/intro.mp3"
    },
    {
        startFrame: 795,
        durationFrames: 1530,
        file: "voiceover/28-DisciplinaryProcess/CreateRecord.mp3"
    },
    {
        startFrame: 2310,
        durationFrames: 1260,
        file: "voiceover/28-DisciplinaryProcess/ResponseThread.mp3"
    },
    {
        startFrame: 3555,
        durationFrames: 1380,
        file: "voiceover/28-DisciplinaryProcess/AcknowledgeExpunge.mp3"
    },
    {
        startFrame: 4920,
        durationFrames: 990,
        file: "voiceover/28-DisciplinaryProcess/troubleshoot.mp3"
    },
    {
        startFrame: 5895,
        durationFrames: 600,
        file: "voiceover/28-DisciplinaryProcess/outro.mp3"
    }
];

export const DisciplinaryProcess: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={27 * fps} name="Intro">
        <DPIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={51 * fps} name="CreateRecord">
        <DPCreateRecordScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={42 * fps} name="ResponseThread">
        <DPResponseThreadScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={46 * fps} name="AcknowledgeExpunge">
        <DPAcknowledgeExpungeScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={33 * fps} name="Troubleshooting">
        <DPTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Outro">
        <DPOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
