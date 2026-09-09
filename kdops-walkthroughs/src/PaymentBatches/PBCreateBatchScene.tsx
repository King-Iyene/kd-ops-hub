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

const PAYMENT_TYPES = [
  { title: "Contractor Payment", desc: "Partners & vendors", icon: "🤝" },
  { title: "Employee Salary", desc: "Monthly payroll", icon: "💰" },
  { title: "Salary Advance", desc: "Advance against salary", icon: "⏩" },
  { title: "Bonus", desc: "One month, performance", icon: "🎯" },
];

const FORM_FIELDS = [
  { label: "Batch Name", value: "KDS Staff Salary — October 2026" },
  { label: "Payment Date", value: "05/10/2026" },
  { label: "Payment Period", value: "October 2026" },
  { label: "Notes", value: "Monthly salary for KDS Administrative team" },
];

export const PBCreateBatchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Card selection happens at ~2s
  const cardSelected = frame > 2 * fps;
  // Form fields fill in sequentially starting at 3s
  const fieldStartTime = 3;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "40px 60px" }}>
      {/* Header */}
      <Interactive.Div
        name="Header"
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 13, fontFamily: monoFamily, color: COLORS.textMuted }}>Finance → Payments → New Batch</div>
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 32, fontWeight: 700, color: COLORS.white, marginBottom: 6,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        New Payment Batch — Step 1 of 5
      </Interactive.Div>

      <Interactive.Div
        name="StepLabel"
        style={{
          fontSize: 16, color: COLORS.textMuted, marginBottom: 28,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Payment Type & Details — What type of payment is this?
      </Interactive.Div>

      {/* Payment type cards */}
      <Interactive.Div
        name="TypeCards"
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32,
          opacity: interpolate(frame, [0.5 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {PAYMENT_TYPES.map((pt, i) => {
          const isSelected = cardSelected && i === 1; // Employee Salary
          return (
            <div
              key={pt.title}
              style={{
                background: isSelected ? `${COLORS.accent}44` : COLORS.surface,
                border: `2px solid ${isSelected ? COLORS.accentBright : COLORS.border}`,
                borderRadius: 12, padding: "20px 16px", textAlign: "center" as const,
                display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8,
                scale: isSelected
                  ? interpolate(frame, [2 * fps, 2.3 * fps], [1, 1.04], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
                  : 1,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>{pt.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: isSelected ? COLORS.accentBright : COLORS.white }}>{pt.title}</div>
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>{pt.desc}</div>
              {isSelected && (
                <div style={{
                  marginTop: 4, fontSize: 11, fontWeight: 700, color: COLORS.accentBright,
                  background: `${COLORS.accentBright}22`, padding: "3px 10px", borderRadius: 4,
                  opacity: interpolate(frame, [2.2 * fps, 2.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}>
                  ✓ SELECTED
                </div>
              )}
            </div>
          );
        })}
      </Interactive.Div>

      {/* Form fields */}
      <Interactive.Div
        name="FormFields"
        style={{
          background: COLORS.surface, borderRadius: 14, padding: "24px 28px",
          border: `1px solid ${COLORS.border}`,
          opacity: interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {FORM_FIELDS.map((field, i) => {
            const fieldDelay = fieldStartTime + i * 0.5;
            const filled = frame > fieldDelay * fps;
            const isActive = frame > fieldDelay * fps && frame < (fieldDelay + 0.4) * fps;
            return (
              <div key={field.label} style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                <div style={{ fontSize: 12, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>
                  {field.label.toUpperCase()}
                </div>
                <div style={{
                  background: COLORS.bg, borderRadius: 8, padding: "12px 14px",
                  border: `1.5px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                  fontSize: 14, color: filled ? COLORS.white : COLORS.textMuted,
                  minHeight: 20,
                }}>
                  {filled ? field.value : ""}
                  {isActive && <span style={{ color: COLORS.accentBright }}>|</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Interactive.Div>

      {/* Next button */}
      <Interactive.Div
        name="NextButton"
        style={{
          marginTop: 20, display: "flex", justifyContent: "flex-end",
          opacity: interpolate(frame, [5 * fps, 5.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{
          padding: "12px 36px", borderRadius: 8, fontSize: 16, fontWeight: 700,
          background: frame > 5.5 * fps ? COLORS.accentBright : COLORS.accent,
          color: COLORS.white,
          boxShadow: frame > 5.5 * fps ? `0 0 20px ${COLORS.accentBright}44` : "none",
        }}>
          Next →
        </div>
      </Interactive.Div>

      {/* Tip callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 16, background: `${COLORS.accent}22`, borderRadius: 10, padding: "14px 20px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [6 * fps, 6.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.accentBright, fontWeight: 600 }}>
          💡 Tip: Include account details for all employees before running a batch
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
