import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { CCIntroScene } from "./CCIntroScene";
import { CCComplianceOverviewScene } from "./CCComplianceOverviewScene";
import { CCFilingProcessScene } from "./CCFilingProcessScene";
import { CCDocumentUploadScene } from "./CCDocumentUploadScene";
import { CCTroubleshootScene } from "./CCTroubleshootScene";
import { CCOutroScene } from "./CCOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 300,
        file: "voiceover/11-ComplianceCentre/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 570,
        file: "voiceover/11-ComplianceCentre/overview.mp3"
    },
    {
        startFrame: 840,
        durationFrames: 510,
        file: "voiceover/11-ComplianceCentre/filing.mp3"
    },
    {
        startFrame: 1335,
        durationFrames: 570,
        file: "voiceover/11-ComplianceCentre/upload.mp3"
    },
    {
        startFrame: 1890,
        durationFrames: 570,
        file: "voiceover/11-ComplianceCentre/troubleshoot.mp3"
    },
    {
        startFrame: 2445,
        durationFrames: 330,
        file: "voiceover/11-ComplianceCentre/outro.mp3"
    }
];

export const ComplianceCentre: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <CCIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="ComplianceOverview">
        <CCComplianceOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={17 * fps} name="FilingProcess">
        <CCFilingProcessScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="DocumentUpload">
        <CCDocumentUploadScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={19 * fps} name="Troubleshooting">
        <CCTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={11 * fps} name="Outro">
        <CCOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
