import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { MEIntroScene } from "./MEIntroScene";
import { MEDirectoryScene } from "./MEDirectoryScene";
import { MEAddEmployeeScene } from "./MEAddEmployeeScene";
import { MEModulesScene } from "./MEModulesScene";
import { METroubleshootScene } from "./METroubleshootScene";
import { MEOutroScene } from "./MEOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 120,
        file: "voiceover/03-ManagingEmployees/intro.mp3"
    },
    {
        startFrame: 105,
        durationFrames: 240,
        file: "voiceover/03-ManagingEmployees/directory.mp3"
    },
    {
        startFrame: 330,
        durationFrames: 240,
        file: "voiceover/03-ManagingEmployees/add-employee.mp3"
    },
    {
        startFrame: 555,
        durationFrames: 240,
        file: "voiceover/03-ManagingEmployees/modules.mp3"
    },
    {
        startFrame: 780,
        durationFrames: 180,
        file: "voiceover/03-ManagingEmployees/troubleshoot.mp3"
    },
    {
        startFrame: 945,
        durationFrames: 120,
        file: "voiceover/03-ManagingEmployees/outro.mp3"
    }
];

export const ManagingEmployees: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <MEIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Directory">
        <MEDirectoryScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="AddEmployee">
        <MEAddEmployeeScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Modules">
        <MEModulesScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <METroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <MEOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
