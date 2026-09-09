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

const FLOW_STEPS = [
  { label: "Draft", color: COLORS.textMuted, icon: "📝", desc: "Batch created, amounts entered" },
  { label: "Pending", color: COLORS.orange, icon: "⏳", desc: "Submitted, awaiting finance approval" },
  { label: "Approved", color: COLORS.accentBright, icon: "✅", desc: "Finance manager approved" },
  { label: "Processed", color: COLORS.green, icon: "💸", desc: "Payments sent to bank" },
];

export const PBBatchApprovalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Which step is highlighted (cycles through)
  const activeStep = Math.min(Math.floor((frame - 2 * fps) / (1.5 * fps)), 3);

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "50px 80px" }}>
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 16, fontFamily: monoFamily, color: COLORS.gold, letterSpacing: 2,
          textTransform: "uppercase" as const, marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Approval Flow
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48, fontWeight: 700, color: COLORS.white, marginBottom: 48,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        How batches get approved
      </Interactive.Div>

      {/* Flow steps */}
      <Interactive.Div
        name="Flow"
        style={{
          display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 0,
          opacity: interpolate(frame, [0.5 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {FLOW_STEPS.map((step, i) => {
          const isActive = frame > 2 * fps && activeStep >= i;
          return (
            <div key={step.label} style={{ display: "flex", alignItems: "flex-start" }}>
              <div style={{
                display: "flex", flexDirection: "column" as const, alignItems: "center", width: 200,
              }}>
                {/* Icon box */}
                <div style={{
                  width: 72, height: 72, borderRadius: 16,
                  background: isActive ? `${step.color}22` : COLORS.surface,
                  border: `2px solid ${isActive ? step.color : COLORS.border}`,
                  display: "flex", justifyContent: "center", alignItems: "center",
                  fontSize: 32, marginBottom: 14,
                  scale: isActive
                    ? interpolate(frame, [(2 + i * 1.5) * fps, (2.3 + i * 1.5) * fps], [0.8, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
                    : 1,
                }}>
                  {step.icon}
                </div>

                {/* Label */}
                <div style={{
                  fontSize: 18, fontWeight: 700, color: isActive ? step.color : COLORS.textMuted, marginBottom: 6,
                }}>
                  {step.label}
                </div>

                {/* Description */}
                <div style={{
                  fontSize: 13, color: COLORS.textMuted, textAlign: "center" as const, lineHeight: 1.4, maxWidth: 170,
                }}>
                  {step.desc}
                </div>
              </div>

              {/* Arrow connector */}
              {i < FLOW_STEPS.length - 1 && (
                <div style={{
                  display: "flex", alignItems: "center", paddingTop: 24,
                  opacity: interpolate(frame, [(1 + i * 0.4) * fps, (1.3 + i * 0.4) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}>
                  <div style={{
                    width: 40, height: 2,
                    background: isActive && activeStep > i ? COLORS.accentBright : COLORS.border,
                  }} />
                  <div style={{
                    width: 0, height: 0,
                    borderTop: "6px solid transparent", borderBottom: "6px solid transparent",
                    borderLeft: `8px solid ${isActive && activeStep > i ? COLORS.accentBright : COLORS.border}`,
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </Interactive.Div>

      {/* Role note */}
      <Interactive.Div
        name="RoleNote"
        style={{
          marginTop: 48, background: COLORS.surface, borderRadius: 12, padding: "18px 28px",
          border: `1px solid ${COLORS.border}`, textAlign: "center" as const,
          opacity: interpolate(frame, [4 * fps, 4.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.gold, fontWeight: 600, marginBottom: 4 }}>
          Each step requires a different role: Creator → Finance Manager → Super Admin
        </div>
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 20, background: `${COLORS.accent}22`, borderRadius: 10, padding: "14px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [5 * fps, 5.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.accentBright, fontWeight: 600 }}>
          💡 You'll receive notifications at each stage of the approval process.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
