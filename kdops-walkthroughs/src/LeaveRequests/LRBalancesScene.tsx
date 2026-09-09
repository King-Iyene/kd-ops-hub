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

const BALANCES = [
  { type: "Annual Leave", total: 20, remaining: 15, color: "#22c55e" },
  { type: "Sick Leave", total: 10, remaining: 10, color: "#22c55e" },
  { type: "Compassionate", total: 5, remaining: 5, color: "#22c55e" },
];

const CALENDAR_DAYS = [
  ["", "", "1", "2", "3", "4", "5"],
  ["6", "7", "8", "9", "10", "11", "12"],
  ["13", "14", "15", "16", "17", "18", "19"],
  ["20", "21", "22", "23", "24", "25", "26"],
  ["27", "28", "29", "30", "", "", ""],
];

const HIGHLIGHTED = ["8", "9", "10", "11", "12", "22", "23"];

export const LRBalancesScene: React.FC = () => {
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
        Leave Balances
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Your leave at a glance
      </Interactive.Div>

      {/* Balance cards */}
      <Interactive.Div
        name="BalanceCards"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 20,
          marginBottom: 32,
          opacity: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {BALANCES.map((b, i) => {
          const usedPct = ((b.total - b.remaining) / b.total) * 100;
          return (
            <div
              key={b.type}
              style={{
                background: COLORS.surface,
                borderRadius: 14,
                padding: 24,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 8, fontFamily: monoFamily }}>{b.type}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: b.color }}>{b.remaining}</span>
                <span style={{ fontSize: 18, color: COLORS.textMuted }}>/ {b.total} days</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: `${COLORS.border}` }}>
                <div style={{ height: 6, borderRadius: 3, background: b.color, width: `${100 - usedPct}%` }} />
              </div>
            </div>
          );
        })}
      </Interactive.Div>

      {/* Mini calendar */}
      <Interactive.Div
        name="Calendar"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          padding: 24,
          border: `1px solid ${COLORS.border}`,
          opacity: interpolate(frame, [1.2 * fps, 1.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 16 }}>October 2026</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" as const }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: monoFamily, padding: 6 }}>{d}</div>
          ))}
          {CALENDAR_DAYS.flat().map((day, i) => {
            const isHighlighted = HIGHLIGHTED.includes(day);
            return (
              <div
                key={i}
                style={{
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 6,
                  color: isHighlighted ? COLORS.white : day ? COLORS.textMuted : "transparent",
                  background: isHighlighted ? `${COLORS.accentBright}` : "transparent",
                  fontWeight: isHighlighted ? 700 : 400,
                }}
              >
                {day || " "}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS.accentBright }} />
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>Leave booked</span>
          </div>
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
