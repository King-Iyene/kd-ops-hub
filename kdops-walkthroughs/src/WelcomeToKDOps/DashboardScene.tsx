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

const StatCard: React.FC<{
  label: string;
  value: string;
  subtitle: string;
  color: string;
  delay: number;
}> = ({ label, value, subtitle, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Interactive.Div
      name={`Stat-${label}`}
      style={{
        background: COLORS.surface,
        borderRadius: 12,
        padding: "20px 24px",
        border: `1px solid ${COLORS.border}`,
        flex: 1,
        opacity: interpolate(frame, [delay * fps, (delay + 0.4) * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(
          frame,
          [delay * fps, (delay + 0.4) * fps],
          ["0px 20px", "0px 0px"],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }
        ),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, letterSpacing: 1, textTransform: "uppercase" as const }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.white, fontFamily: monoFamily }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>{subtitle}</div>
    </Interactive.Div>
  );
};

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 80px",
      }}
    >
      {/* Scene label */}
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 18,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 12,
          opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step 2 — Your Dashboard
      </Interactive.Div>

      {/* Header bar mock */}
      <Interactive.Div
        name="HeaderBar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
          opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div>
          <div style={{ fontSize: 14, color: COLORS.textMuted, fontFamily: monoFamily, letterSpacing: 1 }}>
            OPERATIONS OVERVIEW
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, color: COLORS.white, marginTop: 4 }}>
            Welcome, King.
          </div>
          <div style={{ fontSize: 16, color: COLORS.textMuted }}>
            Here's the pulse of the system. · Wednesday, 9 September
          </div>
        </div>
        <div
          style={{
            background: COLORS.gold,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 700,
            color: COLORS.bg,
            fontFamily: monoFamily,
          }}
        >
          SUPER ADMIN
        </div>
      </Interactive.Div>

      {/* Stat cards row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Employees" value="30" subtitle="Active on payroll" color={COLORS.accentBright} delay={0.8} />
        <StatCard label="Total Disbursed" value="₦1.34M" subtitle="This month" color={COLORS.green} delay={1.0} />
        <StatCard label="Pending Approvals" value="5" subtitle="Across all modules" color={COLORS.orange} delay={1.2} />
        <StatCard label="Fleet Fuel" value="₦0.00" subtitle="This week" color={COLORS.accentBright} delay={1.4} />
      </div>

      {/* Bottom row — Health + Cash Burn + Quick Actions */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Financial Health */}
        <Interactive.Div
          name="HealthCard"
          style={{
            flex: 1,
            background: COLORS.surface,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [1.8 * fps, 2.2 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
            🔥 Financial Health
          </div>
          <div style={{ fontSize: 56, fontWeight: 700, color: COLORS.red, fontFamily: monoFamily }}>
            0
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMuted }}>out of 100</div>
          <div style={{ height: 6, background: COLORS.bgLight, borderRadius: 3, marginTop: 12 }}>
            <div style={{ height: 6, background: COLORS.red, borderRadius: 3, width: "2%" }} />
          </div>
        </Interactive.Div>

        {/* Cash Burn */}
        <Interactive.Div
          name="CashBurn"
          style={{
            flex: 1,
            background: COLORS.surface,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [2.0 * fps, 2.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
            🔥 30-Day Cash Burn
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: COLORS.white, fontFamily: monoFamily }}>
            ₦7.19M
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
            Approved expenses + processed payments
          </div>
        </Interactive.Div>

        {/* Quick Actions */}
        <Interactive.Div
          name="QuickActions"
          style={{
            flex: 1,
            background: COLORS.surface,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [2.2 * fps, 2.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white, marginBottom: 16 }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 12 }}>
            {["New Payment", "Approvals", "Clients", "Subscriptions", "Reports", "Payroll"].map(
              (action) => (
                <div
                  key={action}
                  style={{
                    width: 80,
                    textAlign: "center" as const,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: COLORS.bgLight,
                      border: `1px solid ${COLORS.border}`,
                      margin: "0 auto 6px",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 18,
                    }}
                  >
                    {action === "New Payment" ? "+" : action === "Approvals" ? "✓" : action === "Clients" ? "👥" : action === "Subscriptions" ? "📅" : action === "Reports" ? "📊" : "💰"}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>{action}</div>
                </div>
              )
            )}
          </div>
        </Interactive.Div>
      </div>

      {/* Highlight callout */}
      <Interactive.Div
        name="DashboardCallout"
        style={{
          position: "absolute",
          bottom: 50,
          left: 80,
          right: 80,
          background: `linear-gradient(90deg, ${COLORS.accent}CC, transparent)`,
          borderRadius: 10,
          padding: "16px 24px",
          fontSize: 18,
          color: COLORS.white,
          fontWeight: 500,
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        📌 The dashboard gives you a real-time snapshot of your entire operation — employees, payments, approvals, and financial health at a glance.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
