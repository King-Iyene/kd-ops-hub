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
        durationFrames: 300,
        file: "voiceover/26-RecruitmentPipeline/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/26-RecruitmentPipeline/opening.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/26-RecruitmentPipeline/candidates.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 600,
        file: "voiceover/26-RecruitmentPipeline/offer.mp3"
    },
    {
        startFrame: 2040,
        durationFrames: 450,
        file: "voiceover/26-RecruitmentPipeline/troubleshoot.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 300,
        file: "voiceover/26-RecruitmentPipeline/outro.mp3"
    }
];

export const RecruitmentPipeline: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <RPIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="CreateOpening">
        <RPCreateOpeningScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="ManageCandidates">
        <RPManageCandidatesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="ExtendOffer">
        <RPExtendOfferScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <RPTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <RPOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
