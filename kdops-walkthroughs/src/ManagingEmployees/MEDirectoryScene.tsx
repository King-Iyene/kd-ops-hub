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

const EMPLOYEES = [
  { initials: "KC", name: "Keneth Cyril-Ita", role: "Field Team", dept: "Niger Delta Innovate", color: "#22c55e" },
  { initials: "SO", name: "Sylvester Oputa", role: "Field Team", dept: "Niger Delta Innovate", color: "#3b82f6" },
  { initials: "GM", name: "Gogo Marosi Benson", role: "Field Team", dept: "Niger Delta Innovate", color: "#f59e0b" },
  { initials: "SM", name: "Saviour Minaseidiema", role: "Operations", dept: "KD Squares", color: "#8b5cf6" },
  { initials: "RS", name: "Richard Standford", role: "Operations", dept: "KD Squares", color: "#ef4444" },
  { initials: "PJ", name: "Princewill James", role: "Field Team", dept: "KD Squares", color: "#06b6d4" },
];

export const MEDirectoryScene: React.FC = () => {
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
        Employee Directory
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
        Your team at a glance
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
          <span style={{ fontSize: 16, color: COLORS.textMuted }}>30 active employees</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accentBright }} />
          <span style={{ fontSize: 16, color: COLORS.textMuted }}>2 departments</span>
        </div>
      </Interactive.Div>

      {/* Filter bar */}
      <Interactive.Div
        name="FilterBar"
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          opacity: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, color: COLORS.textMuted, flex: 1 }}>
          🔍 Search by name, email, role...
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, color: COLORS.textMuted }}>
          All roles ▾
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 14, color: COLORS.textMuted }}>
          All departments ▾
        </div>
      </Interactive.Div>

      {/* Employee table */}
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
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 2fr", padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          {["NAME", "ROLE", "DEPARTMENT", "EMAIL"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {EMPLOYEES.map((emp, i) => {
          const delay = 1 + i * 0.15;
          const highlighted = Math.floor((frame - 4 * fps) / (1.2 * fps)) % EMPLOYEES.length === i && frame > 4 * fps;
          return (
            <div
              key={emp.name}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1.5fr 2fr",
                padding: "14px 24px",
                borderBottom: i < EMPLOYEES.length - 1 ? `1px solid ${COLORS.border}` : "none",
                background: highlighted ? `${COLORS.accent}22` : "transparent",
                opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: emp.color, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 13, fontWeight: 700, color: COLORS.white }}>
                  {emp.initials}
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{emp.name}</span>
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{emp.role}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{emp.dept}</div>
              <div style={{ fontSize: 13, color: COLORS.textMuted, display: "flex", alignItems: "center", fontFamily: monoFamily }}>
                {emp.name.split(" ")[0].toLowerCase()}@kdsquares.com
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
          💡 Click any employee row to view their full profile, documents, leave history, and more.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
