import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { SPIntroScene } from "./SPIntroScene";
import { SPIdentifyRolesScene } from "./SPIdentifyRolesScene";
import { SPAssignCandidatesScene } from "./SPAssignCandidatesScene";
import { SPTroubleshootScene } from "./SPTroubleshootScene";
import { SPOutroScene } from "./SPOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 690,
        file: "voiceover/31-SuccessionPlanning/intro.mp3"
    },
    {
        startFrame: 675,
        durationFrames: 1380,
        file: "voiceover/31-SuccessionPlanning/IdentifyRoles.mp3"
    },
    {
        startFrame: 2040,
        durationFrames: 1320,
        file: "voiceover/31-SuccessionPlanning/AssignCandidates.mp3"
    },
    {
        startFrame: 3345,
        durationFrames: 810,
        file: "voiceover/31-SuccessionPlanning/troubleshoot.mp3"
    },
    {
        startFrame: 4140,
        durationFrames: 600,
        file: "voiceover/31-SuccessionPlanning/outro.mp3"
    }
];

export const SuccessionPlanning: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={23 * fps} name="Intro">
        <SPIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={46 * fps} name="IdentifyRoles">
        <SPIdentifyRolesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={44 * fps} name="AssignCandidates">
        <SPAssignCandidatesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={27 * fps} name="Troubleshooting">
        <SPTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Outro">
        <SPOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
