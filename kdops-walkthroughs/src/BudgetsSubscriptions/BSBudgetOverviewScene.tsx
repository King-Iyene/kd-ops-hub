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

const DEPARTMENTS = [
  { name: "Operations", budget: "₦2,500,000", percent: 68, used: "₦1,700,000" },
  { name: "IT", budget: "₦1,800,000", percent: 45, used: "₦810,000" },
  { name: "Marketing", budget: "₦800,000", percent: 82, used: "₦656,000" },
  { name: "HR", budget: "₦600,000", percent: 30, used: "₦180,000" },
];

const getBarColor = (percent: number) => {
  if (percent >= 80) return COLORS.orange;
  if (percent >= 60) return COLORS.gold;
  return COLORS.green;
};

export const BSBudgetOverviewScene: React.FC = () => {
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
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Finance &rarr; Budgets
      </Interactive.Div>

      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 16,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Budget Overview
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 16,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Department budgets at a glance
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 20,
          color: COLORS.textMuted,
          marginBottom: 36,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Each card shows one department's budget, how much has been spent, and
        a colour-coded bar so you can spot overruns instantly.
      </Interactive.Div>

      {/* 2x2 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {DEPARTMENTS.map((dept, i) => {
          const delay = 0.8 + i * 0.3;
          const cardOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.3) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const barWidth = interpolate(
            frame,
            [(delay + 0.2) * fps, (delay + 0.8) * fps],
            [0, dept.percent],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const barColor = getBarColor(dept.percent);

          return (
            <Interactive.Div
              key={dept.name}
              name={`Dept-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 14,
                padding: "28px 24px",
                border: `1px solid ${COLORS.border}`,
                opacity: cardOpacity,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white }}>
                  {dept.name}
                </div>
                <div style={{ fontSize: 14, fontFamily: monoFamily, color: barColor, fontWeight: 700 }}>
                  {dept.percent}% used
                </div>
              </div>

              <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 12 }}>
                Budget: {dept.budget}
              </div>

              {/* Utilization bar */}
              <div
                style={{
                  width: "100%",
                  height: 10,
                  borderRadius: 5,
                  background: `${barColor}22`,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: "100%",
                    borderRadius: 5,
                    background: barColor,
                  }}
                />
              </div>

              <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                Spent: {dept.used} of {dept.budget}
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 24,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          color: COLORS.accentBright,
          lineHeight: 1.5,
          opacity: interpolate(frame, [2.8 * fps, 3.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Monitor your department budget — when it hits 80%, consider pausing
        non-essential spending.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
