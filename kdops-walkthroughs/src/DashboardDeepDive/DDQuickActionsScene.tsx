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
  { icon: "➕", label: "New Payment", desc: "Create a new payment batch or one-off payment" },
  { icon: "✅", label: "Approvals", desc: "Review and approve pending requests" },
  { icon: "👥", label: "Clients", desc: "View and manage your client directory" },
  { icon: "🔄", label: "Subscriptions", desc: "Track and manage recurring subscriptions" },
  { icon: "📄", label: "Reports", desc: "Generate financial and operations reports" },
  { icon: "💰", label: "Payroll", desc: "Run payroll or view payroll history" },
];

const RENEWALS = [
  { name: "Google One", amount: "₦40,000", status: "overdue", date: "18/08/2026" },
  { name: "OpenAI API Quota", amount: "₦20,000", status: "overdue", date: "20/08/2026" },
  { name: "YouTube", amount: "₦1,800", status: "overdue", date: "21/08/2026" },
  { name: "Claude AI", amount: "₦138,000", status: "overdue", date: "23/08/2026" },
];

export const DDQuickActionsScene: React.FC = () => {
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
          color: COLORS.green,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Quick Actions & Renewals
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        One-click shortcuts & reminders
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32 }}>
        {/* Quick Actions Grid */}
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.white, marginBottom: 16 }}>
            Quick Actions
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {ACTIONS.map((action, i) => {
              const delay = 0.6 + i * 0.2;
              const highlighted = Math.floor((frame - 3 * fps) / (1 * fps)) % 6 === i && frame > 3 * fps;
              return (
                <Interactive.Div
                  key={action.label}
                  name={`Action-${i}`}
                  style={{
                    background: highlighted ? `${COLORS.accent}44` : COLORS.surface,
                    borderRadius: 12,
                    padding: "20px 16px",
                    textAlign: "center" as const,
                    border: `1px solid ${highlighted ? COLORS.accentBright : COLORS.border}`,
                    opacity: interpolate(frame, [delay * fps, (delay + 0.25) * fps], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{action.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white, marginBottom: 4 }}>
                    {action.label}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>
                    {action.desc}
                  </div>
                </Interactive.Div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Renewals */}
        <Interactive.Div
          name="Renewals"
          style={{
            opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.white, marginBottom: 16 }}>
            Upcoming Renewals
          </div>
          <div style={{ background: COLORS.surface, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
            {RENEWALS.map((r, i) => (
              <div
                key={r.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 20px",
                  borderBottom: i < RENEWALS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>{r.date} · {r.status}</div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>{r.amount}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: monoFamily,
                      color: COLORS.orange,
                      background: `${COLORS.orange}22`,
                      padding: "2px 8px",
                      borderRadius: 4,
                      marginTop: 4,
                      display: "inline-block",
                    }}
                  >
                    Soon
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 12,
              fontSize: 13,
              color: COLORS.textMuted,
              fontStyle: "italic",
            }}
          >
            Renewals are pulled from your Subscriptions module automatically.
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
