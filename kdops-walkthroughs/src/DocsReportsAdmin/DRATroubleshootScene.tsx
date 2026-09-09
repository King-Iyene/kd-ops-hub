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

const ISSUES = [
  {
    icon: "📄",
    problem: "Can't generate report?",
    solution: "Check the date range is valid and has data.",
    fallback: "Try a broader date range or different department.",
  },
  {
    icon: "📤",
    problem: "Document upload failing?",
    solution: "Maximum file size is 10 MB (PDF or image).",
    fallback: "Compress the file or split into smaller parts.",
  },
  {
    icon: "🔒",
    problem: "Can't change settings?",
    solution: "You need the Super Admin role.",
    fallback: "Ask your Super Admin to make the change.",
  },
  {
    icon: "🕐",
    problem: "Audit trail not showing?",
    solution: "The audit log only tracks the last 90 days.",
    fallback: "Export older records before they expire.",
  },
];

export const DRATroubleshootScene: React.FC = () => {
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
        Common issues & fixes
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
                {"→"} {issue.solution}
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
