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

const ROWS = [
  { month: "August 2024", gross: "₦4,250,000", net: "₦3,060,000", employees: 30, status: "Completed", statusColor: COLORS.green },
  { month: "July 2024", gross: "₦4,180,000", net: "₦3,009,600", employees: 29, status: "Processing", statusColor: COLORS.orange },
  { month: "June 2024", gross: "₦4,100,000", net: "₦2,952,000", employees: 28, status: "Completed", statusColor: COLORS.green },
  { month: "May 2024", gross: "₦3,950,000", net: "₦2,844,000", employees: 27, status: "Completed", statusColor: COLORS.green },
  { month: "April 2024", gross: "₦3,900,000", net: "₦2,808,000", employees: 27, status: "Completed", statusColor: COLORS.green },
];

const COLUMNS = ["Month", "Gross Amount", "Net Amount", "Employees", "Status"];

export const PIPayrollHistoryScene: React.FC = () => {
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
        Payroll History
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
        Past payroll runs
      </Interactive.Div>

      {/* Table */}
      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
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
            gridTemplateColumns: "1.5fr 1.2fr 1.2fr 0.8fr 1fr",
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
          const isHighlighted = Math.floor((frame - 3 * fps) / (1.2 * fps)) % 5 === i && frame > 3 * fps;

          return (
            <Interactive.Div
              key={row.month}
              name={`Row-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1.2fr 1.2fr 0.8fr 1fr",
                padding: "18px 28px",
                borderBottom: i < ROWS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                background: isHighlighted ? `${COLORS.accentBright}08` : "transparent",
                opacity: rowOpacity,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>{row.month}</div>
              <div style={{ fontSize: 16, color: COLORS.textMuted, fontFamily: monoFamily }}>{row.gross}</div>
              <div style={{ fontSize: 16, color: COLORS.textMuted, fontFamily: monoFamily }}>{row.net}</div>
              <div style={{ fontSize: 16, color: COLORS.textMuted, textAlign: "center" as const }}>{row.employees}</div>
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
            </Interactive.Div>
          );
        })}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
