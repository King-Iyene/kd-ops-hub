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
  { num: 1, icon: "➕", title: 'Click "Request Leave"', desc: "Top-right of the Leave page" },
  { num: 2, icon: "📋", title: "Select leave type", desc: "Annual, Sick, or Compassionate" },
  { num: 3, icon: "📅", title: "Pick your dates", desc: "Start and end date from calendar" },
  { num: 4, icon: "✍️", title: "Add a reason & submit", desc: "Optional note, then submit for approval" },
];

const FORM_FIELDS = [
  { label: "Leave Type", value: "Annual Leave" },
  { label: "Start Date", value: "15 Sept 2026" },
  { label: "End Date", value: "19 Sept 2026" },
  { label: "Days", value: "5 days" },
  { label: "Reason", value: "Family holiday" },
];

export const LRRequestLeaveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const showStatus = frame > 5 * fps;

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
        Request Leave
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
        Four steps to request leave
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 24 }}>
        {/* Left: Steps */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          {STEPS.map((step, i) => {
            const delay = 0.6 + i * 0.3;
            const cardOpacity = interpolate(
              frame,
              [delay * fps, (delay + 0.3) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            const cardY = interpolate(
              frame,
              [delay * fps, (delay + 0.3) * fps],
              [15, 0],
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
                  borderRadius: 12,
                  padding: "18px 20px",
                  border: `1px solid ${COLORS.border}`,
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  opacity: cardOpacity,
                  transform: `translateY(${cardY}px)`,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${COLORS.accent}33`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  {step.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: monoFamily,
                      color: COLORS.accentBright,
                      letterSpacing: 1.5,
                      marginBottom: 4,
                    }}
                  >
                    STEP {step.num}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white, marginBottom: 3 }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: 14, color: COLORS.textMuted, lineHeight: 1.4 }}>
                    {step.desc}
                  </div>
                </div>
              </Interactive.Div>
            );
          })}
        </div>

        {/* Right: Form mock */}
        <Interactive.Div
          name="FormMock"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            border: `1px solid ${COLORS.border}`,
            padding: "28px 24px",
            opacity: interpolate(frame, [2 * fps, 2.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.white,
              marginBottom: 24,
            }}
          >
            Leave Request Form
          </div>

          {FORM_FIELDS.map((field, i) => {
            const fieldDelay = 2.4 + i * 0.25;
            const fieldOpacity = interpolate(
              frame,
              [fieldDelay * fps, (fieldDelay + 0.25) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            return (
              <div key={field.label} style={{ marginBottom: 16, opacity: fieldOpacity }}>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: monoFamily,
                    color: COLORS.textMuted,
                    letterSpacing: 1,
                    textTransform: "uppercase" as const,
                    marginBottom: 6,
                  }}
                >
                  {field.label}
                </div>
                <div
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 15,
                    color: COLORS.white,
                    fontWeight: 500,
                  }}
                >
                  {field.value}
                </div>
              </div>
            );
          })}

          {/* Submit button */}
          <Interactive.Div
            name="SubmitBtn"
            style={{
              marginTop: 8,
              background: COLORS.accent,
              borderRadius: 10,
              padding: "12px 0",
              textAlign: "center" as const,
              fontSize: 15,
              fontWeight: 700,
              color: COLORS.white,
              opacity: interpolate(frame, [4 * fps, 4.3 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            Submit Request
          </Interactive.Div>

          {/* Status badge */}
          {showStatus && (
            <Interactive.Div
              name="StatusBadge"
              style={{
                marginTop: 14,
                textAlign: "center" as const,
                opacity: interpolate(frame, [5 * fps, 5.4 * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.orange,
                  background: `${COLORS.orange}22`,
                  padding: "6px 16px",
                  borderRadius: 8,
                }}
              >
                ⏳ Pending Approval
              </span>
            </Interactive.Div>
          )}
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
