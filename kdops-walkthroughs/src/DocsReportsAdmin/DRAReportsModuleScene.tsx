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

const REPORT_TYPES = [
  { icon: "💰", title: "Payroll Reports", desc: "Monthly payroll breakdown by department" },
  { icon: "🧾", title: "Expense Reports", desc: "Expense claims and reimbursement summaries" },
  { icon: "🏖️", title: "Leave Reports", desc: "Staff leave balances and usage" },
  { icon: "🚗", title: "Fleet Reports", desc: "Vehicle usage, fuel costs, and maintenance" },
  { icon: "📊", title: "Financial Summaries", desc: "Profit & loss, cash flow, and balance sheets" },
];

const GENERATE_STEPS = [
  { num: 1, label: "Select Report Type", value: "Payroll Reports" },
  { num: 2, label: "Date Range", value: "1 Aug 2026 — 31 Aug 2026" },
  { num: 3, label: "Department", value: "All Departments" },
  { num: 4, label: "Click", value: "Generate Report" },
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
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Admin &rarr; Reports
      </Interactive.Div>

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
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 20,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Generate and export reports
      </Interactive.Div>

      {/* Report type list */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12, marginBottom: 28 }}>
        {REPORT_TYPES.map((report, i) => {
          const delay = 0.6 + i * 0.25;
          return (
            <Interactive.Div
              key={report.title}
              name={`Report-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: "16px 24px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 24 }}>{report.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white }}>{report.title}</div>
                <div style={{ fontSize: 14, color: COLORS.textMuted }}>{report.desc}</div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Generate steps */}
      <Interactive.Div
        name="GenerateLabel"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 12,
          opacity: interpolate(frame, [2.2 * fps, 2.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Generating a report — example
      </Interactive.Div>

      <div style={{ display: "flex", gap: 12 }}>
        {GENERATE_STEPS.map((step, i) => {
          const delay = 2.4 + i * 0.25;
          return (
            <Interactive.Div
              key={step.label}
              name={`GenStep-${i}`}
              style={{
                flex: 1,
                background: COLORS.surface,
                borderRadius: 10,
                padding: "14px 16px",
                border: `1px solid ${COLORS.border}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 12, fontFamily: monoFamily, color: COLORS.accentBright, marginBottom: 6 }}>
                Step {step.num}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>{step.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white }}>{step.value}</div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 20,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          color: COLORS.accentBright,
          lineHeight: 1.5,
          opacity: interpolate(frame, [3.8 * fps, 4.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Export reports as PDF or CSV for sharing with management or external
        auditors.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
