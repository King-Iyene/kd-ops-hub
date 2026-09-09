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
  { num: 1, icon: "➕", title: 'Click "+ New Task"', desc: "Top-right of Tasks page" },
  { num: 2, icon: "📝", title: "Enter task details", desc: "Title and description" },
  { num: 3, icon: "👤", title: "Assign & set priority", desc: "Pick an employee and priority level" },
  { num: 4, icon: "📅", title: "Set due date & save", desc: "Choose deadline, then create" },
];

const FORM_FIELDS = [
  { label: "Task Title", value: "Review Q4 budget forecast" },
  { label: "Assignee", value: "Keneth Cyril-Ita" },
  { label: "Priority", value: "High" },
  { label: "Due Date", value: "30 Sept 2026" },
  { label: "Description", value: "Review and approve the Q4 budget..." },
  { label: "Status", value: "To Do" },
];

export const TACreateTaskScene: React.FC = () => {
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
        Create Task
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
        How to create a task
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {/* Steps (left) */}
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
                  padding: "20px 20px",
                  border: `1px solid ${COLORS.border}`,
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
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
                    fontSize: 24,
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
                      marginBottom: 4,
                    }}
                  >
                    STEP {step.num}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
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

        {/* Form preview (right) */}
        <Interactive.Div
          name="FormPreview"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 28,
            border: `1px solid ${COLORS.border}`,
            display: "flex",
            flexDirection: "column" as const,
            gap: 16,
            opacity: interpolate(frame, [1.2 * fps, 1.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.accentBright, fontFamily: monoFamily, marginBottom: 4 }}>
            NEW TASK
          </div>
          {FORM_FIELDS.map((field, i) => {
            const fieldDelay = 1.4 + i * 0.15;
            return (
              <div
                key={field.label}
                style={{
                  opacity: interpolate(frame, [fieldDelay * fps, (fieldDelay + 0.2) * fps], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: monoFamily, letterSpacing: 1, marginBottom: 4 }}>
                  {field.label.toUpperCase()}
                </div>
                <div
                  style={{
                    background: COLORS.bgLight,
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 14,
                    color: COLORS.white,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  {field.value}
                </div>
              </div>
            );
          })}
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
