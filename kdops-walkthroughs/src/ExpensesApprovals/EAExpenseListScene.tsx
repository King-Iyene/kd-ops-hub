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

const EXPENSES = [
  { date: "2024-09-02", description: "Office supplies — Shoprite", category: "Office", amount: "₦45,000", status: "Draft", statusColor: COLORS.textMuted },
  { date: "2024-09-05", description: "Client lunch — Eko Hotel", category: "Meals", amount: "₦120,000", status: "Pending", statusColor: COLORS.orange },
  { date: "2024-09-08", description: "Diesel for generator", category: "Utilities", amount: "₦275,000", status: "Approved", statusColor: COLORS.green },
  { date: "2024-09-10", description: "Staff travel — Abuja flight", category: "Travel", amount: "₦185,000", status: "Rejected", statusColor: COLORS.red },
  { date: "2024-09-12", description: "Software subscription — Slack", category: "Software", amount: "₦62,500", status: "Approved", statusColor: COLORS.green },
];

const COLUMNS = ["Date", "Description", "Category", "Amount", "Status"];

export const EAExpenseListScene: React.FC = () => {
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
        Expense List
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
        All expenses in one view
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 20,
          color: COLORS.textMuted,
          marginBottom: 40,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Every expense logged by your team appears here with real-time status
        tracking from draft to reimbursement.
      </Interactive.Div>

      {/* Table */}
      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          opacity: interpolate(frame, [0.8 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr 120px 130px 120px",
            padding: "16px 24px",
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

        {/* Data rows */}
        {EXPENSES.map((exp, i) => {
          const delay = 1.2 + i * 0.25;
          const rowOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.25) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const rowY = interpolate(
            frame,
            [delay * fps, (delay + 0.25) * fps],
            [10, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
            },
          );

          return (
            <Interactive.Div
              key={exp.date + exp.description}
              name={`Row-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 120px 130px 120px",
                padding: "14px 24px",
                borderBottom:
                  i < EXPENSES.length - 1
                    ? `1px solid ${COLORS.border}`
                    : "none",
                opacity: rowOpacity,
                transform: `translateY(${rowY}px)`,
              }}
            >
              <div style={{ fontSize: 14, color: COLORS.textMuted, fontFamily: monoFamily }}>
                {exp.date}
              </div>
              <div style={{ fontSize: 15, color: COLORS.white, fontWeight: 500 }}>
                {exp.description}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>
                {exp.category}
              </div>
              <div style={{ fontSize: 15, color: COLORS.white, fontWeight: 600 }}>
                {exp.amount}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: exp.statusColor,
                    background: `${exp.statusColor}22`,
                    padding: "4px 12px",
                    borderRadius: 6,
                  }}
                >
                  {exp.status}
                </span>
              </div>
            </Interactive.Div>
          );
        })}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
