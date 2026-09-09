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

export const AIIntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
        display: "flex",
        flexDirection: "column" as const,
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentBright}, ${COLORS.gold})` }} />
      <Interactive.Div name="Badge" style={{ fontSize: 14, fontFamily: monoFamily, color: COLORS.accentBright, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 24, opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        KDOps Platform Guide
      </Interactive.Div>
      <Interactive.Div name="Icon" style={{ width: 90, height: 90, borderRadius: 20, background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`, display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 32, scale: interpolate(frame, [0.2 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 200 }) }) }}>
        <span style={{ fontSize: 44 }}>📥</span>
      </Interactive.Div>
      <Interactive.Div name="Title" style={{ fontSize: 60, fontWeight: 700, color: COLORS.white, textAlign: "center" as const, opacity: interpolate(frame, [0.4 * fps, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Approvals Inbox
      </Interactive.Div>
      <Interactive.Div name="Subtitle" style={{ fontSize: 24, color: COLORS.textMuted, textAlign: "center" as const, marginTop: 16, maxWidth: 650, lineHeight: 1.6, opacity: interpolate(frame, [0.7 * fps, 1.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Review and approve payments, expenses, leave, and more
      </Interactive.Div>
      <Interactive.Div name="Tag" style={{ position: "absolute", bottom: 50, fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted, opacity: interpolate(frame, [1.2 * fps, 1.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        ops.kdsquares.com/approvals
      </Interactive.Div>
    </AbsoluteFill>
  );
};
