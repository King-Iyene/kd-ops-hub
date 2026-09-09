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
        durationFrames: 300,
        file: "voiceover/37-InvoicingClients/intro.mp3"
    },
    {
        startFrame: 285,
        durationFrames: 600,
        file: "voiceover/37-InvoicingClients/create.mp3"
    },
    {
        startFrame: 870,
        durationFrames: 600,
        file: "voiceover/37-InvoicingClients/payments.mp3"
    },
    {
        startFrame: 1455,
        durationFrames: 450,
        file: "voiceover/37-InvoicingClients/troubleshoot.mp3"
    },
    {
        startFrame: 1890,
        durationFrames: 300,
        file: "voiceover/37-InvoicingClients/outro.mp3"
    }
];

export const InvoicingClients: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Intro">
        <ICIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="CreateInvoice">
        <ICCreateInvoiceScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={20 * fps} name="TrackPayments">
        <ICTrackPaymentsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={15 * fps} name="Troubleshooting">
        <ICTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={10 * fps} name="Outro">
        <ICOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
