import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { DRAIntroScene } from "./DRAIntroScene";
import { DRADocumentsOverviewScene } from "./DRADocumentsOverviewScene";
import { DRAReportsModuleScene } from "./DRAReportsModuleScene";
import { DRAAdminSettingsScene } from "./DRAAdminSettingsScene";
import { DRATroubleshootScene } from "./DRATroubleshootScene";
import { DRAOutroScene } from "./DRAOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 330,
        file: "voiceover/13-DocsReportsAdmin/intro.mp3"
    },
    {
        startFrame: 315,
        durationFrames: 630,
        file: "voiceover/13-DocsReportsAdmin/documents.mp3"
    },
    {
        startFrame: 930,
        durationFrames: 600,
        file: "voiceover/13-DocsReportsAdmin/reports.mp3"
    },
    {
        startFrame: 1515,
        durationFrames: 510,
        file: "voiceover/13-DocsReportsAdmin/admin.mp3"
    },
    {
        startFrame: 2010,
        durationFrames: 510,
        file: "voiceover/13-DocsReportsAdmin/troubleshoot.mp3"
    },
    {
        startFrame: 2505,
        durationFrames: 300,
        file: "voiceover/13-DocsReportsAdmin/outro.mp3"
    }
];

export const DocsReportsAdmin: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={11 * fps} name="Intro">
        <DRAIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={21 * fps} name="DocumentsOverview">
        <DRADocumentsOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={20 * fps} name="ReportsModule">
        <DRAReportsModuleScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={17 * fps} name="AdminSettings">
        <DRAAdminSettingsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={17 * fps} name="Troubleshooting">
        <DRATroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <DRAOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
