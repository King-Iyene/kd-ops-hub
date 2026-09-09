import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { SMIntroScene } from "./SMIntroScene";
import { SVCreateSurveyScene } from "./SVCreateSurveyScene";
import { SVRespondToSurveyScene } from "./SVRespondToSurveyScene";
import { SVViewResultsScene } from "./SVViewResultsScene";
import { SMTroubleshootScene } from "./SMTroubleshootScene";
import { SMOutroScene } from "./SMOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 750,
        file: "voiceover/34-SurveysModule/intro.mp3"
    },
    {
        startFrame: 735,
        durationFrames: 1620,
        file: "voiceover/34-SurveysModule/CreateSurvey.mp3"
    },
    {
        startFrame: 2340,
        durationFrames: 1380,
        file: "voiceover/34-SurveysModule/RespondToSurvey.mp3"
    },
    {
        startFrame: 3705,
        durationFrames: 1440,
        file: "voiceover/34-SurveysModule/ViewResults.mp3"
    },
    {
        startFrame: 5130,
        durationFrames: 1020,
        file: "voiceover/34-SurveysModule/troubleshoot.mp3"
    },
    {
        startFrame: 6135,
        durationFrames: 570,
        file: "voiceover/34-SurveysModule/outro.mp3"
    }
];

export const SurveysModule: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={25 * fps} name="Intro">
        <SMIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={54 * fps} name="CreateSurvey">
        <SVCreateSurveyScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={46 * fps} name="RespondToSurvey">
        <SVRespondToSurveyScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={48 * fps} name="ViewResults">
        <SVViewResultsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={34 * fps} name="Troubleshooting">
        <SMTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Outro">
        <SMOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
