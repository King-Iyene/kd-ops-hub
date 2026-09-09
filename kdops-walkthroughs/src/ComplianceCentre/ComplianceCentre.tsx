import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { CCIntroScene } from "./CCIntroScene";
import { CCComplianceOverviewScene } from "./CCComplianceOverviewScene";
import { CCFilingProcessScene } from "./CCFilingProcessScene";
import { CCDocumentUploadScene } from "./CCDocumentUploadScene";
import { CCTroubleshootScene } from "./CCTroubleshootScene";
import { CCOutroScene } from "./CCOutroScene";

export const ComplianceCentre: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
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
  );
};
