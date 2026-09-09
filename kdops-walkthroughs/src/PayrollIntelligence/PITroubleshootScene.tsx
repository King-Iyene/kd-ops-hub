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
    icon: "👤",
    problem: "Employee missing from payroll?",
    solution: "Check if employee status is set to Active.",
    fallback: "Verify onboarding is complete in employee profile.",
  },
  {
    icon: "💰",
    problem: "Salary showing wrong amount?",
    solution: "Update salary in employee profile before next run.",
    fallback: "Contact HR to correct employment terms.",
  },
  {
    icon: "📊",
    problem: "Tax calculation seems off?",
    solution: "Verify tax table settings under Finance → Tax Config.",
    fallback: "Compare with manual PAYE calculation for the bracket.",
  },
  {
    icon: "⏳",
    problem: "Payroll stuck on “Processing”?",
    solution: "Contact your finance administrator.",
    fallback: "Check if bank integration is connected.",
  },
];

export const PITroubleshootScene: React.FC = () => {
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
          color: COLORS.red,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
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
        Payroll issues & fixes
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {ISSUES.map((issue, i) => {
          const delay = 0.5 + i * 0.35;
          return (
            <Interactive.Div
              key={issue.problem}
              name={`Issue-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: 24,
                border: `1px solid ${COLORS.border}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>{issue.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
                {issue.problem}
              </div>
              <div style={{ fontSize: 15, color: COLORS.green, marginBottom: 6, fontWeight: 500 }}>
                → {issue.solution}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.4 }}>
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
          padding: "14px 24px",
          fontSize: 16,
          color: COLORS.accentBright,
          fontWeight: 500,
          textAlign: "center" as const,
          opacity: interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
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
