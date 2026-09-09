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
        durationFrames: 270,
        file: "voiceover/03-ManagingEmployees/intro.mp3"
    },
    {
        startFrame: 255,
        durationFrames: 630,
        file: "voiceover/03-ManagingEmployees/directory.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 960,
        file: "voiceover/03-ManagingEmployees/add-employee.mp3"
    },
    {
        startFrame: 1815,
        durationFrames: 750,
        file: "voiceover/03-ManagingEmployees/modules.mp3"
    },
    {
        startFrame: 2550,
        durationFrames: 600,
        file: "voiceover/03-ManagingEmployees/troubleshoot.mp3"
    },
    {
        startFrame: 3135,
        durationFrames: 300,
        file: "voiceover/03-ManagingEmployees/outro.mp3"
    }
];

export const ManagingEmployees: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={9 * fps} name="Intro">
        <MEIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={21 * fps} name="Directory">
        <MEDirectoryScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={32 * fps} name="AddEmployee">
        <MEAddEmployeeScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={25 * fps} name="Modules">
        <MEModulesScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Troubleshooting">
        <METroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <MEOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
