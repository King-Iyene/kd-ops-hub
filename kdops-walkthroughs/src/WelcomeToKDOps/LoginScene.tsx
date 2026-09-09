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
  weights: ["400"],
  subsets: ["latin"],
});

export const LoginScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typingProgress = interpolate(
    frame,
    [1.5 * fps, 3 * fps],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const emailText = "king@kdsquares.com".slice(
    0,
    Math.floor(typingProgress * 18)
  );
  const passwordDots = "••••••••••".slice(
    0,
    Math.floor(
      interpolate(frame, [3.2 * fps, 4 * fps], [0, 10], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    )
  );

  const buttonClick = frame > 4.5 * fps;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
      }}
    >
      {/* Scene label */}
      <Interactive.Div
        name="SceneLabel"
        style={{
          position: "absolute",
          top: 40,
          left: 80,
          fontSize: 18,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step 1 — Sign In
      </Interactive.Div>

      {/* Login card */}
      <Interactive.Div
        name="LoginCard"
        style={{
          width: 480,
          background: COLORS.surface,
          borderRadius: 16,
          padding: 48,
          border: `1px solid ${COLORS.border}`,
          scale: interpolate(frame, [0, 0.6 * fps], [0.9, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 700, color: COLORS.white }}>
              KD
            </span>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.white }}>
              KDOps
            </div>
            <div style={{ fontSize: 13, color: COLORS.textMuted }}>
              Operations Platform
            </div>
          </div>
        </div>

        <div
          style={{ fontSize: 28, fontWeight: 600, color: COLORS.white, marginBottom: 8 }}
        >
          Sign in
        </div>
        <div style={{ fontSize: 15, color: COLORS.textMuted, marginBottom: 28 }}>
          Enter your credentials to access the platform
        </div>

        {/* Email field */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textMuted,
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Email
          </div>
          <div
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${frame > 1.5 * fps && frame < 3 * fps ? COLORS.accentBright : COLORS.border}`,
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 16,
              color: COLORS.white,
              minHeight: 20,
              fontFamily: monoFamily,
            }}
          >
            {emailText}
            {frame > 1.5 * fps && frame < 3 * fps && (
              <span
                style={{
                  opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
                  color: COLORS.accentBright,
                }}
              >
                |
              </span>
            )}
          </div>
        </div>

        {/* Password field */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textMuted,
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Password
          </div>
          <div
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${frame > 3.2 * fps && frame < 4 * fps ? COLORS.accentBright : COLORS.border}`,
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 20,
              color: COLORS.white,
              minHeight: 20,
              letterSpacing: 4,
            }}
          >
            {passwordDots}
          </div>
        </div>

        {/* Sign in button */}
        <div
          style={{
            background: buttonClick
              ? COLORS.accentBright
              : `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
            borderRadius: 8,
            padding: "14px 24px",
            textAlign: "center" as const,
            fontSize: 16,
            fontWeight: 600,
            color: buttonClick ? COLORS.bg : COLORS.white,
            scale: buttonClick
              ? interpolate(
                  frame,
                  [4.5 * fps, 4.6 * fps, 4.7 * fps],
                  [1, 0.96, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }
                )
              : 1,
          }}
        >
          {buttonClick ? "Signing in..." : "Sign In"}
        </div>

        {/* Forgot password link */}
        <div
          style={{
            textAlign: "center" as const,
            marginTop: 16,
            fontSize: 14,
            color: COLORS.accentBright,
          }}
        >
          Forgot your password?
        </div>
      </Interactive.Div>

      {/* Callout annotation */}
      <Interactive.Div
        name="Callout"
        style={{
          position: "absolute",
          right: 100,
          top: 280,
          maxWidth: 320,
          background: COLORS.gold,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 16,
          fontWeight: 500,
          color: COLORS.bg,
          opacity: interpolate(frame, [4.8 * fps, 5.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(
            frame,
            [4.8 * fps, 5.3 * fps],
            ["20px 0px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }
          ),
        }}
      >
        💡 Use the email and password from your admin invite
      </Interactive.Div>
    </AbsoluteFill>
  );
};
