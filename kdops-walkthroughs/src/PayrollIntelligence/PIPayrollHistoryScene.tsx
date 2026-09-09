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

const TABS = ["Dashboard", "Runs", "Pay groups", "Setup", "Reports"];

const ROWS = [
  { period: "October 2026", group: "KDS Administrative", status: "Completed", statusColor: COLORS.green, amount: "₦3,440,000", employees: 7 },
  { period: "October 2026", group: "NDI Staffs", status: "Completed", statusColor: COLORS.green, amount: "₦630,000", employees: 7 },
  { period: "September 2026", group: "KDS Administrative", status: "Completed", statusColor: COLORS.green, amount: "₦3,440,000", employees: 7 },
  { period: "September 2026", group: "Non-administrative", status: "Processing", statusColor: COLORS.orange, amount: "₦425,000", employees: 6 },
];

const COLUMNS = ["Period & Pay Group", "Status", "Amount", "Employees"];

export const PIPayrollHistoryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
      }}
    >
      {/* Scene label */}
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
        Payroll Runs
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 24,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Past payroll runs
      </Interactive.Div>

      {/* Tabs - showing "Runs" as active */}
      <Interactive.Div
        name="Tabs"
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 24,
          borderBottom: `1px solid ${COLORS.border}`,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {TABS.map((tab, i) => (
          <div
            key={tab}
            style={{
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: i === 1 ? 700 : 400,
              color: i === 1 ? COLORS.accentBright : COLORS.textMuted,
              borderBottom: i === 1 ? `2px solid ${COLORS.accentBright}` : "2px solid transparent",
            }}
          >
            {tab}
          </div>
        ))}
      </Interactive.Div>

      {/* Table */}
      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          marginBottom: 24,
          opacity: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2.5fr 1fr 1.2fr 0.8fr",
            padding: "16px 28px",
            background: `${COLORS.accent}33`,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          {COLUMNS.map((col) => (
            <div
              key={col}
              style={{
                fontSize: 12,
                fontFamily: monoFamily,
                color: COLORS.accentBright,
                letterSpacing: 1.5,
                textTransform: "uppercase" as const,
              }}
            >
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {ROWS.map((row, i) => {
          const delay = 0.8 + i * 0.25;
          const rowOpacity = interpolate(frame, [delay * fps, (delay + 0.25) * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isHighlighted = Math.floor((frame - 3 * fps) / (1.2 * fps)) % ROWS.length === i && frame > 3 * fps;

          return (
            <Interactive.Div
              key={`${row.period}-${row.group}`}
              name={`Row-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "2.5fr 1fr 1.2fr 0.8fr",
                padding: "18px 28px",
                borderBottom: i < ROWS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                background: isHighlighted ? `${COLORS.accentBright}08` : "transparent",
                opacity: rowOpacity,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>{row.period}</div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>{row.group}</div>
              </div>
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: row.statusColor,
                    background: `${row.statusColor}22`,
                    padding: "4px 14px",
                    borderRadius: 20,
                  }}
                >
                  {row.status}
                </span>
              </div>
              <div style={{ fontSize: 16, color: COLORS.white, fontFamily: monoFamily }}>{row.amount}</div>
              <div style={{ fontSize: 16, color: COLORS.textMuted, textAlign: "center" as const }}>{row.employees}</div>
            </Interactive.Div>
          );
        })}
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "16px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [2.2 * fps, 2.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>
          <span style={{ color: COLORS.accentBright, fontWeight: 700 }}>💡 Tip: </span>
          Click any completed run to download payslips or view the detailed breakdown.
          You can also export the full history as a CSV from the Reports tab.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
