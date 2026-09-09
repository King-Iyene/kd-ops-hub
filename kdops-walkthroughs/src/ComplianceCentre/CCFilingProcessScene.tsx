import {
  AbsoluteFill,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/DmSans";
import { loadFont as loadMono } from "@remotion/google-fonts/SpaceMono";
import { COLORS } from "./theme";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
});
const { fontFamily: monoFamily } = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const STEPS = [
  { title: "Check due date", desc: "Review the compliance calendar for upcoming deadlines." },
  { title: "Gather documents", desc: "Collect all required receipts, reports, and certificates." },
  { title: "File return", desc: "Submit the filing through the appropriate tax portal." },
  { title: "Upload proof", desc: "Attach the filed receipt or acknowledgement to KD Ops." },
  { title: "Mark as completed", desc: "Update the status so your team knows it's done." },
];

export const CCFilingProcessScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "50px 80px",
      }}
    >
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 16,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Filing Process
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        How to file a return
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>
        {STEPS.map((step, i) => {
          const delay = 0.6 + i * 0.3;
          return (
            <Interactive.Div
              key={step.title}
              name={`Step-${i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: COLORS.accentBright,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  color: COLORS.white,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>
                  {step.desc}
                </div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
