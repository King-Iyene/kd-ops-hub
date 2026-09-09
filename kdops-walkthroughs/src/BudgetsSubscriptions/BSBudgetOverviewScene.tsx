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
  { name: "Engineering", budget: "₦2,500,000", percent: 65, used: "₦1,625,000" },
  { name: "Marketing", budget: "₦1,200,000", percent: 82, used: "₦984,000" },
  { name: "Operations", budget: "₦3,000,000", percent: 45, used: "₦1,350,000" },
  { name: "HR & Admin", budget: "₦800,000", percent: 91, used: "₦728,000" },
];

const getBarColor = (percent: number) => {
  if (percent > 90) return COLORS.red;
  if (percent >= 70) return COLORS.orange;
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
          marginBottom: 40,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Monitor spending across every department. Color-coded bars show
        utilization so you can spot overruns before they happen.
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
                  {dept.percent}%
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
                Used: {dept.used} / {dept.budget}
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
