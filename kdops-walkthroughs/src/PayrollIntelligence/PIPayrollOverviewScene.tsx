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

const SIDEBAR_ITEMS = [
  { icon: "🏠", label: "Home", active: false },
  { icon: "👥", label: "People", active: false },
  { icon: "📅", label: "Attendance", active: false },
  { icon: "💰", label: "Finance", active: true, children: [
    { label: "Payroll", active: true },
    { label: "Expenses", active: false },
    { label: "Invoices", active: false },
  ]},
  { icon: "📊", label: "Reports", active: false },
];

const TABS = ["Dashboard", "Runs", "Pay groups", "Setup", "Reports"];

export const PIPayrollOverviewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        display: "flex",
        flexDirection: "row" as const,
      }}
    >
      {/* Sidebar */}
      <Interactive.Div
        name="Sidebar"
        style={{
          width: 220,
          background: COLORS.surface,
          borderRight: `1px solid ${COLORS.border}`,
          padding: "24px 0",
          display: "flex",
          flexDirection: "column" as const,
          flexShrink: 0,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* Logo area */}
        <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.accentBright }}>KDOps</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>KD Squares</div>
        </div>

        {SIDEBAR_ITEMS.map((item) => (
          <div key={item.label}>
            <div
              style={{
                padding: "10px 20px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: item.active ? `${COLORS.accent}44` : "transparent",
                borderLeft: item.active ? `3px solid ${COLORS.accentBright}` : "3px solid transparent",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ fontSize: 14, color: item.active ? COLORS.accentBright : COLORS.textMuted, fontWeight: item.active ? 600 : 400 }}>
                {item.label}
              </span>
            </div>
            {item.children && item.children.map((child) => (
              <div
                key={child.label}
                style={{
                  padding: "8px 20px 8px 52px",
                  fontSize: 13,
                  color: child.active ? COLORS.white : COLORS.textMuted,
                  fontWeight: child.active ? 600 : 400,
                  background: child.active ? `${COLORS.accentBright}15` : "transparent",
                }}
              >
                {child.label}
              </div>
            ))}
          </div>
        ))}
      </Interactive.Div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" }}>
        {/* Header with breadcrumbs */}
        <Interactive.Div
          name="Header"
          style={{
            padding: "20px 40px",
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            opacity: interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4 }}>
              Finance &gt; Payroll
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.white }}>Payroll</div>
          </div>
          <div
            style={{
              background: COLORS.accentBright,
              color: COLORS.bg,
              padding: "10px 20px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + New payroll run
          </div>
        </Interactive.Div>

        {/* Alert banner */}
        <Interactive.Div
          name="AlertBanner"
          style={{
            margin: "16px 40px 0",
            padding: "14px 20px",
            background: `${COLORS.gold}18`,
            border: `1px solid ${COLORS.gold}55`,
            borderRadius: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            opacity: interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontSize: 14, color: COLORS.gold }}>
              Monthly — KD Squares payroll due in 26 days
            </span>
          </div>
          <div
            style={{
              background: COLORS.gold,
              color: COLORS.bg,
              padding: "6px 16px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Start cycle
          </div>
        </Interactive.Div>

        {/* Tabs */}
        <Interactive.Div
          name="Tabs"
          style={{
            display: "flex",
            gap: 0,
            padding: "0 40px",
            marginTop: 20,
            borderBottom: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [0.5 * fps, 0.8 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {TABS.map((tab, i) => (
            <div
              key={tab}
              style={{
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: i === 0 ? 700 : 400,
                color: i === 0 ? COLORS.accentBright : COLORS.textMuted,
                borderBottom: i === 0 ? `2px solid ${COLORS.accentBright}` : "2px solid transparent",
              }}
            >
              {tab}
            </div>
          ))}
        </Interactive.Div>

        {/* Dashboard content */}
        <div style={{ padding: "24px 40px", flex: 1, overflow: "hidden" }}>
          {/* Draft run card */}
          <Interactive.Div
            name="DraftRunCard"
            style={{
              background: COLORS.surface,
              borderRadius: 14,
              padding: "24px 28px",
              border: `1px solid ${COLORS.border}`,
              marginBottom: 20,
              opacity: interpolate(frame, [0.8 * fps, 1.1 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: COLORS.orange,
                      background: `${COLORS.orange}22`,
                      padding: "3px 10px",
                      borderRadius: 12,
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Draft Run
                  </span>
                  <span style={{ fontSize: 13, color: COLORS.textMuted }}>October 2026</span>
                </div>
                <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.white, marginBottom: 6 }}>
                  {"₦"}4,850,000.00
                </div>
                <div style={{ fontSize: 14, color: COLORS.textMuted }}>28 employees included</div>
              </div>
              <div
                style={{
                  background: COLORS.accentBright,
                  color: COLORS.bg,
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Review & approve
              </div>
            </div>
          </Interactive.Div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            {[
              { label: "Active employees on payroll", value: "28", color: COLORS.accentBright },
              { label: "Pay groups", value: "5", color: COLORS.gold },
              { label: "Next pay", value: "5 Oct", color: COLORS.green },
            ].map((stat, i) => {
              const delay = 1.2 + i * 0.2;
              return (
                <Interactive.Div
                  key={stat.label}
                  name={`Stat-${i}`}
                  style={{
                    background: COLORS.surface,
                    borderRadius: 12,
                    padding: "20px 24px",
                    border: `1px solid ${COLORS.border}`,
                    opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  <div style={{ fontSize: 12, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" as const }}>
                    {stat.label}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: stat.color }}>{stat.value}</div>
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
              padding: "18px 24px",
              borderLeft: `3px solid ${COLORS.accentBright}`,
              opacity: interpolate(frame, [2 * fps, 2.4 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>
              <span style={{ color: COLORS.accentBright, fontWeight: 700 }}>💡 Tip: </span>
              The dashboard gives you a quick overview of your payroll status and upcoming runs.
              Check it regularly to make sure no payroll cycle is missed.
            </div>
          </Interactive.Div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
