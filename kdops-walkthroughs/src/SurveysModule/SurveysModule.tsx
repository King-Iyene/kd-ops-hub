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
        durationFrames: 300,
        file: "voiceover/34-SurveysModule/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/34-SurveysModule/create.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/34-SurveysModule/respond.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 600,
        file: "voiceover/34-SurveysModule/results.mp3"
    },
    {
        startFrame: 2040,
        durationFrames: 450,
        file: "voiceover/34-SurveysModule/troubleshoot.mp3"
    },
    {
        startFrame: 2475,
        durationFrames: 300,
        file: "voiceover/34-SurveysModule/outro.mp3"
    }
];

export const SurveysModule: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <SMIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="CreateSurvey">
        <SVCreateSurveyScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="RespondToSurvey">
        <SVRespondToSurveyScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="ViewResults">
        <SVViewResultsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <SMTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <SMOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
