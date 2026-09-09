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

export const DDFinanceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const healthScore = Math.round(
    interpolate(frame, [1 * fps, 2.5 * fps], [0, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

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
          color: COLORS.orange,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Financial Overview
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 40,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Financial Health & Cash Burn
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* Financial Health Card */}
        <Interactive.Div
          name="HealthCard"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 32,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.red }} />
            <span style={{ fontSize: 18, fontWeight: 600, color: COLORS.white }}>Financial Health</span>
          </div>

          <div style={{ fontSize: 72, fontWeight: 700, color: COLORS.red, marginBottom: 8 }}>
            {healthScore}
          </div>
          <div style={{ fontSize: 16, color: COLORS.textMuted, marginBottom: 20 }}>out of 100</div>

          {/* Progress bar */}
          <div style={{ background: COLORS.bg, borderRadius: 6, height: 10, marginBottom: 20 }}>
            <div
              style={{
                background: COLORS.red,
                borderRadius: 6,
                height: 10,
                width: `${healthScore}%`,
                minWidth: 4,
              }}
            />
          </div>

          <div style={{ fontSize: 14, color: COLORS.textMuted, lineHeight: 1.6 }}>
            <div>Cash ₦10,000.00 · net burn ₦7,328,421.81/mo</div>
            <div style={{ color: COLORS.red, marginTop: 8 }}>
              ⚠ Critical: 0.0 months of runway. Take action.
            </div>
            <div style={{ color: COLORS.orange, marginTop: 4 }}>
              ⚠ 8 overdue statutory filing(s).
            </div>
          </div>
        </Interactive.Div>

        {/* Cash Burn Card */}
        <Interactive.Div
          name="CashBurnCard"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 32,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [0.9 * fps, 1.3 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.orange }} />
            <span style={{ fontSize: 18, fontWeight: 600, color: COLORS.white }}>30-Day Cash Burn</span>
          </div>

          <div style={{ fontSize: 52, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
            ₦7,198,657
          </div>
          <div style={{ fontSize: 16, color: COLORS.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
            Approved expenses + processed payment batches in the last 30 days.
          </div>

          <div
            style={{
              background: `${COLORS.orange}22`,
              borderRadius: 8,
              padding: "14px 18px",
              fontSize: 14,
              color: COLORS.orange,
              lineHeight: 1.5,
            }}
          >
            This figure combines all approved expenses and payment batches. Use it to track your monthly burn rate and plan accordingly.
          </div>
        </Interactive.Div>
      </div>

      {/* Explanation */}
      <Interactive.Div
        name="Callout"
        style={{
          background: `${COLORS.red}22`,
          borderRadius: 10,
          padding: "18px 24px",
          borderLeft: `3px solid ${COLORS.red}`,
          opacity: interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.red, marginBottom: 6 }}>
          🔴 Score below 50 = Critical
        </div>
        <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>
          Financial Health factors in cash reserves, burn rate, overdue filings, and budget utilisation. A score of 0 means immediate attention is needed — add funds, reduce expenses, or file overdue compliance items.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
