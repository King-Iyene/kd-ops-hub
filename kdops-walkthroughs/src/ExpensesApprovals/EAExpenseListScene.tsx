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

const STATS = [
  { label: "Total Pending", value: "3", color: COLORS.orange },
  { label: "Approved This Month", value: "8", color: COLORS.green },
  { label: "Total Spent", value: "₦485,000", color: COLORS.accentBright },
  { label: "Average Claim", value: "₦28,500", color: COLORS.textMuted },
];

const FILTERS = ["All", "Pending", "Approved", "Rejected"];

const COLUMNS = ["Category", "Amount", "Date", "Description", "Submitted By", "Status"];

const EXPENSES = [
  {
    category: "Fuel",
    amount: "₦15,000",
    date: "02/10/2026",
    description: "Office fuel — October",
    submittedBy: "Adebayo Johnson",
    status: "Pending",
    statusColor: COLORS.orange,
  },
  {
    category: "Transport",
    amount: "₦4,500",
    date: "01/10/2026",
    description: "Client meeting transport",
    submittedBy: "Chioma Okafor",
    status: "Approved",
    statusColor: COLORS.green,
  },
  {
    category: "Equipment",
    amount: "₦85,000",
    date: "28/09/2026",
    description: "Laptop charger replacement",
    submittedBy: "Emeka Nwosu",
    status: "Pending",
    statusColor: COLORS.orange,
  },
  {
    category: "General",
    amount: "₦12,000",
    date: "25/09/2026",
    description: "Office supplies",
    submittedBy: "Funke Adeyemi",
    status: "Approved",
    statusColor: COLORS.green,
  },
];

export const EAExpenseListScene: React.FC = () => {
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
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 13,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 12,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Finance{" "}
        <span style={{ color: COLORS.accentBright }}>&rarr;</span>{" "}
        <span style={{ color: COLORS.accentBright }}>Expenses</span>
      </Interactive.Div>

      {/* Header row */}
      <Interactive.Div
        name="Header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          opacity: interpolate(frame, [0.1 * fps, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 38, fontWeight: 700, color: COLORS.white }}>
          Expenses
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              fontSize: 13,
              color: COLORS.textMuted,
              background: COLORS.surface,
            }}
          >
            Export CSV
          </div>
          <div
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              fontSize: 13,
              color: COLORS.textMuted,
              background: COLORS.surface,
            }}
          >
            Approve all
          </div>
          <div
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.white,
              background: COLORS.accent,
            }}
          >
            + New Expense
          </div>
        </div>
      </Interactive.Div>

      {/* Stats cards */}
      <Interactive.Div
        name="Stats"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 14,
          marginBottom: 16,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {STATS.map((s) => (
          <div
            key={s.label}
            style={{
              background: COLORS.surface,
              borderRadius: 10,
              padding: "16px 18px",
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </Interactive.Div>

      {/* Warning banner */}
      <Interactive.Div
        name="Warning"
        style={{
          background: `${COLORS.orange}15`,
          borderRadius: 8,
          padding: "12px 18px",
          borderLeft: `3px solid ${COLORS.orange}`,
          marginBottom: 14,
          opacity: interpolate(frame, [0.6 * fps, 0.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: COLORS.orange }}>
            &#x26A0;&#xFE0F; 1 approved expense can&apos;t be paid
          </span>{" "}
          &mdash; Bank details are missing. Nudge the employee to add their bank information, or contact them directly.
        </div>
      </Interactive.Div>

      {/* Filter tabs */}
      <Interactive.Div
        name="Filters"
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 14,
          opacity: interpolate(frame, [0.7 * fps, 1.0 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {FILTERS.map((f, i) => (
          <div
            key={f}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: i === 0 ? 700 : 400,
              color: i === 0 ? COLORS.accentBright : COLORS.textMuted,
              borderBottom: `2px solid ${i === 0 ? COLORS.accentBright : "transparent"}`,
            }}
          >
            {f}
          </div>
        ))}
      </Interactive.Div>

      {/* Table */}
      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface,
          borderRadius: 10,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          opacity: interpolate(frame, [1.0 * fps, 1.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "90px 90px 100px 1fr 160px 100px",
            padding: "12px 20px",
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          {COLUMNS.map((col) => (
            <div
              key={col}
              style={{
                fontSize: 11,
                fontFamily: monoFamily,
                color: COLORS.accentBright,
                letterSpacing: 1.2,
                textTransform: "uppercase" as const,
              }}
            >
              {col}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {EXPENSES.map((exp, i) => {
          const delay = 1.4 + i * 0.2;
          const rowOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.2) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const rowY = interpolate(
            frame,
            [delay * fps, (delay + 0.2) * fps],
            [8, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
            },
          );

          return (
            <Interactive.Div
              key={exp.description}
              name={`Row-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "90px 90px 100px 1fr 160px 100px",
                padding: "11px 20px",
                borderBottom:
                  i < EXPENSES.length - 1
                    ? `1px solid ${COLORS.border}`
                    : "none",
                opacity: rowOpacity,
                transform: `translateY(${rowY}px)`,
              }}
            >
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                {exp.category}
              </div>
              <div style={{ fontSize: 13, color: COLORS.white, fontWeight: 600 }}>
                {exp.amount}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: monoFamily }}>
                {exp.date}
              </div>
              <div style={{ fontSize: 13, color: COLORS.text }}>
                {exp.description}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                {exp.submittedBy}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: exp.statusColor,
                    background: `${exp.statusColor}22`,
                    padding: "3px 10px",
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

      {/* Bank details callout */}
      <Interactive.Div
        name="BankCallout"
        style={{
          marginTop: 14,
          background: `${COLORS.accent}22`,
          borderRadius: 8,
          padding: "12px 18px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [2.4 * fps, 2.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: COLORS.accentBright }}>
            &#x1F4A1; Tip:
          </span>{" "}
          Make sure your bank details are added in{" "}
          <span style={{ fontWeight: 700, color: COLORS.gold }}>
            My Portal &rarr; Profile
          </span>{" "}
          so you can receive reimbursements.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
