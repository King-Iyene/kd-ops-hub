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

const SUBSCRIPTIONS = [
  { service: "Google Workspace", cost: "₦45,000/mo", renewal: "1 Nov 2026", status: "Active", statusColor: "#22c55e" },
  { service: "Slack Business+", cost: "₦28,000/mo", renewal: "5 Nov 2026", status: "Active", statusColor: "#22c55e" },
  { service: "Adobe Creative Cloud", cost: "₦65,000/mo", renewal: "Auto-renew", status: "Auto-renew", statusColor: "#00ECFF" },
  { service: "Zoom Enterprise", cost: "₦18,000/mo", renewal: "12 Nov 2026", status: "Expiring Soon", statusColor: "#f59e0b" },
  { service: "Canva Pro", cost: "₦8,500/mo", renewal: "20 Oct 2026", status: "Cancelled", statusColor: "#ef4444" },
];

const TOTAL = "₦164,500/mo";

export const BSSubscriptionTrackerScene: React.FC = () => {
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
        Tracking Subscriptions
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
        All subscriptions in one place
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 20,
          color: COLORS.textMuted,
          marginBottom: 32,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Every software subscription your company pays for is listed here.
        You can see the monthly cost, when it renews, and its current status.
      </Interactive.Div>

      {/* Table */}
      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          opacity: interpolate(frame, [0.7 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1.2fr 1.2fr",
            padding: "16px 24px",
            background: `${COLORS.accent}33`,
            fontSize: 12,
            fontFamily: monoFamily,
            color: COLORS.accentBright,
            letterSpacing: 1.5,
            textTransform: "uppercase" as const,
          }}
        >
          <div>Service Name</div>
          <div>Amount</div>
          <div>Next Renewal</div>
          <div>Status</div>
        </div>

        {/* Rows */}
        {SUBSCRIPTIONS.map((sub, i) => {
          const delay = 1 + i * 0.25;
          const rowOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.25) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          return (
            <Interactive.Div
              key={sub.service}
              name={`Row-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1.2fr 1.2fr",
                padding: "16px 24px",
                borderTop: `1px solid ${COLORS.border}`,
                opacity: rowOpacity,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>
                {sub.service}
              </div>
              <div style={{ fontSize: 16, fontFamily: monoFamily, color: COLORS.text }}>
                {sub.cost}
              </div>
              <div style={{ fontSize: 15, color: COLORS.textMuted }}>{sub.renewal}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: sub.statusColor,
                  }}
                />
                <span style={{ fontSize: 14, color: sub.statusColor, fontWeight: 500 }}>
                  {sub.status}
                </span>
              </div>
            </Interactive.Div>
          );
        })}
      </Interactive.Div>

      {/* Total bar */}
      <Interactive.Div
        name="TotalBar"
        style={{
          marginTop: 16,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.accentBright }}>
          Review subscriptions monthly — cancel unused ones to save costs.
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: monoFamily, color: COLORS.white }}>
          {TOTAL}
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
