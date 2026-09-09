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

const STEPS = [
  { num: "1", title: 'Click "+ New Batch"', desc: "Top-right of Payment Batches page" },
  { num: "2", title: "Select employees", desc: "Choose which employees to include" },
  { num: "3", title: "Enter amounts", desc: "Verify or adjust each payment amount" },
  { num: "4", title: "Review & submit", desc: "Check totals, then submit for approval" },
];

const EMPLOYEES = [
  { name: "Keneth Cyril-Ita", amount: "₦350,000" },
  { name: "Gogo Marosi", amount: "₦320,000" },
  { name: "Saviour Minaseidiema", amount: "₦380,000" },
  { name: "Princewill James", amount: "₦310,000" },
];

export const PBCreateBatchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "50px 80px" }}>
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 16, fontFamily: monoFamily, color: COLORS.green, letterSpacing: 2,
          textTransform: "uppercase" as const, marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Creating a Batch
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48, fontWeight: 700, color: COLORS.white, marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        How to create a payment batch
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          {STEPS.map((step, i) => {
            const delay = 0.5 + i * 0.4;
            const isActive = Math.floor((frame - 3 * fps) / (1.5 * fps)) % 4 === i && frame > 3 * fps;
            return (
              <Interactive.Div
                key={step.num}
                name={`Step-${i}`}
                style={{
                  display: "flex", gap: 16, alignItems: "flex-start",
                  background: isActive ? `${COLORS.accent}22` : COLORS.surface,
                  borderRadius: 12, padding: "18px 20px",
                  border: `1px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                  opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: isActive ? COLORS.accentBright : COLORS.accent,
                  display: "flex", justifyContent: "center", alignItems: "center",
                  fontSize: 16, fontWeight: 700, color: COLORS.white, flexShrink: 0,
                }}>
                  {step.num}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontSize: 14, color: COLORS.textMuted }}>{step.desc}</div>
                </div>
              </Interactive.Div>
            );
          })}
        </div>

        {/* Preview panel */}
        <Interactive.Div
          name="Preview"
          style={{
            background: COLORS.surface, borderRadius: 14, padding: 28,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.white, marginBottom: 20 }}>
            + New Batch
          </div>

          {/* Employee table */}
          <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${COLORS.border}`, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", padding: "10px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>EMPLOYEE</div>
              <div style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, textAlign: "right" as const }}>AMOUNT</div>
            </div>
            {EMPLOYEES.map((emp, i) => {
              const fillDelay = 2 + i * 0.3;
              const filled = frame > fillDelay * fps;
              return (
                <div
                  key={emp.name}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr", padding: "10px 16px",
                    borderBottom: i < EMPLOYEES.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    background: filled ? "transparent" : `${COLORS.bg}`,
                  }}
                >
                  <div style={{ fontSize: 14, color: filled ? COLORS.white : COLORS.textMuted }}>{filled ? emp.name : ""}</div>
                  <div style={{ fontSize: 14, color: filled ? COLORS.accentBright : COLORS.textMuted, fontFamily: monoFamily, textAlign: "right" as const }}>{filled ? emp.amount : ""}</div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "12px 16px",
            background: `${COLORS.accent}22`, borderRadius: 8, marginBottom: 20,
            opacity: interpolate(frame, [3.5 * fps, 4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.accentBright, fontFamily: monoFamily }}>₦1,360,000</span>
          </div>

          {/* Submit button */}
          <div style={{
            background: frame > 5 * fps ? COLORS.green : COLORS.accent,
            borderRadius: 8, padding: "12px 24px", textAlign: "center" as const,
            fontSize: 16, fontWeight: 600, color: COLORS.white,
            opacity: interpolate(frame, [4 * fps, 4.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}>
            {frame > 5 * fps ? "Submitted for Approval ✓" : "Submit for Approval →"}
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
