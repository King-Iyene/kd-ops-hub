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

const STEPS = [
  { icon: "📝", title: "Name your budget", desc: "Give it a descriptive name" },
  { icon: "🏢", title: "Select department", desc: "Choose the department this budget covers" },
  { icon: "💰", title: "Set amount", desc: "Define the total budget amount" },
  { icon: "📅", title: "Set period", desc: "Monthly, quarterly, or annual" },
  { icon: "✅", title: "Submit for approval", desc: "Route to finance manager" },
];

export const BSCreateBudgetScene: React.FC = () => {
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
        Create a Budget
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
        5 steps to create a budget
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
        Setting up a new department budget takes under a minute. Follow these
        steps to get started.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {STEPS.map((step, i) => {
          const delay = 0.8 + i * 0.3;
          const cardOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.3) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const slideX = interpolate(
            frame,
            [delay * fps, (delay + 0.3) * fps],
            [40, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          return (
            <Interactive.Div
              key={step.title}
              name={`Step-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                background: COLORS.surface,
                borderRadius: 12,
                padding: "20px 24px",
                border: `1px solid ${COLORS.border}`,
                opacity: cardOpacity,
                transform: `translateX(${slideX}px)`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: `${COLORS.accent}44`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.accentBright,
                  fontFamily: monoFamily,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{step.icon}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted }}>{step.desc}</div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
