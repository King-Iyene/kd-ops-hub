import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { ICIntroScene } from "./ICIntroScene";
import { ICCreateInvoiceScene } from "./ICCreateInvoiceScene";
import { ICTrackPaymentsScene } from "./ICTrackPaymentsScene";
import { ICTroubleshootScene } from "./ICTroubleshootScene";
import { ICOutroScene } from "./ICOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 780,
        file: "voiceover/37-InvoicingClients/intro.mp3"
    },
    {
        startFrame: 765,
        durationFrames: 1890,
        file: "voiceover/37-InvoicingClients/CreateInvoice.mp3"
    },
    {
        startFrame: 2640,
        durationFrames: 1620,
        file: "voiceover/37-InvoicingClients/TrackPayments.mp3"
    },
    {
        startFrame: 4245,
        durationFrames: 1050,
        file: "voiceover/37-InvoicingClients/troubleshoot.mp3"
    },
    {
        startFrame: 5280,
        durationFrames: 600,
        file: "voiceover/37-InvoicingClients/outro.mp3"
    }
];

export const InvoicingClients: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={26 * fps} name="Intro">
        <ICIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={63 * fps} name="CreateInvoice">
        <ICCreateInvoiceScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={54 * fps} name="TrackPayments">
        <ICTrackPaymentsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={35 * fps} name="Troubleshooting">
        <ICTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Outro">
        <ICOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
