import {
  AbsoluteFill,
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
  { type: "Annual Leave", total: 21, remaining: 15, color: COLORS.green },
  { type: "Sick Leave", total: 10, remaining: 8, color: COLORS.green },
  { type: "Compassionate", total: 5, remaining: 5, color: COLORS.green },
  { type: "Maternity / Paternity", total: 60, remaining: 60, color: COLORS.accentBright },
];

const HISTORY = [
  { name: "Adebayo Johnson", type: "Annual", days: "3 days", dates: "15–17 Oct", status: "Approved" as const },
  { name: "Chioma Okafor", type: "Sick", days: "1 day", dates: "10 Oct", status: "Approved" as const },
  { name: "Emeka Nwosu", type: "Annual", days: "5 days", dates: "20–24 Oct", status: "Pending" as const },
];

const CALENDAR_DAYS = [
  ["", "", "", "1", "2", "3", "4"],
  ["5", "6", "7", "8", "9", "10", "11"],
  ["12", "13", "14", "15", "16", "17", "18"],
  ["19", "20", "21", "22", "23", "24", "25"],
  ["26", "27", "28", "29", "30", "31", ""],
];

// Days with team absences highlighted
const TEAM_ABSENT = ["10", "15", "16", "17", "20", "21", "22", "23", "24"];

export const LRBalancesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = (start: number, dur = 0.4) =>
    interpolate(frame, [start * fps, (start + dur) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 70px",
      }}
    >
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 13,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: fade(0),
        }}
      >
        People &amp; HR &nbsp;→&nbsp; Time &amp; Leave &nbsp;→&nbsp;{" "}
        <span style={{ color: COLORS.accentBright }}>Leave</span>
      </Interactive.Div>

      {/* Header row */}
      <Interactive.Div
        name="Header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          opacity: fade(0.2),
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: COLORS.white }}>
          Leave Management
        </div>
        <div
          style={{
            background: COLORS.accentBright,
            color: COLORS.bg,
            fontWeight: 700,
            fontSize: 15,
            padding: "10px 22px",
            borderRadius: 8,
          }}
        >
          + Request Leave
        </div>
      </Interactive.Div>

      {/* Balance cards */}
      <Interactive.Div
        name="BalanceCards"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 16,
          marginBottom: 24,
          opacity: fade(0.5),
        }}
      >
        {BALANCES.map((b) => {
          const usedPct = ((b.total - b.remaining) / b.total) * 100;
          return (
            <div
              key={b.type}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.textMuted,
                  marginBottom: 6,
                  fontFamily: monoFamily,
                  textTransform: "uppercase" as const,
                  letterSpacing: 1,
                }}
              >
                {b.type}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 34, fontWeight: 700, color: b.color }}>{b.remaining}</span>
                <span style={{ fontSize: 15, color: COLORS.textMuted }}>/ {b.total} days</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: COLORS.border }}>
                <div
                  style={{
                    height: 5,
                    borderRadius: 3,
                    background: b.color,
                    width: `${100 - usedPct}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </Interactive.Div>

      {/* Two-column: calendar + history */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16 }}>
        {/* Mini calendar */}
        <Interactive.Div
          name="Calendar"
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 18,
            border: `1px solid ${COLORS.border}`,
            opacity: fade(1.0),
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
            October 2026 — Team Absences
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 3,
              textAlign: "center" as const,
            }}
          >
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                style={{
                  fontSize: 10,
                  color: COLORS.textMuted,
                  fontFamily: monoFamily,
                  padding: 4,
                }}
              >
                {d}
              </div>
            ))}
            {CALENDAR_DAYS.flat().map((day, i) => {
              const isAbsent = TEAM_ABSENT.includes(day);
              return (
                <div
                  key={i}
                  style={{
                    padding: 6,
                    fontSize: 12,
                    borderRadius: 5,
                    color: isAbsent ? COLORS.white : day ? COLORS.textMuted : "transparent",
                    background: isAbsent ? COLORS.accentBright : "transparent",
                    fontWeight: isAbsent ? 700 : 400,
                  }}
                >
                  {day || " "}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: 3, background: COLORS.accentBright }} />
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>Team member on leave</span>
            </div>
          </div>
        </Interactive.Div>

        {/* Recent leave history table */}
        <Interactive.Div
          name="HistoryTable"
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            overflow: "hidden",
            opacity: fade(1.3),
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>Recent Leave History</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 0.8fr 1.2fr 0.8fr",
              padding: "8px 20px",
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            {["EMPLOYEE", "TYPE", "DURATION", "DATES", "STATUS"].map((h) => (
              <div
                key={h}
                style={{
                  fontSize: 10,
                  fontFamily: monoFamily,
                  color: COLORS.textMuted,
                  letterSpacing: 1,
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {HISTORY.map((row, i) => {
            const statusColor = row.status === "Approved" ? COLORS.green : COLORS.gold;
            return (
              <div
                key={row.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 0.8fr 1.2fr 0.8fr",
                  padding: "12px 20px",
                  borderBottom: i < HISTORY.length - 1 ? `1px solid ${COLORS.border}` : "none",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white }}>{row.name}</div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>{row.type}</div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>{row.days}</div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>{row.dates}</div>
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: statusColor,
                      background: `${statusColor}22`,
                      padding: "3px 10px",
                      borderRadius: 6,
                    }}
                  >
                    {row.status}
                  </span>
                </div>
              </div>
            );
          })}
        </Interactive.Div>
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 18,
          background: `${COLORS.accentBright}12`,
          border: `1px solid ${COLORS.accentBright}44`,
          borderRadius: 10,
          padding: "12px 20px",
          fontSize: 14,
          color: COLORS.accentBright,
          opacity: fade(1.8),
        }}
      >
        💡 Check your leave balance before submitting a request
      </Interactive.Div>
    </AbsoluteFill>
  );
};
