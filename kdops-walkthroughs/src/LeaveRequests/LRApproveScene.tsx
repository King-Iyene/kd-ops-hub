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

const PENDING = [
  { name: "Emeka Nwosu", type: "Annual Leave", dates: "20–24 Oct", days: 5, status: "Pending" as const },
  { name: "Tunde Bakare", type: "Sick Leave", dates: "18 Oct", days: 1, status: "Pending" as const },
];

export const LRApproveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = (start: number, dur = 0.4) =>
    interpolate(frame, [start * fps, (start + dur) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  // Animation phases
  const showApproveClick = frame > 2.5 * fps;
  const showConfirmation = frame > 3.2 * fps;
  const showApproved = frame > 4.0 * fps;
  const showRejectPanel = frame > 5.0 * fps;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 70px",
      }}
    >
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 13,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: fade(0),
        }}
      >
        People &amp; HR &nbsp;→&nbsp; Time &amp; Leave &nbsp;→&nbsp;{" "}
        <span style={{ color: COLORS.accentBright }}>Leave Approvals</span>
      </Interactive.Div>

      {/* Title */}
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 40,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 4,
          opacity: fade(0.15),
        }}
      >
        Approving Leave Requests (Manager View)
      </Interactive.Div>

      <Interactive.Div
        name="Subtitle"
        style={{
          fontSize: 15,
          color: COLORS.textMuted,
          marginBottom: 24,
          opacity: fade(0.25),
        }}
      >
        Review and action pending leave requests from your team
      </Interactive.Div>

      {/* Pending requests table */}
      <Interactive.Div
        name="PendingTable"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          marginBottom: 20,
          opacity: fade(0.5),
        }}
      >
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>Pending Requests</span>
          <span style={{ fontSize: 13, color: COLORS.textMuted, fontFamily: monoFamily }}>2 awaiting action</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.2fr 1fr 0.5fr 1fr 1.4fr",
            padding: "10px 24px",
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          {["EMPLOYEE", "TYPE", "DATES", "DAYS", "STATUS", "ACTIONS"].map((h) => (
            <div
              key={h}
              style={{
                fontSize: 11,
                fontFamily: monoFamily,
                color: COLORS.textMuted,
                letterSpacing: 1,
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {PENDING.map((req, i) => {
          const isFirst = i === 0;
          const thisApproved = isFirst && showApproved;
          const statusColor = thisApproved ? COLORS.green : COLORS.gold;
          const statusText = thisApproved ? "Approved" : req.status;

          return (
            <div
              key={req.name}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.2fr 1fr 0.5fr 1fr 1.4fr",
                padding: "14px 24px",
                borderBottom: i < PENDING.length - 1 ? `1px solid ${COLORS.border}` : "none",
                alignItems: "center",
                background: isFirst && showApproveClick && !showApproved ? `${COLORS.accentBright}08` : "transparent",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{req.name}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>{req.type}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>{req.dates}</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>{req.days}</div>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusColor,
                    background: `${statusColor}22`,
                    padding: "4px 10px",
                    borderRadius: 6,
                  }}
                >
                  {statusText}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {!thisApproved && (
                  <>
                    <div
                      style={{
                        background: isFirst && showApproveClick ? COLORS.green : `${COLORS.green}33`,
                        color: COLORS.white,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.green}`,
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
                      Reject
                    </div>
                  </>
                )}
                {thisApproved && (
                  <div style={{ fontSize: 13, color: COLORS.green, fontWeight: 600 }}>
                    ✓ Approved
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Interactive.Div>

      {/* Approval confirmation modal */}
      {showConfirmation && !showApproved && (
        <Interactive.Div
          name="ConfirmModal"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: COLORS.surface,
            borderRadius: 16,
            padding: 32,
            border: `2px solid ${COLORS.green}`,
            boxShadow: `0 24px 64px ${COLORS.bg}cc`,
            width: 420,
            zIndex: 10,
            opacity: fade(3.2, 0.3),
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white, marginBottom: 12 }}>
            Confirm Approval
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 8 }}>
            Approve <span style={{ color: COLORS.white, fontWeight: 600 }}>Emeka Nwosu</span>'s Annual Leave?
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 18 }}>
            20–24 Oct 2026 (5 working days)
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div
              style={{
                flex: 1,
                background: COLORS.green,
                color: COLORS.white,
                fontWeight: 700,
                fontSize: 14,
                padding: "10px 0",
                borderRadius: 8,
                textAlign: "center" as const,
              }}
            >
              Confirm Approval
            </div>
            <div
              style={{
                flex: 1,
                background: COLORS.bg,
                color: COLORS.textMuted,
                fontWeight: 600,
                fontSize: 14,
                padding: "10px 0",
                borderRadius: 8,
                textAlign: "center" as const,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              Cancel
            </div>
          </div>
        </Interactive.Div>
      )}

      {/* Reject panel */}
      {showRejectPanel && (
        <Interactive.Div
          name="RejectPanel"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 24,
            border: `1px solid ${COLORS.red}44`,
            marginBottom: 16,
            opacity: fade(5.0, 0.4),
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
            Rejecting a Request
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 12 }}>
            When rejecting, you must provide a reason so the employee understands why.
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: monoFamily, marginBottom: 4 }}>
              Rejection Reason (required)
            </div>
            <div
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.red}66`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 14,
                color: COLORS.white,
                minHeight: 36,
              }}
            >
              Team capacity is low that week — please reschedule to November.
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              background: COLORS.red,
              borderRadius: 8,
              padding: "10px 20px",
              textAlign: "center" as const,
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.white,
              width: 180,
            }}
          >
            Confirm Rejection
          </div>
        </Interactive.Div>
      )}

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: showRejectPanel ? 0 : "auto",
          background: `${COLORS.accentBright}12`,
          border: `1px solid ${COLORS.accentBright}44`,
          borderRadius: 10,
          padding: "10px 18px",
          fontSize: 13,
          color: COLORS.accentBright,
          opacity: fade(5.6),
        }}
      >
        💡 Check team availability before approving — avoid too many people off at the same time
      </Interactive.Div>
    </AbsoluteFill>
  );
};
