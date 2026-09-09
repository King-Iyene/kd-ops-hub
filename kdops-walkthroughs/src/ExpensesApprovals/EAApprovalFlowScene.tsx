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

const PENDING_EXPENSES = [
  {
    category: "Fuel",
    amount: "₦15,000",
    date: "02/10/2026",
    description: "Office fuel — October",
    submittedBy: "Adebayo Johnson",
  },
  {
    category: "Equipment",
    amount: "₦85,000",
    date: "28/09/2026",
    description: "Laptop charger replacement",
    submittedBy: "Emeka Nwosu",
  },
  {
    category: "Meals",
    amount: "₦8,500",
    date: "26/09/2026",
    description: "Team lunch — Friday",
    submittedBy: "Tunde Bakare",
  },
];

export const EAApprovalFlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation phases
  const showApproveClick = frame > 3.0 * fps;
  const showConfirmation = frame > 3.8 * fps;
  const showStatusChange = frame > 4.6 * fps;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
      }}
    >
      {/* Scene label */}
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Admin View
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 8,
          opacity: interpolate(frame, [0.1 * fps, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Approving Expenses (Admin View)
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 16,
          color: COLORS.textMuted,
          marginBottom: 24,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        As a manager or admin, you review pending expenses and approve or reject
        them. Here is what the process looks like:
      </Interactive.Div>

      {/* Pending expenses list */}
      <Interactive.Div
        name="PendingList"
        style={{
          background: COLORS.surface,
          borderRadius: 12,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          marginBottom: 16,
          opacity: interpolate(frame, [0.7 * fps, 1.0 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${COLORS.border}`,
            fontSize: 15,
            fontWeight: 700,
            color: COLORS.white,
          }}
        >
          Pending Expenses ({PENDING_EXPENSES.length})
        </div>

        {PENDING_EXPENSES.map((exp, i) => {
          const delay = 1.0 + i * 0.25;
          const rowOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.2) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          // First row shows the approval interaction
          const isFirstRow = i === 0;
          const firstRowApproved = isFirstRow && showStatusChange;
          const firstRowProcessing = isFirstRow && showConfirmation && !showStatusChange;

          return (
            <Interactive.Div
              key={exp.description}
              name={`PendingRow-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderBottom:
                  i < PENDING_EXPENSES.length - 1
                    ? `1px solid ${COLORS.border}`
                    : "none",
                opacity: rowOpacity,
                background: isFirstRow && showApproveClick
                  ? `${COLORS.accentBright}08`
                  : "transparent",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white }}>
                  {exp.description}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                  {exp.category} &middot; {exp.amount} &middot; {exp.submittedBy} &middot; {exp.date}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {firstRowApproved ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: COLORS.green,
                        background: `${COLORS.green}22`,
                        padding: "4px 12px",
                        borderRadius: 6,
                      }}
                    >
                      Approved
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                      &rarr; Processing Payment
                    </span>
                  </div>
                ) : firstRowProcessing ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: COLORS.accentBright,
                      background: `${COLORS.accentBright}22`,
                      padding: "4px 12px",
                      borderRadius: 6,
                    }}
                  >
                    Confirming...
                  </span>
                ) : (
                  <>
                    <div
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: COLORS.white,
                        background: COLORS.green,
                        border: isFirstRow && showApproveClick
                          ? `2px solid ${COLORS.white}`
                          : "none",
                      }}
                    >
                      Approve
                    </div>
                    <div
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: COLORS.red,
                        background: `${COLORS.red}22`,
                      }}
                    >
                      Reject
                    </div>
                  </>
                )}
              </div>
            </Interactive.Div>
          );
        })}
      </Interactive.Div>

      {/* Click indicator */}
      {showApproveClick && !showConfirmation && (
        <Interactive.Div
          name="ClickIndicator"
          style={{
            fontSize: 13,
            color: COLORS.accentBright,
            fontFamily: monoFamily,
            marginBottom: 14,
            opacity: interpolate(frame, [3.0 * fps, 3.3 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          &#x1F446; Click &quot;Approve&quot; on the first expense...
        </Interactive.Div>
      )}

      {showConfirmation && !showStatusChange && (
        <Interactive.Div
          name="ConfirmMsg"
          style={{
            fontSize: 13,
            color: COLORS.green,
            fontFamily: monoFamily,
            marginBottom: 14,
            opacity: interpolate(frame, [3.8 * fps, 4.1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          &#x2705; Confirming approval...
        </Interactive.Div>
      )}

      {showStatusChange && (
        <Interactive.Div
          name="StatusMsg"
          style={{
            fontSize: 13,
            color: COLORS.green,
            fontFamily: monoFamily,
            marginBottom: 14,
            opacity: interpolate(frame, [4.6 * fps, 4.9 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          &#x2705; Expense approved! Status changed to &quot;Approved&quot; &rarr; &quot;Processing Payment&quot;
        </Interactive.Div>
      )}

      {/* Warning banner */}
      <Interactive.Div
        name="BankWarning"
        style={{
          background: `${COLORS.orange}15`,
          borderRadius: 8,
          padding: "12px 18px",
          borderLeft: `3px solid ${COLORS.orange}`,
          marginBottom: 12,
          opacity: interpolate(frame, [5.2 * fps, 5.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: COLORS.orange }}>
            &#x26A0;&#xFE0F; Warning:
          </span>{" "}
          If an employee&apos;s bank details are missing, the payment will be held until they add their bank information.
        </div>
      </Interactive.Div>

      {/* Admin tip */}
      <Interactive.Div
        name="AdminTip"
        style={{
          background: `${COLORS.accent}22`,
          borderRadius: 8,
          padding: "12px 18px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [5.6 * fps, 6.0 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: COLORS.accentBright }}>
            &#x1F4A1; Tip:
          </span>{" "}
          Nudge employees to add their bank details &mdash; they can do this from{" "}
          <span style={{ fontWeight: 700, color: COLORS.gold }}>
            My Portal &rarr; Profile
          </span>.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
