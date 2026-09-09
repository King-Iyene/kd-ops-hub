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
        durationFrames: 300,
        file: "voiceover/31-SuccessionPlanning/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/31-SuccessionPlanning/roles.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/31-SuccessionPlanning/candidates.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 450,
        file: "voiceover/31-SuccessionPlanning/troubleshoot.mp3"
    },
    {
        startFrame: 1890,
        durationFrames: 300,
        file: "voiceover/31-SuccessionPlanning/outro.mp3"
    }
];

export const SuccessionPlanning: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <SPIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="IdentifyRoles">
        <SPIdentifyRolesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="AssignCandidates">
        <SPAssignCandidatesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <SPTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <SPOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
