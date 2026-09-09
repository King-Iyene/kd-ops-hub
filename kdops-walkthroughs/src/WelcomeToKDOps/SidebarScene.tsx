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

const MODULES = [
  { name: "Dashboard", icon: "📊", desc: "Your command centre" },
  { name: "Approvals", icon: "✅", desc: "Unified inbox for all approvals", badge: "5" },
  { name: "My Portal", icon: "🏠", desc: "Your personal space" },
  { name: "Finance", icon: "💰", desc: "Payments, payroll & treasury", badge: "99+", group: true, count: "15" },
  { name: "People & HR", icon: "👥", desc: "Staff, leave & compliance", group: true, count: "19" },
  { name: "Operations", icon: "🚛", desc: "Fleet & vendor management", group: true, count: "3" },
  { name: "Workspace", icon: "📋", desc: "Tasks, docs & reports", group: true, count: "8" },
  { name: "CRM", icon: "🤝", desc: "Clients, contacts & outreach", group: true, count: "5" },
  { name: "Admin", icon: "⚙️", desc: "Settings & audit controls", group: true, count: "5" },
];

export const SidebarScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        display: "flex",
      }}
    >
      {/* Scene label */}
      <Interactive.Div
        name="SceneLabel"
        style={{
          position: "absolute",
          top: 40,
          right: 80,
          fontSize: 18,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step 3 — Navigation
      </Interactive.Div>

      {/* Sidebar mock */}
      <Interactive.Div
        name="Sidebar"
        style={{
          width: 320,
          background: COLORS.bgLight,
          borderRight: `1px solid ${COLORS.border}`,
          padding: "32px 0",
          display: "flex",
          flexDirection: "column" as const,
          height: "100%",
          opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(
            frame,
            [0.2 * fps, 0.6 * fps],
            ["-40px 0px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }
          ),
        }}
      >
        {/* KDOps logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 24px", marginBottom: 28 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>KD</span>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white }}>KDOps</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Operations</div>
          </div>
        </div>

        {/* Nav items */}
        {MODULES.map((mod, i) => {
          const delay = 0.6 + i * 0.15;
          const isHighlighted = Math.floor((frame - 2 * fps) / (1.2 * fps)) === i && frame > 2 * fps;
          return (
            <Interactive.Div
              key={mod.name}
              name={`Nav-${mod.name}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: mod.group ? "10px 24px" : "8px 24px",
                background: isHighlighted ? COLORS.surface : "transparent",
                borderLeft: isHighlighted ? `3px solid ${COLORS.accentBright}` : "3px solid transparent",
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: interpolate(
                  frame,
                  [delay * fps, (delay + 0.3) * fps],
                  ["-20px 0px", "0px 0px"],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }
                ),
              }}
            >
              <span style={{ fontSize: 18 }}>{mod.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: isHighlighted ? 600 : 400, color: isHighlighted ? COLORS.white : COLORS.text }}>
                  {mod.name}
                </div>
                {mod.group && (
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>{mod.desc}</div>
                )}
              </div>
              {mod.badge && (
                <div
                  style={{
                    background: mod.badge === "99+" ? COLORS.red : COLORS.orange,
                    borderRadius: 10,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: COLORS.white,
                  }}
                >
                  {mod.badge}
                </div>
              )}
              {mod.count && (
                <div style={{ fontSize: 13, color: COLORS.textMuted, fontFamily: monoFamily }}>
                  {mod.count}
                </div>
              )}
            </Interactive.Div>
          );
        })}
      </Interactive.Div>

      {/* Right side explanation */}
      <div style={{ flex: 1, padding: "80px 60px", display: "flex", flexDirection: "column" as const, justifyContent: "center" }}>
        <Interactive.Div
          name="ExplainTitle"
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: COLORS.white,
            marginBottom: 24,
            opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Everything in one sidebar
        </Interactive.Div>

        <Interactive.Div
          name="ExplainDesc"
          style={{
            fontSize: 20,
            color: COLORS.textMuted,
            lineHeight: 1.6,
            maxWidth: 500,
            opacity: interpolate(frame, [1.3 * fps, 1.8 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Your sidebar adapts to your role. Admins see everything. Finance teams see payments and payroll. Field staff see fleet and expenses.
        </Interactive.Div>

        <Interactive.Div
          name="RoleBadges"
          style={{
            display: "flex",
            gap: 12,
            marginTop: 32,
            flexWrap: "wrap" as const,
            opacity: interpolate(frame, [2 * fps, 2.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {["Super Admin", "Admin", "Finance", "Operations", "Field Staff", "Driver"].map(
            (role) => (
              <div
                key={role}
                style={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 14,
                  color: COLORS.textMuted,
                  fontFamily: monoFamily,
                }}
              >
                {role}
              </div>
            )
          )}
        </Interactive.Div>

        <Interactive.Div
          name="SidebarCallout"
          style={{
            marginTop: 40,
            background: `${COLORS.gold}22`,
            border: `1px solid ${COLORS.gold}44`,
            borderRadius: 10,
            padding: "16px 20px",
            fontSize: 16,
            color: COLORS.gold,
            fontWeight: 500,
            maxWidth: 500,
            opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          💡 Modules are grouped — click a group like "Finance" to expand and see its sub-pages (Payments, Payroll, Subscriptions, etc.)
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
