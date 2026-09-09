import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
import { MPIntroScene } from "./MPIntroScene";
import { MPPortalOverviewScene } from "./MPPortalOverviewScene";
import { MPQuickActionsScene } from "./MPQuickActionsScene";
import { MPTroubleshootScene } from "./MPTroubleshootScene";
import { MPOutroScene } from "./MPOutroScene";
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = [
    {
        startFrame: 0,
        durationFrames: 540,
        file: "voiceover/14-MyPortal/intro.mp3"
    },
    {
        startFrame: 525,
        durationFrames: 810,
        file: "voiceover/14-MyPortal/overview.mp3"
    },
    {
        startFrame: 1320,
        durationFrames: 840,
        file: "voiceover/14-MyPortal/actions.mp3"
    },
    {
        startFrame: 2145,
        durationFrames: 660,
        file: "voiceover/14-MyPortal/troubleshoot.mp3"
    },
    {
        startFrame: 2790,
        durationFrames: 420,
        file: "voiceover/14-MyPortal/outro.mp3"
    }
];

export const MyPortal: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={18 * fps} name="Intro">
        <MPIntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={27 * fps} name="PortalOverview">
        <MPPortalOverviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={28 * fps} name="QuickActions">
        <MPQuickActionsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={22 * fps} name="Troubleshooting">
        <MPTroubleshootScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />

      <TransitionSeries.Sequence durationInFrames={14 * fps} name="Outro">
        <MPOutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
