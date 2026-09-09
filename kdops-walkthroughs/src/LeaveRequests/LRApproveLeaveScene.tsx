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

const REQUESTS = [
  { name: "Keneth Cyril-Ita", type: "Annual", dates: "15-19 Sept", days: 5, status: "Pending" },
  { name: "Gogo Marosi", type: "Sick", dates: "22 Sept", days: 1, status: "Pending" },
  { name: "Princewill James", type: "Annual", dates: "1-5 Oct", days: 5, status: "Pending" },
];

const COLUMNS = ["EMPLOYEE", "TYPE", "DATES", "DAYS", "STATUS", "ACTIONS"];

export const LRApproveLeaveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // First row gets approved at ~4.5s
  const firstApproved = frame > 4.5 * fps;

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
          color: COLORS.gold,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Manager View
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
        Approving leave requests
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 20,
          color: COLORS.textMuted,
          marginBottom: 40,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Review and action pending leave requests from your direct reports.
      </Interactive.Div>

      {/* Table */}
      <Interactive.Div
        name="Table"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          opacity: interpolate(frame, [0.8 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px 100px 140px 80px 120px 180px",
            padding: "16px 24px",
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          {COLUMNS.map((col) => (
            <div
              key={col}
              style={{
                fontSize: 12,
                fontFamily: monoFamily,
                color: COLORS.accentBright,
                letterSpacing: 1.5,
                textTransform: "uppercase" as const,
              }}
            >
              {col}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {REQUESTS.map((req, i) => {
          const delay = 1.2 + i * 0.3;
          const rowOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.25) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const rowY = interpolate(
            frame,
            [delay * fps, (delay + 0.25) * fps],
            [10, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
            },
          );

          const isApproved = i === 0 && firstApproved;
          const statusText = isApproved ? "Approved" : req.status;
          const statusColor = isApproved ? COLORS.green : COLORS.orange;

          return (
            <Interactive.Div
              key={req.name}
              name={`Row-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "200px 100px 140px 80px 120px 180px",
                padding: "14px 24px",
                alignItems: "center",
                borderBottom:
                  i < REQUESTS.length - 1
                    ? `1px solid ${COLORS.border}`
                    : "none",
                opacity: rowOpacity,
                transform: `translateY(${rowY}px)`,
              }}
            >
              <div style={{ fontSize: 15, color: COLORS.white, fontWeight: 500 }}>
                {req.name}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>
                {req.type}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, fontFamily: monoFamily }}>
                {req.dates}
              </div>
              <div style={{ fontSize: 15, color: COLORS.white, fontWeight: 600 }}>
                {req.days}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusColor,
                    background: `${statusColor}22`,
                    padding: "4px 12px",
                    borderRadius: 6,
                  }}
                >
                  {statusText}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {!isApproved && (
                  <>
                    <div
                      style={{
                        background: `${COLORS.green}22`,
                        color: COLORS.green,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.green}44`,
                      }}
                    >
                      Approve
                    </div>
                    <div
                      style={{
                        background: `${COLORS.red}22`,
                        color: COLORS.red,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.red}44`,
                      }}
                    >
                      Decline
                    </div>
                  </>
                )}
                {isApproved && (
                  <div style={{ fontSize: 13, color: COLORS.green, fontWeight: 600 }}>
                    ✓ Done
                  </div>
                )}
              </div>
            </Interactive.Div>
          );
        })}
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 28,
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "14px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          fontSize: 15,
          color: COLORS.accentBright,
          fontWeight: 500,
          opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Approvers get email and in-app notifications for every new request.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
