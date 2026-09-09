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
  { icon: "📋", title: "Review employee list", desc: "Confirm all active employees are included" },
  { icon: "✅", title: "Verify salaries & deductions", desc: "Check base salary, allowances, and deductions" },
  { icon: "📊", title: "Preview payroll summary", desc: "Review total cost, net pay, and deductions breakdown" },
  { icon: "📤", title: "Submit for approval", desc: "Send to finance manager for sign-off" },
  { icon: "💳", title: "Process payment", desc: "Execute bank transfers to employee accounts" },
];

export const PIRunPayrollScene: React.FC = () => {
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
        Step-by-step
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Running a payroll cycle
      </Interactive.Div>

      {/* Vertical step cards */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 0, position: "relative" }}>
        {STEPS.map((step, i) => {
          const delay = 0.6 + i * 0.35;
          const stepOpacity = interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const slideY = interpolate(frame, [delay * fps, (delay + 0.3) * fps], [20, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isActive = Math.floor((frame - 2.5 * fps) / (1.2 * fps)) % 5 === i && frame > 2.5 * fps;

          return (
            <Interactive.Div
              key={step.title}
              name={`Step-${i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
                opacity: stepOpacity,
                transform: `translateY(${slideY}px)`,
              }}
            >
              {/* Left: number + connecting line */}
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", width: 48 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: isActive
                      ? `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`
                      : COLORS.surface,
                    border: `2px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 18,
                    fontWeight: 700,
                    color: isActive ? COLORS.white : COLORS.textMuted,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      height: 24,
                      background: `linear-gradient(180deg, ${COLORS.border}, transparent)`,
                    }}
                  />
                )}
              </div>

              {/* Right: card content */}
              <div
                style={{
                  flex: 1,
                  background: COLORS.surface,
                  borderRadius: 12,
                  padding: "18px 24px",
                  border: `1px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                  marginBottom: i < STEPS.length - 1 ? 0 : 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{step.icon}</span>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white }}>
                    {step.title}
                  </div>
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.4, paddingLeft: 34 }}>
                  {step.desc}
                </div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
