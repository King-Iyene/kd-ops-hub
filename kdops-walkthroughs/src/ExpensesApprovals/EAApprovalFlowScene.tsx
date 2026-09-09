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

const STAGES = [
  { icon: "👤", label: "Employee submits", sub: "Expense filed" },
  { icon: "👔", label: "Manager reviews", sub: "Line approval" },
  { icon: "💰", label: "Finance approves", sub: "Budget check" },
  { icon: "✅", label: "Reimbursed", sub: "Funds sent" },
];

export const EAApprovalFlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Which stage is highlighted (cycles through)
  const highlightIndex = Math.min(
    Math.floor((frame - 2.5 * fps) / (1.2 * fps)),
    3,
  );

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
        Approval Flow
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 16,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        From submission to reimbursement
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 20,
          color: COLORS.textMuted,
          marginBottom: 60,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Every expense follows a clear chain of approval before funds are
        released. Track each stage in real time.
      </Interactive.Div>

      {/* Horizontal flow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {STAGES.map((stage, i) => {
          const delay = 0.8 + i * 0.4;
          const cardOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.3) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const isActive = frame > 2.5 * fps && i === highlightIndex;

          return (
            <div key={stage.label} style={{ display: "flex", alignItems: "center" }}>
              <Interactive.Div
                name={`Stage-${i}`}
                style={{
                  background: isActive
                    ? `${COLORS.accentBright}22`
                    : COLORS.surface,
                  borderRadius: 16,
                  padding: "32px 28px",
                  border: `2px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                  textAlign: "center" as const,
                  width: 180,
                  opacity: cardOpacity,
                  transition: "border-color 0.3s, background 0.3s",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>{stage.icon}</div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: COLORS.white,
                    marginBottom: 6,
                  }}
                >
                  {stage.label}
                </div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                  {stage.sub}
                </div>
              </Interactive.Div>

              {/* Arrow between stages */}
              {i < STAGES.length - 1 && (
                <Interactive.Div
                  name={`Arrow-${i}`}
                  style={{
                    fontSize: 28,
                    color: COLORS.accentBright,
                    margin: "0 8px",
                    opacity: interpolate(
                      frame,
                      [(delay + 0.3) * fps, (delay + 0.5) * fps],
                      [0, 1],
                      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                    ),
                  }}
                >
                  →
                </Interactive.Div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tip */}
      <Interactive.Div
        name="Tip"
        style={{
          marginTop: 48,
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "20px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.accentBright, marginBottom: 6 }}>
          💡 Configurable workflow
        </div>
        <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>
          Admins can add or remove approval stages, set auto-approve thresholds,
          and assign backup approvers for each department.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
