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
  { service: "Google Workspace", cost: "₦40,000", renewal: "Mar 15, 2025", status: "Active", statusColor: "#22c55e" },
  { service: "OpenAI API", cost: "₦20,000", renewal: "Mar 1, 2025", status: "Active", statusColor: "#22c55e" },
  { service: "Claude AI", cost: "₦138,000", renewal: "Apr 10, 2025", status: "Active", statusColor: "#22c55e" },
  { service: "Slack Business", cost: "₦55,000", renewal: "Feb 28, 2025", status: "Expiring Soon", statusColor: "#f59e0b" },
  { service: "Figma Team", cost: "₦32,000", renewal: "Jan 15, 2025", status: "Expired", statusColor: "#ef4444" },
];

const TOTAL = "₦285,000";

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
        Subscription Tracker
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
        Track every recurring cost, see renewal dates, and catch expirations
        before they disrupt your workflow.
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
          <div>Service</div>
          <div>Monthly Cost</div>
          <div>Renewal Date</div>
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
          marginTop: 20,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.accentBright }}>
          Total Monthly Cost
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: monoFamily, color: COLORS.white }}>
          {TOTAL}
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
