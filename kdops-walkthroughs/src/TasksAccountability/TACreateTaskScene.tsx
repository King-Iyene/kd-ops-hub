import {
  AbsoluteFill,
  Easing,
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

const PRIORITY_OPTIONS = [
  { label: "Low", color: COLORS.green },
  { label: "Medium", color: COLORS.orange },
  { label: "High", color: COLORS.red, selected: true },
  { label: "Urgent", color: "#dc2626" },
];

const CATEGORY_OPTIONS = ["Finance", "HR", "Operations", "IT", "General"];

const FORM_FIELDS: {
  label: string;
  value: string;
  type?: "text" | "textarea" | "dropdown" | "date" | "priority" | "category";
}[] = [
  { label: "Task Title", value: "Prepare monthly expense report", type: "text" },
  {
    label: "Description",
    value:
      "Compile all approved expenses for October and prepare summary for management review",
    type: "textarea",
  },
  { label: "Assign To", value: "Chioma Okafor", type: "dropdown" },
  { label: "Due Date", value: "30/10/2026", type: "date" },
  { label: "Priority", value: "High", type: "priority" },
  { label: "Category", value: "Finance", type: "category" },
  { label: "Attachments (optional)", value: "No file chosen", type: "text" },
];

export const TACreateTaskScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clamp = {
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
  };

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "48px 64px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Scene label */}
      <div
        style={{
          fontSize: 16,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], clamp),
        }}
      >
        Create Task
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 24,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], clamp),
        }}
      >
        Create a new task step-by-step
      </div>

      {/* Click "+ New Task" indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          opacity: interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], clamp),
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: COLORS.accentBright,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.bg,
          }}
        >
          +
        </div>
        <div style={{ fontSize: 15, color: COLORS.textMuted }}>
          Click{" "}
          <span style={{ color: COLORS.accentBright, fontWeight: 700 }}>
            "+ New Task"
          </span>{" "}
          at the top of the Tasks page to open this form
        </div>
      </div>

      {/* Form panel */}
      <div
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          padding: 28,
          border: `1px solid ${COLORS.border}`,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflow: "hidden",
          opacity: interpolate(frame, [0.7 * fps, 1.0 * fps], [0, 1], clamp),
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: COLORS.accentBright,
            fontFamily: monoFamily,
            marginBottom: 2,
          }}
        >
          NEW TASK
        </div>

        {/* Form fields */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px 20px",
          }}
        >
          {FORM_FIELDS.map((field, i) => {
            const fieldDelay = 1.0 + i * 0.25;
            const fieldOpacity = interpolate(
              frame,
              [fieldDelay * fps, (fieldDelay + 0.25) * fps],
              [0, 1],
              clamp,
            );
            // Title, Description, and Attachments span full width
            const fullWidth =
              field.label === "Task Title" ||
              field.label === "Description" ||
              field.label.startsWith("Attachments");

            return (
              <div
                key={field.label}
                style={{
                  gridColumn: fullWidth ? "1 / -1" : undefined,
                  opacity: fieldOpacity,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    fontFamily: monoFamily,
                    letterSpacing: 1,
                    marginBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {field.label}
                </div>

                {field.type === "priority" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <div
                        key={opt.label}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          border: `1.5px solid ${opt.selected ? opt.color : COLORS.border}`,
                          background: opt.selected ? `${opt.color}22` : COLORS.bgLight,
                          color: opt.selected ? opt.color : COLORS.textMuted,
                        }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                ) : field.type === "category" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <div
                        key={cat}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          border: `1.5px solid ${cat === field.value ? COLORS.accentBright : COLORS.border}`,
                          background:
                            cat === field.value
                              ? `${COLORS.accent}33`
                              : COLORS.bgLight,
                          color:
                            cat === field.value
                              ? COLORS.accentBright
                              : COLORS.textMuted,
                        }}
                      >
                        {cat}
                      </div>
                    ))}
                  </div>
                ) : field.type === "textarea" ? (
                  <div
                    style={{
                      background: COLORS.bgLight,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: COLORS.white,
                      border: `1px solid ${COLORS.border}`,
                      lineHeight: 1.5,
                      minHeight: 48,
                    }}
                  >
                    {field.value}
                  </div>
                ) : field.type === "dropdown" ? (
                  <div
                    style={{
                      background: COLORS.bgLight,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: COLORS.white,
                      border: `1px solid ${COLORS.border}`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: `${COLORS.accent}88`,
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          fontSize: 10,
                          color: COLORS.white,
                          fontWeight: 700,
                        }}
                      >
                        CO
                      </div>
                      {field.value}
                    </div>
                    <span style={{ color: COLORS.textMuted, fontSize: 12 }}>
                      &#9662;
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      background: COLORS.bgLight,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      color:
                        field.value === "No file chosen"
                          ? COLORS.textMuted
                          : COLORS.white,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    {field.value}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create Task button */}
        <div
          style={{
            marginTop: 8,
            opacity: interpolate(
              frame,
              [3.0 * fps, 3.3 * fps],
              [0, 1],
              clamp,
            ),
          }}
        >
          <div
            style={{
              display: "inline-flex",
              background: COLORS.accentBright,
              color: COLORS.bg,
              fontWeight: 700,
              fontSize: 15,
              borderRadius: 8,
              padding: "12px 32px",
              cursor: "pointer",
            }}
          >
            Create Task
          </div>
        </div>
      </div>

      {/* Callouts */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            background: `${COLORS.accent}33`,
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: 14,
            color: COLORS.accentBright,
            fontWeight: 500,
            textAlign: "center",
            opacity: interpolate(frame, [3.5 * fps, 4.0 * fps], [0, 1], clamp),
          }}
        >
          Set a realistic due date and assign a clear owner -- accountability starts with clarity
        </div>
        <div
          style={{
            flex: 1,
            background: `${COLORS.accent}33`,
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: 14,
            color: COLORS.accentBright,
            fontWeight: 500,
            textAlign: "center",
            opacity: interpolate(frame, [4.0 * fps, 4.5 * fps], [0, 1], clamp),
          }}
        >
          Use the Priority field to help your team focus on what matters most
        </div>
      </div>
    </AbsoluteFill>
  );
};
