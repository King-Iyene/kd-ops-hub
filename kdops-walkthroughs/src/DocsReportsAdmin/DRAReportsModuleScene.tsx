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

const REPORTS = [
  { icon: "📊", title: "Payroll Summary", desc: "Monthly payroll breakdown by department" },
  { icon: "💳", title: "Expense Report", desc: "Expense claims and reimbursements" },
  { icon: "👥", title: "Employee Directory", desc: "Full staff list with roles and departments" },
  { icon: "✅", title: "Compliance Status", desc: "Filing status across all obligations" },
];

export const DRAReportsModuleScene: React.FC = () => {
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
        Reports
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Generate reports
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {REPORTS.map((report, i) => {
          const delay = 0.6 + i * 0.4;
          return (
            <Interactive.Div
              key={report.title}
              name={`Report-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: "20px 28px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 28 }}>{report.icon}</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
                    {report.title}
                  </div>
                  <div style={{ fontSize: 15, color: COLORS.textMuted }}>{report.desc}</div>
                </div>
              </div>
              <div
                style={{
                  background: COLORS.accentBright,
                  color: COLORS.bg,
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Generate
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
