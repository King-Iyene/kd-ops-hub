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

interface Task {
  title: string;
  assignee: string;
  initials: string;
  priority: string;
  priorityColor: string;
  due: string;
  done?: boolean;
}

const COLUMNS: { label: string; color: string; tasks: Task[] }[] = [
  {
    label: "To Do",
    color: COLORS.textMuted,
    tasks: [
      {
        title: "Update employee handbook",
        assignee: "Funke Adeyemi",
        initials: "FA",
        priority: "Medium",
        priorityColor: COLORS.orange,
        due: "20 Oct",
      },
      {
        title: "Prepare Q4 budget proposal",
        assignee: "Chioma Okafor",
        initials: "CO",
        priority: "High",
        priorityColor: COLORS.red,
        due: "25 Oct",
      },
    ],
  },
  {
    label: "In Progress",
    color: COLORS.accentBright,
    tasks: [
      {
        title: "Process October contractor payments",
        assignee: "Adebayo Johnson",
        initials: "AJ",
        priority: "High",
        priorityColor: COLORS.red,
        due: "15 Oct",
      },
    ],
  },
  {
    label: "Review",
    color: COLORS.orange,
    tasks: [
      {
        title: "Fleet maintenance audit report",
        assignee: "Tunde Bakare",
        initials: "TB",
        priority: "Medium",
        priorityColor: COLORS.orange,
        due: "12 Oct",
      },
    ],
  },
  {
    label: "Done",
    color: COLORS.green,
    tasks: [
      {
        title: "September payroll reconciliation",
        assignee: "Emeka Nwosu",
        initials: "EN",
        priority: "Low",
        priorityColor: COLORS.green,
        due: "Completed 5 Oct",
        done: true,
      },
    ],
  },
];

export const TATaskBoardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

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
      {/* Breadcrumb */}
      <div
        style={{
          fontSize: 13,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], clamp),
        }}
      >
        Workspace{" "}
        <span style={{ color: COLORS.border }}>/</span>{" "}
        <span style={{ color: COLORS.accentBright }}>Tasks</span>
      </div>

      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], clamp),
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: COLORS.white }}>
          Tasks & Accountability
        </div>
        <div
          style={{
            background: COLORS.accentBright,
            color: COLORS.bg,
            fontWeight: 700,
            fontSize: 14,
            borderRadius: 8,
            padding: "10px 22px",
            cursor: "pointer",
          }}
        >
          + New Task
        </div>
      </div>

      {/* Kanban columns */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {COLUMNS.map((col, colIdx) => {
          const colDelay = 0.5 + colIdx * 0.25;
          return (
            <div
              key={col.label}
              style={{
                flex: 1,
                background: COLORS.surface,
                borderRadius: 14,
                padding: 14,
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                opacity: interpolate(
                  frame,
                  [colDelay * fps, (colDelay + 0.3) * fps],
                  [0, 1],
                  clamp,
                ),
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: col.color,
                    }}
                  />
                  <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white }}>
                    {col.label}
                  </div>
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
                const cardDelay = colDelay + 0.35 + taskIdx * 0.2;
                const cardOpacity = interpolate(
                  frame,
                  [cardDelay * fps, (cardDelay + 0.3) * fps],
                  [0, 1],
                  clamp,
                );
                const cardY = interpolate(
                  frame,
                  [cardDelay * fps, (cardDelay + 0.3) * fps],
                  [16, 0],
                  {
                    ...clamp,
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
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: task.done ? COLORS.textMuted : COLORS.white,
                        marginBottom: 10,
                        textDecoration: task.done ? "line-through" : "none",
                      }}
                    >
                      {task.title}
                    </div>
                    {/* Assignee */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
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
                        {task.initials}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                        {task.assignee}
                      </div>
                    </div>
                    {/* Priority + due date */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: monoFamily,
                          fontWeight: 700,
                          color: task.priorityColor,
                          background: `${task.priorityColor}1A`,
                          borderRadius: 6,
                          padding: "2px 8px",
                        }}
                      >
                        {task.priority}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                        {task.due}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Callout */}
      <div
        style={{
          marginTop: 20,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 24px",
          fontSize: 15,
          color: COLORS.accentBright,
          fontWeight: 500,
          textAlign: "center",
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], clamp),
        }}
      >
        Drag tasks between columns to update their status -- or click to open the full details
      </div>
    </AbsoluteFill>
  );
};
