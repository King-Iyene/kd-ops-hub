import {
  AbsoluteFill,
  Easing,
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

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 60% 50%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
        display: "flex",
        flexDirection: "column" as const,
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
      }}
    >
      {/* Accent line top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentBright}, ${COLORS.gold})`,
        }}
      />

      {/* Logo */}
      <Interactive.Div
        name="Logo"
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 32,
          scale: interpolate(frame, [0.3 * fps, 0.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <span style={{ fontSize: 40, fontWeight: 700, color: COLORS.white }}>KD</span>
      </Interactive.Div>

      <Interactive.Div
        name="ThankYou"
        style={{
          fontSize: 56,
          fontWeight: 700,
          color: COLORS.white,
          textAlign: "center" as const,
          opacity: interpolate(frame, [0.5 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        You're all set!
      </Interactive.Div>

      <Interactive.Div
        name="NextSteps"
        style={{
          fontSize: 22,
          color: COLORS.textMuted,
          textAlign: "center" as const,
          marginTop: 16,
          maxWidth: 600,
          lineHeight: 1.6,
          opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Explore the sidebar modules, complete your setup checklist, and start managing your operations.
      </Interactive.Div>

      {/* Next videos preview */}
      <Interactive.Div
        name="UpNext"
        style={{
          display: "flex",
          gap: 16,
          marginTop: 48,
          opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {["Dashboard Deep Dive", "Managing Employees", "Payment Batches"].map(
          (title, i) => (
            <div
              key={title}
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                padding: "16px 24px",
                textAlign: "center" as const,
              }}
            >
              <div style={{ fontSize: 12, color: COLORS.accentBright, fontFamily: monoFamily, marginBottom: 6 }}>
                UP NEXT
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>
                {title}
              </div>
            </div>
          )
        )}
      </Interactive.Div>

      {/* Footer */}
      <Interactive.Div
        name="Footer"
        style={{
          position: "absolute",
          bottom: 40,
          fontSize: 14,
          color: COLORS.textMuted,
          fontFamily: monoFamily,
          opacity: interpolate(frame, [2 * fps, 2.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        ops.kdsquares.com · KD Squares Ltd
      </Interactive.Div>
    </AbsoluteFill>
  );
};
