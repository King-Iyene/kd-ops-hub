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
  { name: "Dashboard", icon: "📊", desc: "" },
  { name: "Approvals", icon: "✅", desc: "", badge: "3" },
  { name: "My Portal", icon: "🏠", desc: "" },
  { name: "Finance", icon: "💰", desc: "Payments, Payroll, Expenses, Budgets, Compliance", group: true },
  { name: "People & HR", icon: "👥", desc: "Employees, Contractors, Leave", group: true },
  { name: "Operations", icon: "🚛", desc: "Fleet, Vendors", group: true },
  { name: "Workspace", icon: "📋", desc: "Tasks", group: true },
  { name: "CRM", icon: "🤝", desc: "Clients & Contacts", group: true },
  { name: "Admin", icon: "⚙️", desc: "Settings & Audit", group: true },
  { name: "Platform Guide", icon: "📖", desc: "Video tutorials & help", highlight: true },
];

// Finance sub-items shown when Finance is expanded
const FINANCE_SUBS = ["Payments", "Payroll", "Expenses", "Budgets", "Compliance"];

export const SidebarScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Each module highlights in sequence starting at 2s, ~0.8s each
  const highlightIndex = Math.floor((frame - 2 * fps) / (0.8 * fps));
  // Finance expand happens when Finance is highlighted (index 3)
  const financeExpanded = highlightIndex >= 3 && frame > 2 * fps;
  // Platform Guide is last item (index 9)
  const platformGuideHighlighted = highlightIndex === 9;

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
        Step 3 — Sidebar Navigation
      </Interactive.Div>

      {/* Sidebar */}
      <Interactive.Div
        name="Sidebar"
        style={{
          width: 300,
          background: COLORS.bgLight,
          borderRight: `1px solid ${COLORS.border}`,
          padding: "28px 0",
          display: "flex",
          flexDirection: "column" as const,
          height: "100%",
          overflowY: "hidden" as const,
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", marginBottom: 24 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>KD</span>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white }}>KDOps</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Operations Platform</div>
          </div>
        </div>

        {/* Nav items */}
        {MODULES.map((mod, i) => {
          const delay = 0.5 + i * 0.12;
          const isHighlighted = highlightIndex === i && frame > 2 * fps;
          const isPlatformGuide = mod.name === "Platform Guide";
          return (
            <div key={mod.name}>
              <Interactive.Div
                name={`Nav-${mod.name}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 20px",
                  background: isHighlighted
                    ? isPlatformGuide
                      ? `${COLORS.gold}22`
                      : COLORS.surface
                    : "transparent",
                  borderLeft: isHighlighted
                    ? `3px solid ${isPlatformGuide ? COLORS.gold : COLORS.accentBright}`
                    : "3px solid transparent",
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
                <span style={{ fontSize: 16 }}>{mod.icon}</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: isHighlighted ? 600 : 400,
                      color: isHighlighted
                        ? isPlatformGuide
                          ? COLORS.gold
                          : COLORS.white
                        : COLORS.text,
                    }}
                  >
                    {mod.name}
                  </div>
                </div>
                {mod.badge && (
                  <div
                    style={{
                      background: COLORS.orange,
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
                {mod.group && (
                  <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                    {isHighlighted && mod.name === "Finance" ? "▾" : "▸"}
                  </span>
                )}
              </Interactive.Div>

              {/* Finance sub-items expand */}
              {mod.name === "Finance" && financeExpanded && (
                <div
                  style={{
                    overflow: "hidden",
                    maxHeight: interpolate(
                      frame,
                      [Math.min(highlightIndex === 3 ? frame : 2 * fps + 3 * 0.8 * fps, 2 * fps + 3 * 0.8 * fps + 0.4 * fps - 1), 2 * fps + 3 * 0.8 * fps + 0.4 * fps],
                      [0, FINANCE_SUBS.length * 32],
                      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    ),
                  }}
                >
                  {FINANCE_SUBS.map((sub, si) => (
                    <div
                      key={sub}
                      style={{
                        padding: "6px 20px 6px 52px",
                        fontSize: 13,
                        color: COLORS.textMuted,
                        opacity: interpolate(
                          frame,
                          [2 * fps + 3 * 0.8 * fps + si * 0.1 * fps, 2 * fps + 3 * 0.8 * fps + (si * 0.1 + 0.2) * fps],
                          [0, 1],
                          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                        ),
                      }}
                    >
                      {sub}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Interactive.Div>

      {/* Right side — explanation and callouts */}
      <div style={{ flex: 1, padding: "80px 60px", display: "flex", flexDirection: "column" as const, justifyContent: "center" }}>
        <Interactive.Div
          name="ExplainTitle"
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: COLORS.white,
            marginBottom: 20,
            opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Everything in the sidebar
        </Interactive.Div>

        <Interactive.Div
          name="ExplainDesc"
          style={{
            fontSize: 19,
            color: COLORS.textMuted,
            lineHeight: 1.6,
            maxWidth: 520,
            opacity: interpolate(frame, [1.3 * fps, 1.8 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          The sidebar is your main menu. Every part of KDOps — Finance, HR, Operations, CRM, and more — lives here. Click any section to expand it and see all the options inside.
        </Interactive.Div>

        {/* Current highlight label */}
        {highlightIndex >= 0 && highlightIndex < MODULES.length && frame > 2 * fps && (
          <Interactive.Div
            name="CurrentHighlight"
            style={{
              marginTop: 32,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: "16px 24px",
              maxWidth: 520,
              opacity: interpolate(
                frame,
                [2 * fps, 2 * fps + 0.3 * fps],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              ),
            }}
          >
            <div style={{ fontSize: 13, color: COLORS.accentBright, fontFamily: monoFamily, letterSpacing: 1, marginBottom: 4 }}>
              NOW VIEWING
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.white }}>
              {MODULES[highlightIndex]?.icon} {MODULES[highlightIndex]?.name}
            </div>
            {MODULES[highlightIndex]?.desc && (
              <div style={{ fontSize: 14, color: COLORS.textMuted, marginTop: 4 }}>
                {MODULES[highlightIndex].desc}
              </div>
            )}
          </Interactive.Div>
        )}

        {/* Callout 1 */}
        <Interactive.Div
          name="SidebarCallout1"
          style={{
            marginTop: 28,
            background: COLORS.gold,
            borderRadius: 10,
            padding: "14px 20px",
            fontSize: 15,
            color: COLORS.bg,
            fontWeight: 500,
            maxWidth: 520,
            lineHeight: 1.5,
            opacity: interpolate(frame, [3.5 * fps, 4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [3.5 * fps, 4 * fps],
              ["20px 0px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }
            ),
          }}
        >
          💡 Everything you need is in the sidebar — click any section to expand it and see all the options
        </Interactive.Div>

        {/* Callout 2 — Platform Guide */}
        <Interactive.Div
          name="SidebarCallout2"
          style={{
            marginTop: 16,
            background: `${COLORS.gold}22`,
            border: `1px solid ${COLORS.gold}44`,
            borderRadius: 10,
            padding: "14px 20px",
            fontSize: 15,
            color: COLORS.gold,
            fontWeight: 500,
            maxWidth: 520,
            lineHeight: 1.5,
            opacity: interpolate(frame, [platformGuideHighlighted ? frame : 9 * fps, (platformGuideHighlighted ? frame : 9 * fps) + 0.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          💡 Click "Platform Guide" in the sidebar to find video tutorials for every module
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
