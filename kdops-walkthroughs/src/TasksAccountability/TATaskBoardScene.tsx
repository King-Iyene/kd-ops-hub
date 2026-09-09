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

interface Task {
  title: string;
  assignee: string;
  priority: string;
  due: string;
  color: string;
}

const COLUMNS: { label: string; color: string; tasks: Task[] }[] = [
  {
    label: "To Do",
    color: COLORS.textMuted,
    tasks: [
      { title: "Update contractor rates", assignee: "Keneth C.", priority: "High", due: "12 Sept", color: "#ef4444" },
      { title: "Review Q3 expenses", assignee: "Gogo M.", priority: "Medium", due: "15 Sept", color: "#f59e0b" },
    ],
  },
  {
    label: "In Progress",
    color: COLORS.accentBright,
    tasks: [
      { title: "Payroll reconciliation", assignee: "Saviour M.", priority: "High", due: "10 Sept", color: "#ef4444" },
      { title: "Onboard new hires", assignee: "Princewill J.", priority: "Medium", due: "14 Sept", color: "#f59e0b" },
    ],
  },
  {
    label: "Done",
    color: COLORS.green,
    tasks: [
      { title: "Submit compliance docs", assignee: "Richard S.", priority: "Low", due: "8 Sept", color: "#22c55e" },
      { title: "Bank detail updates", assignee: "Sylvester O.", priority: "Low", due: "5 Sept", color: "#22c55e" },
    ],
  },
];

export const TATaskBoardScene: React.FC = () => {
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
        Task Board
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
        Track work across your team
      </Interactive.Div>

      {/* Kanban columns */}
      <div style={{ display: "flex", gap: 20, flex: 1 }}>
        {COLUMNS.map((col, colIdx) => {
          const colDelay = 0.5 + colIdx * 0.3;
          return (
            <Interactive.Div
              key={col.label}
              name={`Column-${colIdx}`}
              style={{
                flex: 1,
                background: COLORS.surface,
                borderRadius: 14,
                padding: 16,
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                flexDirection: "column" as const,
                gap: 12,
                opacity: interpolate(frame, [colDelay * fps, (colDelay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: col.color }}>
                  {col.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: monoFamily,
                    background: `${col.color}22`,
                    color: col.color,
                    borderRadius: 8,
                    padding: "2px 10px",
                    fontWeight: 700,
                  }}
                >
                  {col.tasks.length}
                </div>
              </div>

              {/* Task cards */}
              {col.tasks.map((task, taskIdx) => {
                const cardDelay = colDelay + 0.4 + taskIdx * 0.25;
                const cardOpacity = interpolate(
                  frame,
                  [cardDelay * fps, (cardDelay + 0.3) * fps],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                const cardY = interpolate(
                  frame,
                  [cardDelay * fps, (cardDelay + 0.3) * fps],
                  [16, 0],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
                  },
                );

                return (
                  <div
                    key={task.title}
                    style={{
                      background: COLORS.bgLight,
                      borderRadius: 10,
                      padding: 14,
                      border: `1px solid ${COLORS.border}`,
                      opacity: cardOpacity,
                      transform: `translateY(${cardY}px)`,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, marginBottom: 10 }}>
                      {task.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: `${COLORS.accent}66`,
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          fontSize: 10,
                          color: COLORS.white,
                          fontWeight: 700,
                        }}
                      >
                        {task.assignee.charAt(0)}
                      </div>
                      <div style={{ fontSize: 13, color: COLORS.textMuted }}>{task.assignee}</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: monoFamily,
                          fontWeight: 700,
                          color: task.color,
                          background: `${task.color}1A`,
                          borderRadius: 6,
                          padding: "2px 8px",
                        }}
                      >
                        {task.priority}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted }}>{task.due}</div>
                    </div>
                  </div>
                );
              })}
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          position: "absolute",
          bottom: 50,
          left: 80,
          right: 80,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 24px",
          fontSize: 16,
          color: COLORS.accentBright,
          fontWeight: 500,
          textAlign: "center" as const,
          opacity: interpolate(frame, [3.5 * fps, 4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Drag and drop tasks between columns to update their status.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
