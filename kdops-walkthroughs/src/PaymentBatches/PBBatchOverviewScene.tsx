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

const BATCHES = [
  { batch: "PB-2026-041", date: "5 Sept 2026", employees: 28, amount: "₦4,250,000", status: "Processed", statusColor: COLORS.green },
  { batch: "PB-2026-040", date: "1 Sept 2026", employees: 28, amount: "₦4,250,000", status: "Approved", statusColor: COLORS.accentBright },
  { batch: "PB-2026-039", date: "28 Aug 2026", employees: 12, amount: "₦1,850,000", status: "Pending", statusColor: COLORS.orange },
  { batch: "PB-2026-038", date: "25 Aug 2026", employees: 5, amount: "₦780,000", status: "Draft", statusColor: COLORS.textMuted },
  { batch: "PB-2026-037", date: "20 Aug 2026", employees: 28, amount: "₦4,250,000", status: "Processed", statusColor: COLORS.green },
];

export const PBBatchOverviewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "50px 80px" }}>
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 16, fontFamily: monoFamily, color: COLORS.accentBright, letterSpacing: 2,
          textTransform: "uppercase" as const, marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Batch Overview
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48, fontWeight: 700, color: COLORS.white, marginBottom: 12,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        All payment batches
      </Interactive.Div>

      <Interactive.Div
        name="Stats"
        style={{
          display: "flex", gap: 24, marginBottom: 28,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.green }} />
          <span style={{ fontSize: 16, color: COLORS.textMuted }}>₦12.4M processed this month</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.orange }} />
          <span style={{ fontSize: 16, color: COLORS.textMuted }}>4 pending approval</span>
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: "hidden",
          opacity: interpolate(frame, [0.7 * fps, 1.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1.2fr 1fr", padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          {["BATCH #", "DATE", "EMPLOYEES", "AMOUNT", "STATUS"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {BATCHES.map((b, i) => {
          const delay = 1 + i * 0.15;
          const highlighted = Math.floor((frame - 4 * fps) / (1.2 * fps)) % BATCHES.length === i && frame > 4 * fps;
          return (
            <div
              key={b.batch}
              style={{
                display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1.2fr 1fr",
                padding: "14px 24px",
                borderBottom: i < BATCHES.length - 1 ? `1px solid ${COLORS.border}` : "none",
                background: highlighted ? `${COLORS.accent}22` : "transparent",
                opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, fontFamily: monoFamily, display: "flex", alignItems: "center" }}>{b.batch}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{b.date}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center" }}>{b.employees}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, display: "flex", alignItems: "center", fontFamily: monoFamily }}>{b.amount}</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: b.statusColor,
                  background: `${b.statusColor}22`, padding: "4px 10px", borderRadius: 6,
                }}>
                  {b.status}
                </span>
              </div>
            </div>
          );
        })}
      </Interactive.Div>

      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 20, background: `${COLORS.accent}22`, borderRadius: 10, padding: "14px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.accentBright, fontWeight: 600 }}>
          💡 Click any batch to view the full breakdown by employee.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
