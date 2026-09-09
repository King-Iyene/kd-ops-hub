import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { LRIntroScene } from "./LRIntroScene";
import { LRLeaveOverviewScene } from "./LRLeaveOverviewScene";
import { LRRequestLeaveScene } from "./LRRequestLeaveScene";
import { LRApproveLeaveScene } from "./LRApproveLeaveScene";
import { LRTroubleshootScene } from "./LRTroubleshootScene";
import { LROutroScene } from "./LROutroScene";

export const LeaveRequests: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <TransitionSeries>
      {/* Scene 1: Intro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Intro">
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
      <TransitionSeries.Sequence durationInFrames={6 * fps} name="Troubleshooting">
        <LRTroubleshootScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      {/* Scene 6: Outro — 4s */}
      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Outro">
        <LROutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
