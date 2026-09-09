import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { LRIntroScene } from "./LRIntroScene";
import { LRLeaveOverviewScene } from "./LRLeaveOverviewScene";
import { LRRequestLeaveScene } from "./LRRequestLeaveScene";
import { LRApproveLeaveScene } from "./LRApproveLeaveScene";
import { LRTroubleshootScene } from "./LRTroubleshootScene";
import { LROutroScene } from "./LROutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 270,
        file: "voiceover/05-LeaveRequests/intro.mp3"
    },
    {
        startFrame: 255,
        durationFrames: 480,
        file: "voiceover/05-LeaveRequests/balances.mp3"
    },
    {
        startFrame: 720,
        durationFrames: 540,
        file: "voiceover/05-LeaveRequests/request.mp3"
    },
    {
        startFrame: 1245,
        durationFrames: 480,
        file: "voiceover/05-LeaveRequests/approve.mp3"
    },
    {
        startFrame: 1710,
        durationFrames: 600,
        file: "voiceover/05-LeaveRequests/troubleshoot.mp3"
    },
    {
        startFrame: 2295,
        durationFrames: 270,
        file: "voiceover/05-LeaveRequests/outro.mp3"
    }
];

export const LeaveRequests: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={9 * fps} name="Intro">
        <LRIntroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 2: Leave Overview — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="LeaveOverview">
        <LRLeaveOverviewScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 3: Request Leave — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="RequestLeave">
        <LRRequestLeaveScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 4: Approve Leave — 8s */}
      <TransitionSeries.Sequence durationInFrames={8 * fps} name="ApproveLeave">
        <LRApproveLeaveScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 5: Troubleshooting — 6s */}
      <TransitionSeries.Sequence durationInFrames={20 * fps} name="Troubleshooting">
        <LRTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={9 * fps} name="Outro">
        <LROutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
