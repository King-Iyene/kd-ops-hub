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

const BALANCES = [
  { type: "Annual Leave", icon: "🌴", total: 20, remaining: 12, color: COLORS.green },
  { type: "Sick Leave", icon: "🏥", total: 10, remaining: 9, color: "#3b82f6" },
  { type: "Compassionate", icon: "💜", total: 5, remaining: 5, color: "#8b5cf6" },
];

// September 2026 starts on Tuesday (index 2)
const SEPT_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const SEPT_START_DAY = 2; // Tuesday = index 2 (Mon=0-based week)
const LEAVE_DAYS = [15, 16, 17, 18, 19]; // highlighted leave days
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const LRLeaveOverviewScene: React.FC = () => {
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
        Leave Overview
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
        Your leave at a glance
      </Interactive.Div>

      {/* Balance cards */}
      <div style={{ display: "flex", gap: 20, marginBottom: 28 }}>
        {BALANCES.map((bal, i) => {
          const delay = 0.6 + i * 0.3;
          const used = bal.total - bal.remaining;
          const pct = (bal.remaining / bal.total) * 100;

          return (
            <Interactive.Div
              key={bal.type}
              name={`Balance-${i}`}
              style={{
                flex: 1,
                background: COLORS.surface,
                borderRadius: 14,
                padding: "24px 20px",
                border: `1px solid ${COLORS.border}`,
                opacity: interpolate(
                  frame,
                  [delay * fps, (delay + 0.3) * fps],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                ),
                transform: `translateY(${interpolate(
                  frame,
                  [delay * fps, (delay + 0.3) * fps],
                  [15, 0],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
                  },
                )}px)`,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{bal.icon}</div>
              <div
                style={{
                  fontSize: 14,
                  color: COLORS.textMuted,
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {bal.type}
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: bal.color,
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {bal.remaining}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: COLORS.textMuted,
                  marginBottom: 14,
                }}
              >
                of {bal.total} days remaining
              </div>
              {/* Progress bar */}
              <div
                style={{
                  height: 6,
                  background: `${bal.color}22`,
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: bal.color,
                    borderRadius: 3,
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.textMuted,
                  marginTop: 6,
                  fontFamily: monoFamily,
                }}
              >
                {used} used · {bal.remaining} left
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Mini calendar */}
      <Interactive.Div
        name="Calendar"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          padding: "20px 24px",
          opacity: interpolate(frame, [2 * fps, 2.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: COLORS.white,
            marginBottom: 14,
          }}
        >
          September 2026
        </div>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              style={{
                fontSize: 11,
                fontFamily: monoFamily,
                color: COLORS.textMuted,
                textAlign: "center" as const,
                padding: "4px 0",
              }}
            >
              {d}
            </div>
          ))}
          {/* Empty cells before Sept 1 */}
          {Array.from({ length: SEPT_START_DAY }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {/* Day cells */}
          {SEPT_DAYS.map((day) => {
            const isLeave = LEAVE_DAYS.includes(day);
            return (
              <div
                key={day}
                style={{
                  fontSize: 13,
                  textAlign: "center" as const,
                  padding: "5px 0",
                  borderRadius: 6,
                  color: isLeave ? COLORS.bg : COLORS.text,
                  background: isLeave ? COLORS.accentBright : "transparent",
                  fontWeight: isLeave ? 700 : 400,
                }}
              >
                {day}
              </div>
            );
          })}
        </div>
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 20,
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "14px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          fontSize: 15,
          color: COLORS.accentBright,
          fontWeight: 500,
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Your leave balance updates in real time as requests are approved.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
