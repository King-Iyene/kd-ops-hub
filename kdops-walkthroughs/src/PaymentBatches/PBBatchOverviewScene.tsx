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

const TABS = ["ALL", "AWAITING DISPATCH", "PROCESSING", "DONE", "PARTIAL", "FAILED", "CANCELLED"];

const BATCHES = [
  { desc: "September Contractor Payments", type: "CONTRACTOR", typeColor: COLORS.orange, status: "Processing", statusColor: COLORS.accentBright, amount: "₦1,250,000.00" },
  { desc: "Staff Salary — September 2026", type: "EMPLOYEE", typeColor: COLORS.green, status: "Done", statusColor: COLORS.green, amount: "₦3,440,000.00" },
  { desc: "Fuel Reimbursements — Aug", type: "EMPLOYEE", typeColor: COLORS.green, status: "Awaiting Dispatch", statusColor: COLORS.orange, amount: "₦185,000.00" },
  { desc: "LinkedIn Ads Team Payment", type: "CONTRACTOR", typeColor: COLORS.orange, status: "Partial", statusColor: COLORS.gold, amount: "₦420,000.00" },
];

export const PBBatchOverviewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const highlightRow = frame > 5 * fps ? 2 : -1;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, display: "flex", flexDirection: "column" as const }}>
      {/* Sidebar indicator */}
      <Interactive.Div
        name="SidebarHint"
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 56,
          background: COLORS.surface, borderRight: `1px solid ${COLORS.border}`,
          display: "flex", flexDirection: "column" as const, alignItems: "center", paddingTop: 18, gap: 18,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 8, background: COLORS.accent, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16, color: COLORS.white, fontWeight: 700 }}>K</div>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: `${COLORS.accentBright}22`, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 13 }}>💳</div>
      </Interactive.Div>

      {/* Main content area */}
      <div style={{ marginLeft: 56, padding: "28px 48px", display: "flex", flexDirection: "column" as const, flex: 1 }}>
        {/* Breadcrumb */}
        <Interactive.Div
          name="Breadcrumb"
          style={{
            fontSize: 13, fontFamily: monoFamily, color: COLORS.textMuted, marginBottom: 8,
            opacity: interpolate(frame, [0.1 * fps, 0.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          Finance → Payments
        </Interactive.Div>

        {/* Header row */}
        <Interactive.Div
          name="Header"
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20,
            opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.white }}>Payment Batches</div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{
              padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: COLORS.surface, color: COLORS.textMuted, border: `1px solid ${COLORS.border}`,
            }}>
              Actions ▾
            </div>
            <div style={{
              padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: COLORS.accent, color: COLORS.white,
            }}>
              + New Batch
            </div>
          </div>
        </Interactive.Div>

        {/* Stats row */}
        <Interactive.Div
          name="Stats"
          style={{
            display: "flex", gap: 20, marginBottom: 20,
            opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ background: COLORS.surface, borderRadius: 10, padding: "12px 20px", border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4, fontFamily: monoFamily, letterSpacing: 1 }}>AVAILABLE FOR BATCHES</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.accentBright, fontFamily: monoFamily }}>₦2,576,867.57</div>
          </div>
        </Interactive.Div>

        {/* Filter tabs */}
        <Interactive.Div
          name="Tabs"
          style={{
            display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [1 * fps, 1.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {TABS.map((tab, i) => (
            <div key={tab} style={{
              padding: "10px 16px", fontSize: 12, fontFamily: monoFamily, letterSpacing: 1,
              color: i === 0 ? COLORS.accentBright : COLORS.textMuted,
              borderBottom: i === 0 ? `2px solid ${COLORS.accentBright}` : "2px solid transparent",
              fontWeight: i === 0 ? 700 : 400,
            }}>
              {tab}
            </div>
          ))}
        </Interactive.Div>

        {/* Search bar */}
        <Interactive.Div
          name="Search"
          style={{
            marginBottom: 12,
            opacity: interpolate(frame, [1.3 * fps, 1.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{
            background: COLORS.surface, borderRadius: 8, padding: "10px 16px",
            border: `1px solid ${COLORS.border}`, fontSize: 14, color: COLORS.textMuted,
          }}>
            🔍 Search batches...
          </div>
        </Interactive.Div>

        {/* Table */}
        <Interactive.Div
          name="Table"
          style={{
            background: COLORS.surface, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: "hidden",
            opacity: interpolate(frame, [1.6 * fps, 2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 1.3fr 1.2fr", padding: "12px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
            {["DESCRIPTION", "TYPE", "PAY STATUS", "AMOUNT"].map((h) => (
              <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {BATCHES.map((b, i) => {
            const rowDelay = 2 + i * 0.2;
            return (
              <div
                key={b.desc}
                style={{
                  display: "grid", gridTemplateColumns: "2.5fr 1.2fr 1.3fr 1.2fr",
                  padding: "14px 20px",
                  borderBottom: i < BATCHES.length - 1 ? `1px solid ${COLORS.border}` : "none",
                  background: highlightRow === i ? `${COLORS.accentBright}11` : "transparent",
                  borderLeft: highlightRow === i ? `3px solid ${COLORS.accentBright}` : "3px solid transparent",
                  opacity: interpolate(frame, [rowDelay * fps, (rowDelay + 0.25) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white, display: "flex", alignItems: "center" }}>{b.desc}</div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: b.typeColor,
                    background: `${b.typeColor}18`, padding: "4px 10px", borderRadius: 4, fontFamily: monoFamily, letterSpacing: 0.5,
                  }}>
                    {b.type}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: b.statusColor,
                    background: `${b.statusColor}18`, padding: "4px 10px", borderRadius: 6,
                  }}>
                    {b.status}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: COLORS.white, fontFamily: monoFamily, display: "flex", alignItems: "center" }}>{b.amount}</div>
              </div>
            );
          })}
        </Interactive.Div>

        {/* Callout */}
        <Interactive.Div
          name="Callout"
          style={{
            marginTop: 16, background: `${COLORS.accent}22`, borderRadius: 10, padding: "14px 20px",
            borderLeft: `3px solid ${COLORS.accentBright}`,
            opacity: interpolate(frame, [4 * fps, 4.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ fontSize: 14, color: COLORS.accentBright, fontWeight: 600 }}>
            💡 Click any batch to view the full breakdown by employee.
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
