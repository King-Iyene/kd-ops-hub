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

const CONTRACTORS = [
  { initials: "TS", company: "TechServe Solutions", service: "IT Consulting", status: "Active", frequency: "Monthly", rate: "₦850,000/mo", color: "#3b82f6" },
  { initials: "CP", company: "CleanPro Services", service: "Facility Management", status: "Active", frequency: "Monthly", rate: "₦250,000/mo", color: "#22c55e" },
  { initials: "AC", company: "Adebayo & Co Legal", service: "Legal Services", status: "Active", frequency: "Quarterly", rate: "₦180,000/qtr", color: "#f59e0b" },
  { initials: "FL", company: "FastTrack Logistics", service: "Delivery Services", status: "Active", frequency: "Per Job", rate: "Varies", color: "#8b5cf6" },
];

export const CDContractorListScene: React.FC = () => {
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
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <span style={{ color: COLORS.accentBright }}>People & HR</span>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: COLORS.accentBright }}>Core HR</span>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: COLORS.white }}>Contractors</span>
      </Interactive.Div>

      {/* Header row */}
      <Interactive.Div
        name="Header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 42, fontWeight: 700, color: COLORS.white }}>
          Contractor Directory
        </div>
        <div
          style={{
            background: COLORS.accentBright,
            color: COLORS.bg,
            padding: "12px 24px",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + Add Contractor
        </div>
      </Interactive.Div>

      {/* Stats row */}
      <Interactive.Div
        name="Stats"
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 18,
          opacity: interpolate(frame, [0.4 * fps, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.green }} />
          <span style={{ fontSize: 14, color: COLORS.textMuted }}>4 Active Contractors</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accentBright }} />
          <span style={{ fontSize: 14, color: COLORS.textMuted }}>Paid via Contractor Payment Batches</span>
        </div>
      </Interactive.Div>

      {/* Search & filter bar */}
      <Interactive.Div
        name="FilterBar"
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, color: COLORS.textMuted, flex: 1 }}>
          🔍 Search contractors by name, service...
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, color: COLORS.textMuted }}>
          Service Category ▾
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, color: COLORS.textMuted }}>
          Status ▾
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, color: COLORS.textMuted }}>
          Frequency ▾
        </div>
      </Interactive.Div>

      {/* Contractor table */}
      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          opacity: interpolate(frame, [0.8 * fps, 1.2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 0.8fr 1fr 1fr", padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          {["CONTRACTOR", "SERVICE", "STATUS", "FREQUENCY", "RATE"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {CONTRACTORS.map((c, i) => {
          const delay = 1.2 + i * 0.2;
          const highlighted = Math.floor((frame - 4 * fps) / (1.2 * fps)) % CONTRACTORS.length === i && frame > 4 * fps;
          return (
            <div
              key={c.company}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 0.8fr 1fr 1fr",
                padding: "14px 24px",
                borderBottom: i < CONTRACTORS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                background: highlighted ? `${COLORS.accent}22` : "transparent",
                opacity: interpolate(frame, [delay * fps, (delay + 0.25) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: c.color, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 13, fontWeight: 700, color: COLORS.white }}>
                  {c.initials}
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{c.company}</span>
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{c.service}</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.green,
                  background: `${COLORS.green}22`,
                  padding: "4px 10px",
                  borderRadius: 6,
                }}>
                  {c.status}
                </span>
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{c.frequency}</div>
              <div style={{ fontSize: 14, color: COLORS.white, display: "flex", alignItems: "center", fontFamily: monoFamily, fontWeight: 600 }}>{c.rate}</div>
            </div>
          );
        })}
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 16,
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "14px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.accentBright, fontWeight: 600 }}>
          💡 Click any contractor to view their full profile, payment history, and contract details
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
