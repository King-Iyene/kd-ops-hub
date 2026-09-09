import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { AIIntroScene } from "./AIIntroScene";
import { AIInboxViewScene } from "./AIInboxViewScene";
import { AIApprovingItemScene } from "./AIApprovingItemScene";
import { AITroubleshootScene } from "./AITroubleshootScene";
import { AIOutroScene } from "./AIOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 540,
        file: "voiceover/17-ApprovalsInbox/intro.mp3"
    },
    {
        startFrame: 525,
        durationFrames: 870,
        file: "voiceover/17-ApprovalsInbox/inbox.mp3"
    },
    {
        startFrame: 1380,
        durationFrames: 1140,
        file: "voiceover/17-ApprovalsInbox/approving.mp3"
    },
    {
        startFrame: 2505,
        durationFrames: 780,
        file: "voiceover/17-ApprovalsInbox/troubleshoot.mp3"
    },
    {
        startFrame: 3270,
        durationFrames: 420,
        file: "voiceover/17-ApprovalsInbox/outro.mp3"
    }
];

export const ApprovalsInbox: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Intro">
        <AIIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={29 * fps} name="InboxView">
        <AIInboxViewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={38 * fps} name="ApprovingItem">
        <AIApprovingItemScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={26 * fps} name="Troubleshooting">
        <AITroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={14 * fps} name="Outro">
        <AIOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
