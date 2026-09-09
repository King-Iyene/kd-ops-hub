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
        durationFrames: 120,
        file: "voiceover/11-ComplianceCentre/intro.mp3"
    },
    {
        startFrame: 105,
        durationFrames: 240,
        file: "voiceover/11-ComplianceCentre/overview.mp3"
    },
    {
        startFrame: 330,
        durationFrames: 240,
        file: "voiceover/11-ComplianceCentre/filing.mp3"
    },
    {
        startFrame: 555,
        durationFrames: 240,
        file: "voiceover/11-ComplianceCentre/upload.mp3"
    },
    {
        startFrame: 780,
        durationFrames: 180,
        file: "voiceover/11-ComplianceCentre/troubleshoot.mp3"
    },
    {
        startFrame: 945,
        durationFrames: 120,
        file: "voiceover/11-ComplianceCentre/outro.mp3"
    }
];

export const ComplianceCentre: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
        <CCIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="ComplianceOverview">
        <CCComplianceOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="FilingProcess">
        <CCFilingProcessScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="DocumentUpload">
        <CCDocumentUploadScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <CCTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })} />
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <CCOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
