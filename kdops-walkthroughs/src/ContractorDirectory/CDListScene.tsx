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
  { initials: "CA", name: "Chidi Amaechi", company: "TechServe Nigeria", type: "Fixed-term", rate: "₦450,000/mo", status: "Active", color: "#22c55e" },
  { initials: "FO", name: "Funke Oladipo", company: "BrightPath Consulting", type: "Retainer", rate: "₦600,000/mo", status: "Active", color: "#3b82f6" },
  { initials: "EB", name: "Emeka Bassey", company: "TechServe Nigeria", type: "Project-based", rate: "₦1,200,000", status: "Active", color: "#f59e0b" },
  { initials: "NK", name: "Ngozi Kalu", company: "BrightPath Consulting", type: "Fixed-term", rate: "₦350,000/mo", status: "Expiring", color: "#8b5cf6" },
  { initials: "TO", name: "Tunde Osei", company: "Apex Solutions", type: "Retainer", rate: "₦500,000/mo", status: "Active", color: "#06b6d4" },
];

export const CDListScene: React.FC = () => {
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
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Contractor Directory
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 12,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Your contractors at a glance
      </Interactive.Div>

      <Interactive.Div
        name="Stats"
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 28,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.green }} />
          <span style={{ fontSize: 16, color: COLORS.textMuted }}>12 active contractors</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accentBright }} />
          <span style={{ fontSize: 16, color: COLORS.textMuted }}>3 companies</span>
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
          opacity: interpolate(frame, [0.7 * fps, 1.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 0.8fr", padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          {["NAME", "COMPANY", "CONTRACT TYPE", "RATE", "STATUS"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {CONTRACTORS.map((c, i) => {
          const delay = 1 + i * 0.15;
          const highlighted = Math.floor((frame - 4 * fps) / (1.2 * fps)) % CONTRACTORS.length === i && frame > 4 * fps;
          return (
            <div
              key={c.name}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 0.8fr",
                padding: "14px 24px",
                borderBottom: i < CONTRACTORS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                background: highlighted ? `${COLORS.accent}22` : "transparent",
                opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: c.color, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 13, fontWeight: 700, color: COLORS.white }}>
                  {c.initials}
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{c.company}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{c.type}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center", fontFamily: monoFamily }}>{c.rate}</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: c.status === "Active" ? COLORS.green : COLORS.gold,
                  background: c.status === "Active" ? `${COLORS.green}22` : `${COLORS.gold}22`,
                  padding: "4px 10px",
                  borderRadius: 6,
                }}>
                  {c.status}
                </span>
              </div>
            </div>
          );
        })}
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 20,
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "14px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.accentBright, fontWeight: 600, marginBottom: 4 }}>
          💡 Click any contractor to view their contract details, payment history, and documents.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
