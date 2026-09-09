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
  { num: 1, icon: "📝", title: "Fill expense details", desc: "Enter amount, date, vendor, and description" },
  { num: 2, icon: "📎", title: "Attach receipt", desc: "Upload photo or PDF of the receipt" },
  { num: 3, icon: "🏷️", title: "Select category", desc: "Choose from predefined expense categories" },
  { num: 4, icon: "🚀", title: "Submit for approval", desc: "Route to your manager for review" },
];

export const EASubmitExpenseScene: React.FC = () => {
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
        Submit Expense
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
        Four steps to submit
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 20,
          color: COLORS.textMuted,
          marginBottom: 48,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Filing an expense takes under a minute. Follow these steps to get your
        claim into the approval queue.
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {STEPS.map((step, i) => {
          const delay = 0.8 + i * 0.35;
          const cardOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.3) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const cardY = interpolate(
            frame,
            [delay * fps, (delay + 0.3) * fps],
            [20, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
            },
          );

          return (
            <Interactive.Div
              key={step.num}
              name={`Step-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 14,
                padding: "28px 24px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                gap: 20,
                alignItems: "flex-start",
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: `${COLORS.accent}33`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 28,
                  flexShrink: 0,
                }}
              >
                {step.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: monoFamily,
                    color: COLORS.accentBright,
                    letterSpacing: 1.5,
                    marginBottom: 6,
                  }}
                >
                  STEP {step.num}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: COLORS.white,
                    marginBottom: 6,
                  }}
                >
                  {step.title}
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.4 }}>
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
