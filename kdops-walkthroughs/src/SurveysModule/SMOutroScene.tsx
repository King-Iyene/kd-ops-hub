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

export const SMOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse at 50% 40%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "center",
      alignItems: "center",
      fontFamily,
    }}>
      <Interactive.Div name="Check" style={{ fontSize: 64, marginBottom: 24, scale: interpolate(frame, [0, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 200 }) }) }}>
        ✅
      </Interactive.Div>
      <Interactive.Div name="Title" style={{ fontSize: 42, fontWeight: 700, color: COLORS.white, textAlign: "center" as const, opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        You're all set!
      </Interactive.Div>
      <Interactive.Div name="Subtitle" style={{ fontSize: 20, color: COLORS.textMuted, textAlign: "center" as const, marginTop: 16, maxWidth: 500, lineHeight: 1.6, opacity: interpolate(frame, [0.6 * fps, 1.0 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Next up: Benefits Enrollment
      </Interactive.Div>
      <Interactive.Div name="Badge" style={{ position: "absolute", bottom: 50, fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted, opacity: interpolate(frame, [1.0 * fps, 1.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        KDOps Platform Guide
      </Interactive.Div>
    </AbsoluteFill>
  );
};
