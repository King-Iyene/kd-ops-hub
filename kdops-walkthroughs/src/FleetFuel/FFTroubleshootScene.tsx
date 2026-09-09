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

const ISSUES = [
  {
    icon: "🚗",
    problem: "Vehicle not listed?",
    solution: "Admin adds it in Fleet settings.",
    fallback: "Provide plate number and vehicle details to your admin.",
  },
  {
    icon: "🧾",
    problem: "Fuel log rejected?",
    solution: "Attach a photo of the fuel receipt.",
    fallback: "Re-submit with a clear, legible receipt image.",
  },
  {
    icon: "👤",
    problem: "Driver not assigned?",
    solution: "Update the assignment in vehicle profile.",
    fallback: "Ask your fleet admin to link the driver.",
  },
  {
    icon: "⚠️",
    problem: "Fuel budget exceeded?",
    solution: "Auto-alert sent to operations manager.",
    fallback: "Review recent fuel entries for anomalies.",
  },
];

export const FFTroubleshootScene: React.FC = () => {
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
          fontSize: 18,
          fontFamily: monoFamily,
          color: COLORS.red,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Troubleshooting
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 40,
          opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Common issues & fixes
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {ISSUES.map((issue, i) => {
          const delay = 0.6 + i * 0.4;
          return (
            <Interactive.Div
              key={issue.problem}
              name={`Issue-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: 28,
                border: `1px solid ${COLORS.border}`,
                opacity: interpolate(
                  frame,
                  [delay * fps, (delay + 0.3) * fps],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }
                ),
                translate: interpolate(
                  frame,
                  [delay * fps, (delay + 0.3) * fps],
                  ["0px 20px", "0px 0px"],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }
                ),
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{issue.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
                {issue.problem}
              </div>
              <div style={{ fontSize: 16, color: COLORS.green, marginBottom: 6, fontWeight: 500 }}>
                → {issue.solution}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>
                {issue.fallback}
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      <Interactive.Div
        name="SupportNote"
        style={{
          position: "absolute",
          bottom: 50,
          left: 80,
          right: 80,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "16px 24px",
          fontSize: 18,
          color: COLORS.accentBright,
          fontWeight: 500,
          textAlign: "center" as const,
          opacity: interpolate(frame, [2.8 * fps, 3.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Need help? Reach out to your admin or contact support@kdsquares.com
      </Interactive.Div>
    </AbsoluteFill>
  );
};
