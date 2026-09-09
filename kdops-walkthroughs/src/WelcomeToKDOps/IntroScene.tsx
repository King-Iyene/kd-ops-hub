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

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 30% 40%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
      }}
    >
      {/* Decorative accent line */}
      <Interactive.Div
        name="AccentLine"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentBright}, ${COLORS.gold})`,
          scale: interpolate(frame, [0, 0.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      {/* Logo circle */}
      <Interactive.Div
        name="LogoCircle"
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 40,
          scale: interpolate(frame, [0.2 * fps, 0.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: COLORS.white,
            fontFamily,
          }}
        >
          KD
        </span>
      </Interactive.Div>

      {/* Title */}
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 88,
          fontWeight: 700,
          color: COLORS.white,
          textAlign: "center",
          opacity: interpolate(frame, [0.6 * fps, 1.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(
            frame,
            [0.6 * fps, 1.2 * fps],
            ["0px 30px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }
          ),
        }}
      >
        Welcome to KDOps
      </Interactive.Div>

      {/* Subtitle */}
      <Interactive.Div
        name="Subtitle"
        style={{
          fontSize: 32,
          color: COLORS.textMuted,
          textAlign: "center",
          marginTop: 16,
          fontFamily: monoFamily,
          letterSpacing: 1.5,
          opacity: interpolate(frame, [1.2 * fps, 1.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(
            frame,
            [1.2 * fps, 1.8 * fps],
            ["0px 20px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }
          ),
        }}
      >
        Your operations command centre
      </Interactive.Div>

      {/* Bottom tag */}
      <Interactive.Div
        name="BottomTag"
        style={{
          position: "absolute",
          bottom: 60,
          fontSize: 18,
          color: COLORS.gold,
          fontFamily: monoFamily,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          opacity: interpolate(frame, [2 * fps, 2.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        KDOps Platform Guide
      </Interactive.Div>
    </AbsoluteFill>
  );
};
