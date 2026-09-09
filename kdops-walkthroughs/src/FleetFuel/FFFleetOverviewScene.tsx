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

const TABS = [
  "Dashboard",
  "My Requests",
  "Fuel",
  "Trips",
  "Vehicles",
  "Maintenance",
];

const STATS = [
  { label: "Active Vehicles", value: "5", color: COLORS.green },
  { label: "Pending Fuel Requests", value: "3", color: COLORS.orange },
  { label: "Anomalies", value: "2", color: COLORS.red },
];

const ALERTS = [
  "Office Toyota Hilux (KD-001AB): service due 15/10/2026",
  "Office Honda Accord (KD-002CD): service due 01/12/2026",
];

const DASHBOARD_CARDS = [
  { label: "Fuel spend this month", value: "₦185,000", color: COLORS.gold },
  { label: "Fuel spend this week", value: "₦42,000", color: COLORS.accentBright },
  { label: "Avg cost/km", value: "₦85", color: COLORS.white },
  { label: "Fleet budget used", value: "68%", color: COLORS.green },
];

const WEEK_BARS = [
  { label: "Wk 1", value: 50 },
  { label: "Wk 2", value: 72 },
  { label: "Wk 3", value: 88 },
  { label: "Wk 4", value: 65 },
  { label: "Wk 5", value: 55 },
  { label: "Wk 6", value: 78 },
  { label: "Wk 7", value: 62 },
  { label: "Wk 8", value: 42 },
];

export const FFFleetOverviewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
      }}
    >
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 12,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ color: COLORS.accentBright }}>Operations</span>
        <span style={{ margin: "0 8px" }}>{"›"}</span>
        <span style={{ color: COLORS.white }}>Fleet</span>
      </Interactive.Div>

      {/* Header with stats */}
      <Interactive.Div
        name="Header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          opacity: interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.white }}>
          Fleet Dashboard
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {STATS.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "8px 16px",
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
                {s.value}
              </span>
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </Interactive.Div>

      {/* Alert banners */}
      {ALERTS.map((alert, i) => (
        <Interactive.Div
          key={alert}
          name={`Alert-${i}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: `${COLORS.orange}18`,
            border: `1px solid ${COLORS.orange}55`,
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 8,
            fontSize: 14,
            color: COLORS.orange,
            opacity: interpolate(
              frame,
              [(0.5 + i * 0.2) * fps, (0.8 + i * 0.2) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>{alert}</span>
        </Interactive.Div>
      ))}

      {/* Tab bar */}
      <Interactive.Div
        name="TabBar"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `2px solid ${COLORS.border}`,
          marginTop: 12,
          marginBottom: 20,
          opacity: interpolate(frame, [0.8 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {TABS.map((tab, i) => (
          <div
            key={tab}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: i === 0 ? 700 : 400,
              color: i === 0 ? COLORS.accentBright : COLORS.textMuted,
              borderBottom:
                i === 0 ? `2px solid ${COLORS.accentBright}` : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {tab}
          </div>
        ))}
      </Interactive.Div>

      {/* Dashboard cards */}
      <Interactive.Div
        name="DashCards"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 16,
          marginBottom: 20,
          opacity: interpolate(frame, [1.1 * fps, 1.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {DASHBOARD_CARDS.map((card) => (
          <div
            key={card.label}
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: "20px 22px",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontFamily: monoFamily,
                color: COLORS.textMuted,
                letterSpacing: 1,
                textTransform: "uppercase" as const,
                marginBottom: 8,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: card.color,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </Interactive.Div>

      {/* Fuel spend chart */}
      <Interactive.Div
        name="FuelChart"
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: "20px 24px",
          opacity: interpolate(frame, [1.5 * fps, 1.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.white,
            marginBottom: 16,
          }}
        >
          Fuel spend — last 8 weeks
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 14,
            height: 80,
          }}
        >
          {WEEK_BARS.map((bar, i) => {
            const barDelay = 1.9 + i * 0.1;
            const barHeight = interpolate(
              frame,
              [barDelay * fps, (barDelay + 0.35) * fps],
              [0, bar.value],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }
            );
            return (
              <div
                key={bar.label}
                style={{
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "center",
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: barHeight,
                    background: `linear-gradient(180deg, ${COLORS.accentBright}, ${COLORS.accent})`,
                    borderRadius: 4,
                  }}
                />
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: monoFamily,
                    color: COLORS.textMuted,
                    marginTop: 6,
                  }}
                >
                  {bar.label}
                </div>
              </div>
            );
          })}
        </div>
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: `${COLORS.accentBright}12`,
          border: `1px solid ${COLORS.accentBright}33`,
          borderRadius: 10,
          padding: "14px 20px",
          marginTop: 16,
          opacity: interpolate(frame, [2.6 * fps, 3.0 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ fontSize: 20 }}>💡</span>
        <span style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.5 }}>
          Check the dashboard regularly to track fuel spending and upcoming
          vehicle maintenance
        </span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
