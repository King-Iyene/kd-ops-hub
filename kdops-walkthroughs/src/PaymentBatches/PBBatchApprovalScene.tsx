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

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const { fontFamily: monoFamily } = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] });

const EMPLOYEES = [
  { name: "Adebayo Johnson", bank: "GTBank • ****4821", amount: "₦450,000.00" },
  { name: "Chioma Okafor", bank: "Access Bank • ****7193", amount: "₦380,000.00" },
  { name: "Emeka Nwosu", bank: "UBA • ****3056", amount: "₦320,000.00" },
];

export const PBBatchApprovalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Status transition: Awaiting Dispatch -> Processing at ~5s
  const approved = frame > 5 * fps;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "40px 60px" }}>
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 13, fontFamily: monoFamily, color: COLORS.textMuted, marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Finance → Payments → KDS Staff Salary — October 2026
      </Interactive.Div>

      {/* Batch header */}
      <Interactive.Div
        name="BatchHeader"
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24,
          opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div>
          <div style={{ fontSize: 32, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
            KDS Staff Salary — October 2026
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{
              fontSize: 12, fontWeight: 700, fontFamily: monoFamily,
              color: COLORS.green, background: `${COLORS.green}18`,
              padding: "4px 10px", borderRadius: 4, letterSpacing: 0.5,
            }}>
              EMPLOYEE
            </span>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: approved ? COLORS.accentBright : COLORS.orange,
              background: approved ? `${COLORS.accentBright}18` : `${COLORS.orange}18`,
              padding: "4px 12px", borderRadius: 6,
            }}>
              {approved ? "Processing" : "Awaiting Dispatch"}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4, fontFamily: monoFamily }}>BATCH TOTAL</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.accentBright, fontFamily: monoFamily }}>₦1,150,000.00</div>
        </div>
      </Interactive.Div>

      {/* Summary cards */}
      <Interactive.Div
        name="SummaryCards"
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24,
          opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {[
          { label: "RECIPIENTS", value: "3 employees" },
          { label: "PAYMENT DATE", value: "05/10/2026" },
          { label: "CREATED BY", value: "Finance Team" },
        ].map((card) => (
          <div key={card.label} style={{
            background: COLORS.surface, borderRadius: 10, padding: "14px 18px",
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>{card.value}</div>
          </div>
        ))}
      </Interactive.Div>

      {/* Employee list table */}
      <Interactive.Div
        name="EmployeeTable"
        style={{
          background: COLORS.surface, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: "hidden",
          opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr", padding: "12px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
          {["EMPLOYEE", "BANK DETAILS", "AMOUNT"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {EMPLOYEES.map((emp, i) => {
          const rowDelay = 1.5 + i * 0.25;
          return (
            <div
              key={emp.name}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr",
                padding: "14px 20px",
                borderBottom: i < EMPLOYEES.length - 1 ? `1px solid ${COLORS.border}` : "none",
                opacity: interpolate(frame, [rowDelay * fps, (rowDelay + 0.2) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, display: "flex", alignItems: "center" }}>{emp.name}</div>
              <div style={{ fontSize: 13, color: COLORS.textMuted, fontFamily: monoFamily, display: "flex", alignItems: "center" }}>{emp.bank}</div>
              <div style={{ fontSize: 15, color: COLORS.accentBright, fontFamily: monoFamily, fontWeight: 600, display: "flex", alignItems: "center" }}>{emp.amount}</div>
            </div>
          );
        })}

        {/* Total row */}
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr",
          padding: "14px 20px", background: `${COLORS.accent}22`, borderTop: `1px solid ${COLORS.border}`,
          opacity: interpolate(frame, [2.5 * fps, 2.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white }}>Total</div>
          <div />
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.accentBright, fontFamily: monoFamily }}>₦1,150,000.00</div>
        </div>
      </Interactive.Div>

      {/* Approve button */}
      <Interactive.Div
        name="ApproveButton"
        style={{
          marginTop: 24, display: "flex", justifyContent: "flex-end",
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{
          padding: "14px 32px", borderRadius: 8, fontSize: 16, fontWeight: 700,
          background: approved ? COLORS.green : COLORS.accent,
          color: COLORS.white,
          boxShadow: frame > 4 * fps && !approved ? `0 0 24px ${COLORS.accentBright}44` : "none",
          border: frame > 4 * fps && !approved ? `2px solid ${COLORS.accentBright}` : "2px solid transparent",
        }}>
          {approved ? "✓ Approved — Processing" : "Review & Approve"}
        </div>
      </Interactive.Div>

      {/* Status transition indicator */}
      {approved && (
        <Interactive.Div
          name="StatusChange"
          style={{
            marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            opacity: interpolate(frame, [5 * fps, 5.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <span style={{ fontSize: 14, color: COLORS.orange, fontWeight: 600, textDecoration: "line-through" }}>Awaiting Dispatch</span>
          <span style={{ fontSize: 18, color: COLORS.textMuted }}>→</span>
          <span style={{ fontSize: 14, color: COLORS.accentBright, fontWeight: 700 }}>Processing</span>
        </Interactive.Div>
      )}

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 16, background: `${COLORS.accent}22`, borderRadius: 10, padding: "14px 20px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [6 * fps, 6.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.accentBright, fontWeight: 600 }}>
          💡 Ensure all employee bank details are correct before approving
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
