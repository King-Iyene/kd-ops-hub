import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { CDIntroScene } from "./CDIntroScene";
import { CDContractorListScene } from "./CDContractorListScene";
import { CDAddContractorScene } from "./CDAddContractorScene";
import { CDTroubleshootScene } from "./CDTroubleshootScene";
import { CDOutroScene } from "./CDOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 120,
        file: "voiceover/04-ContractorDirectory/intro.mp3"
    },
    {
        startFrame: 105,
        durationFrames: 240,
        file: "voiceover/04-ContractorDirectory/list.mp3"
    },
    {
        startFrame: 330,
        durationFrames: 240,
        file: "voiceover/04-ContractorDirectory/add.mp3"
    },
    {
        startFrame: 555,
        durationFrames: 180,
        file: "voiceover/04-ContractorDirectory/troubleshoot.mp3"
    },
    {
        startFrame: 720,
        durationFrames: 120,
        file: "voiceover/04-ContractorDirectory/outro.mp3"
    }
];

export const ContractorDirectory: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <CDIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="ContractorList">
        <CDContractorListScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="AddContractor">
        <CDAddContractorScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <CDTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <CDOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
