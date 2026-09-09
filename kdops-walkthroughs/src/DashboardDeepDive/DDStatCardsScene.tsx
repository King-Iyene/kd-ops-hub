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

const STATS = [
  {
    label: "TOTAL EMPLOYEES",
    value: "28",
    sub: "Active on payroll",
    sub2: "This month",
    color: COLORS.accentBright,
    icon: "👥",
    explain: "How many people are currently on payroll this month. If someone joins or leaves, this number updates.",
  },
  {
    label: "TOTAL DISBURSED",
    value: "₦4,850,000",
    sub: "This month",
    sub2: "",
    color: COLORS.gold,
    icon: "💰",
    explain: "The total amount paid out this month — salaries, reimbursements, vendor payments, everything.",
  },
  {
    label: "PENDING APPROVALS",
    value: "3",
    sub: "Across all modules",
    sub2: "",
    color: COLORS.orange,
    icon: "⏳",
    explain: "Items waiting for someone to approve — could be expenses, leave requests, or payment batches.",
  },
  {
    label: "FLEET FUEL SPEND",
    value: "₦185,000",
    sub: "This month",
    sub2: "",
    color: COLORS.green,
    icon: "⛽",
    explain: "Total fuel spend across company vehicles this month. Tracked automatically from fuel logs.",
  },
];

export const DDStatCardsScene: React.FC = () => {
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
      {/* Dashboard header mock */}
      <Interactive.Div
        name="DashboardHeader"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.white }}>
            Good morning!
          </div>
          <div style={{ fontSize: 16, color: COLORS.textMuted }}>
            Here's the pulse of the system.
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            fontFamily: monoFamily,
            color: COLORS.accentBright,
            letterSpacing: 2,
            textTransform: "uppercase" as const,
          }}
        >
          Dashboard
        </div>
      </Interactive.Div>

      {/* Scene label */}
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
          marginTop: 16,
          opacity: interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step 1 — KPI Cards
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 24,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        These four cards tell you what's happening right now
      </Interactive.Div>

      {/* Stat cards row — mimics actual KDOps layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {STATS.map((stat, i) => {
          const delay = 0.7 + i * 0.25;
          const cardOpacity = interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isHighlighted =
            Math.floor((frame - 3 * fps) / (2 * fps)) % 4 === i && frame > 3 * fps;

          return (
            <Interactive.Div
              key={stat.label}
              name={`Stat-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 14,
                padding: "22px 20px",
                border: `2px solid ${isHighlighted ? stat.color : COLORS.border}`,
                opacity: cardOpacity,
                transition: "border-color 0.3s",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontFamily: monoFamily,
                  color: stat.color,
                  letterSpacing: 1.5,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>{stat.icon}</span>
                {stat.label}
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.white, marginBottom: 6 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>{stat.sub}</div>
              {stat.sub2 ? (
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{stat.sub2}</div>
              ) : null}
            </Interactive.Div>
          );
        })}
      </div>

      {/* Explanation cards — what each means */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {STATS.map((stat, i) => {
          const delay = 2.2 + i * 0.3;
          return (
            <Interactive.Div
              key={`explain-${stat.label}`}
              name={`Explain-${i}`}
              style={{
                background: `${stat.color}15`,
                borderRadius: 10,
                padding: "14px 18px",
                borderLeft: `3px solid ${stat.color}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: stat.color, marginBottom: 4 }}>
                {stat.icon} {stat.label}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
                {stat.explain}
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "16px 20px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [4 * fps, 4.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.accentBright, marginBottom: 4 }}>
          💡 These cards update in real-time — check them daily to stay on top of operations
        </div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
          You don't need to refresh the page. As your team processes payments, onboards staff, or logs fuel — the numbers change automatically.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
