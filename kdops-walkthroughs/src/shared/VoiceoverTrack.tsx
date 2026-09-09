import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";

export type VoiceoverSegment = {
  startFrame: number;
  durationFrames: number;
  file: string; // path relative to public/ e.g. "voiceover/01-WelcomeToKDOps/intro.mp3"
};

export const VoiceoverTrack: React.FC<{ segments: VoiceoverSegment[] }> = ({
  segments,
}) => {
  return (
    <AbsoluteFill>
      {segments.map((seg) => (
        <Sequence
          key={seg.file}
          from={seg.startFrame}
          durationInFrames={seg.durationFrames}
          name={`VO-${seg.file}`}
        >
          <Audio src={staticFile(seg.file)} volume={0.85} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
