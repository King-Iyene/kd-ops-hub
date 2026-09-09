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

const ACTIONS = [
  { icon: "💳", label: "New Payment", desc: "Create a payment batch or one-off transfer", where: "Takes you to Payment Batches" },
  { icon: "✅", label: "Approvals", desc: "Review pending requests across all modules", where: "Shows all items waiting for your sign-off" },
  { icon: "❤️", label: "Charity", desc: "Set up or manage charitable donations", where: "Takes you to Charity module" },
  { icon: "🧾", label: "Expenses", desc: "Submit or review expense claims", where: "Takes you to Expense management" },
  { icon: "🔄", label: "Subscriptions", desc: "Track recurring service subscriptions", where: "Takes you to Subscriptions list" },
  { icon: "📊", label: "Reports", desc: "Generate financial and ops reports", where: "Takes you to Report builder" },
  { icon: "💰", label: "Payroll", desc: "Run payroll or check salary history", where: "Takes you to Payroll module" },
];

export const DDQuickActionsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cycle highlight through actions to simulate clicking
  const highlightIndex = frame > 3 * fps
    ? Math.floor((frame - 3 * fps) / (1.5 * fps)) % ACTIONS.length
    : -1;

  // Show "clicked" demo for New Payment (index 0) and Approvals (index 1)
  const showNewPaymentDemo = frame > 3.5 * fps && frame < 5.5 * fps;
  const showApprovalsDemo = frame > 6 * fps && frame < 8 * fps;

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
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.green,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step 3 — Quick Actions
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 10,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Shortcuts to the tasks you do most
      </Interactive.Div>

      <Interactive.Div
        name="Subtitle"
        style={{
          fontSize: 18,
          color: COLORS.textMuted,
          marginBottom: 28,
          maxWidth: 650,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Instead of navigating through menus, click any Quick Action to jump straight to the module you need.
      </Interactive.Div>

      {/* Quick Actions Grid — matches real KDOps layout */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white, marginBottom: 14 }}>
          Quick Actions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12 }}>
          {ACTIONS.map((action, i) => {
            const delay = 0.6 + i * 0.15;
            const isHighlighted = highlightIndex === i;
            return (
              <Interactive.Div
                key={action.label}
                name={`Action-${i}`}
                style={{
                  background: isHighlighted ? `${COLORS.accent}55` : COLORS.surface,
                  borderRadius: 12,
                  padding: "18px 10px",
                  textAlign: "center" as const,
                  border: `2px solid ${isHighlighted ? COLORS.accentBright : COLORS.border}`,
                  opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  transition: "border-color 0.2s, background 0.2s",
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 6 }}>{action.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.white }}>
                  {action.label}
                </div>
              </Interactive.Div>
            );
          })}
        </div>
      </div>

      {/* Click demo panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* New Payment demo */}
        <Interactive.Div
          name="NewPaymentDemo"
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: "18px 20px",
            border: `2px solid ${showNewPaymentDemo ? COLORS.accentBright : COLORS.border}`,
            opacity: interpolate(frame, [3 * fps, 3.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>💳</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.white }}>Click "New Payment"</span>
            {showNewPaymentDemo && (
              <span style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.accentBright, background: `${COLORS.accent}44`, padding: "2px 8px", borderRadius: 4 }}>
                ACTIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
            Opens the <span style={{ color: COLORS.white, fontWeight: 600 }}>Payment Batches</span> page where you can create a new salary run, vendor payment, or one-off transfer. You'll pick recipients, enter amounts, and submit for approval.
          </div>
        </Interactive.Div>

        {/* Approvals demo */}
        <Interactive.Div
          name="ApprovalsDemo"
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: "18px 20px",
            border: `2px solid ${showApprovalsDemo ? COLORS.accentBright : COLORS.border}`,
            opacity: interpolate(frame, [3.3 * fps, 3.7 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.white }}>Click "Approvals"</span>
            {showApprovalsDemo && (
              <span style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.accentBright, background: `${COLORS.accent}44`, padding: "2px 8px", borderRadius: 4 }}>
                ACTIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
            Shows <span style={{ color: COLORS.white, fontWeight: 600 }}>all pending items</span> across every module — expense claims, leave requests, payment batches. If something needs your sign-off, it's here.
          </div>
        </Interactive.Div>
      </div>

      {/* What each action does */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {ACTIONS.slice(2).map((action, i) => {
          const delay = 4.5 + i * 0.2;
          return (
            <div
              key={action.label}
              style={{
                fontSize: 12,
                color: COLORS.textMuted,
                lineHeight: 1.4,
                opacity: interpolate(frame, [delay * fps, (delay + 0.25) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <span style={{ fontWeight: 600, color: COLORS.white }}>{action.icon} {action.label}:</span>{" "}
              {action.desc}
            </div>
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
          opacity: interpolate(frame, [5.5 * fps, 5.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.accentBright, marginBottom: 4 }}>
          💡 Quick Actions are shortcuts — they take you directly to the most common tasks
        </div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
          No need to search through the sidebar. Each button jumps straight to the right page so you can get things done faster.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
