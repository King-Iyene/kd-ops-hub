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

  // URL bar appears first
  const urlBarOpacity = interpolate(frame, [0.3 * fps, 0.8 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Email typing animation
  const dummyEmail = "your.name@kdsquares.com";
  const typingProgress = interpolate(
    frame,
    [1.5 * fps, 3.2 * fps],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const emailText = dummyEmail.slice(
    0,
    Math.floor(typingProgress * dummyEmail.length)
  );

  // Password dots
  const passwordDots = "••••••••••".slice(
    0,
    Math.floor(
      interpolate(frame, [3.5 * fps, 4.3 * fps], [0, 10], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    )
  );

  const buttonClick = frame > 4.8 * fps;
  const showSuccess = frame > 5.6 * fps;

  // Callout timings
  const callout1Opacity = interpolate(frame, [5.8 * fps, 6.3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const callout2Opacity = interpolate(frame, [7 * fps, 7.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        Step 1 — Log In
      </Interactive.Div>

      {/* URL bar mock */}
      <Interactive.Div
        name="UrlBar"
        style={{
          position: "absolute",
          top: 90,
          left: "50%",
          translate: "-50% 0",
          background: COLORS.bgLight,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 24,
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: urlBarOpacity,
        }}
      >
        <span style={{ fontSize: 14, color: COLORS.green }}>🔒</span>
        <span style={{ fontSize: 15, fontFamily: monoFamily, color: COLORS.white }}>
          ops.kdsquares.com
        </span>
      </Interactive.Div>

      {/* Login card */}
      <Interactive.Div
        name="LoginCard"
        style={{
          width: 480,
          background: showSuccess ? COLORS.bgLight : COLORS.surface,
          borderRadius: 16,
          padding: 48,
          border: `1px solid ${showSuccess ? COLORS.green : COLORS.border}`,
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

        {showSuccess ? (
          /* Success state */
          <div style={{ textAlign: "center" as const, padding: "20px 0" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: `${COLORS.green}22`,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                margin: "0 auto 16px",
                fontSize: 32,
              }}
            >
              ✓
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
              Login Successful
            </div>
            <div style={{ fontSize: 15, color: COLORS.textMuted }}>
              Redirecting to your dashboard...
            </div>
            <div
              style={{
                marginTop: 20,
                height: 4,
                background: COLORS.bgLight,
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: COLORS.green,
                  width: `${interpolate(frame, [5.6 * fps, 7 * fps], [0, 100], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}%`,
                }}
              />
            </div>
          </div>
        ) : (
          /* Login form */
          <>
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
                  border: `1px solid ${frame > 1.5 * fps && frame < 3.2 * fps ? COLORS.accentBright : COLORS.border}`,
                  borderRadius: 8,
                  padding: "12px 16px",
                  fontSize: 16,
                  color: COLORS.white,
                  minHeight: 20,
                  fontFamily: monoFamily,
                }}
              >
                {emailText}
                {frame > 1.5 * fps && frame < 3.2 * fps && (
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
            <div style={{ marginBottom: 12 }}>
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
                  border: `1px solid ${frame > 3.5 * fps && frame < 4.3 * fps ? COLORS.accentBright : COLORS.border}`,
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

            {/* Forgot password link */}
            <div
              style={{
                textAlign: "right" as const,
                marginBottom: 24,
                fontSize: 14,
                color: COLORS.accentBright,
              }}
            >
              Forgot Password?
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
                      [4.8 * fps, 4.9 * fps, 5.0 * fps],
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
          </>
        )}
      </Interactive.Div>

      {/* Callout 1 — Company email */}
      <Interactive.Div
        name="Callout1"
        style={{
          position: "absolute",
          right: 80,
          top: 240,
          maxWidth: 340,
          background: COLORS.gold,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          fontWeight: 500,
          color: COLORS.bg,
          lineHeight: 1.5,
          opacity: callout1Opacity,
          translate: interpolate(
            frame,
            [5.8 * fps, 6.3 * fps],
            ["20px 0px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }
          ),
        }}
      >
        💡 Use your company email address to log in. If you forgot your password, click "Forgot Password" to reset it
      </Interactive.Div>

      {/* Callout 2 — Bookmark */}
      <Interactive.Div
        name="Callout2"
        style={{
          position: "absolute",
          right: 80,
          top: 380,
          maxWidth: 340,
          background: `${COLORS.gold}22`,
          border: `1px solid ${COLORS.gold}44`,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          fontWeight: 500,
          color: COLORS.gold,
          lineHeight: 1.5,
          opacity: callout2Opacity,
          translate: interpolate(
            frame,
            [7 * fps, 7.5 * fps],
            ["20px 0px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }
          ),
        }}
      >
        💡 Bookmark ops.kdsquares.com for quick access
      </Interactive.Div>
    </AbsoluteFill>
  );
};
