import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { RPIntroScene } from "./RPIntroScene";
import { RPCreateOpeningScene } from "./RPCreateOpeningScene";
import { RPManageCandidatesScene } from "./RPManageCandidatesScene";
import { RPExtendOfferScene } from "./RPExtendOfferScene";
import { RPTroubleshootScene } from "./RPTroubleshootScene";
import { RPOutroScene } from "./RPOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 660,
        file: "voiceover/26-RecruitmentPipeline/intro.mp3"
    },
    {
        startFrame: 645,
        durationFrames: 1590,
        file: "voiceover/26-RecruitmentPipeline/CreateOpening.mp3"
    },
    {
        startFrame: 2220,
        durationFrames: 1260,
        file: "voiceover/26-RecruitmentPipeline/ManageCandidates.mp3"
    },
    {
        startFrame: 3465,
        durationFrames: 1290,
        file: "voiceover/26-RecruitmentPipeline/ExtendOffer.mp3"
    },
    {
        startFrame: 4740,
        durationFrames: 930,
        file: "voiceover/26-RecruitmentPipeline/troubleshoot.mp3"
    },
    {
        startFrame: 5655,
        durationFrames: 600,
        file: "voiceover/26-RecruitmentPipeline/outro.mp3"
    }
];

export const RecruitmentPipeline: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Intro">
        <RPIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={53 * fps} name="CreateOpening">
        <RPCreateOpeningScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={42 * fps} name="ManageCandidates">
        <RPManageCandidatesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={43 * fps} name="ExtendOffer">
        <RPExtendOfferScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={31 * fps} name="Troubleshooting">
        <RPTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Outro">
        <RPOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
