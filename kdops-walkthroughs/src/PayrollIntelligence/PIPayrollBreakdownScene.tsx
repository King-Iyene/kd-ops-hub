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

const PAY_GROUPS = [
  {
    name: "KDS – Administrative",
    schedule: "Monthly",
    amount: "₦3,440,000.00",
    members: 7,
    paysOn: "5th",
    desc: "Administrative staff on monthly salary",
    hasManage: true,
    color: COLORS.accentBright,
  },
  {
    name: "NDI Staffs",
    schedule: "Monthly",
    amount: "₦630,000.00",
    members: 7,
    paysOn: "5th",
    desc: "NDI team members on monthly salary",
    hasManage: false,
    color: COLORS.gold,
  },
  {
    name: "Non-administrative",
    schedule: "Monthly",
    amount: "₦425,000.00",
    members: 6,
    paysOn: "5th",
    desc: "Support and operations staff",
    hasManage: false,
    color: COLORS.green,
  },
  {
    name: "Commission Staff",
    schedule: "Monthly",
    amount: "₦0.00",
    members: 0,
    paysOn: null,
    desc: "Employees paid on commission basis",
    hasManage: false,
    color: COLORS.orange,
  },
  {
    name: "Hourly Staff",
    schedule: "Monthly",
    amount: "₦0.00",
    members: 0,
    paysOn: null,
    desc: "Paid based on clocked hours",
    hasManage: false,
    color: COLORS.red,
  },
];

export const PIPayrollBreakdownScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const highlightedCard = Math.floor((frame - 3 * fps) / (1.5 * fps)) % PAY_GROUPS.length;
  const showHighlight = frame > 3 * fps;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
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
        Pay Groups
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 10,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Understanding Pay Groups
      </Interactive.Div>

      <Interactive.Div
        name="Explainer"
        style={{
          fontSize: 18,
          color: COLORS.textMuted,
          marginBottom: 28,
          maxWidth: 800,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Pay groups organise your employees by <span style={{ color: COLORS.white, fontWeight: 600 }}>how</span> and <span style={{ color: COLORS.white, fontWeight: 600 }}>when</span> they get paid.
        Each group has its own schedule and payment method.
        When you run payroll, you select a pay group — only members of that group are included.
      </Interactive.Div>

      {/* Pay group cards - 2 column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {PAY_GROUPS.map((pg, i) => {
          const delay = 0.7 + i * 0.25;
          const isHl = showHighlight && highlightedCard === i;
          return (
            <Interactive.Div
              key={pg.name}
              name={`PayGroup-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 14,
                padding: "20px 24px",
                border: `2px solid ${isHl ? pg.color : COLORS.border}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>{pg.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>{pg.desc}</div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: monoFamily,
                    color: pg.color,
                    background: `${pg.color}22`,
                    padding: "3px 10px",
                    borderRadius: 12,
                  }}
                >
                  {pg.schedule}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.white, fontFamily: monoFamily }}>{pg.amount}</div>
                  <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
                    {pg.members > 0
                      ? `${pg.members} members${pg.paysOn ? ` · Pays on the ${pg.paysOn}` : ""}`
                      : "No members yet"}
                  </div>
                </div>
                {pg.hasManage && (
                  <div
                    style={{
                      fontSize: 13,
                      color: COLORS.accentBright,
                      fontWeight: 600,
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    Manage members
                  </div>
                )}
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "16px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [2.5 * fps, 2.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>
          <span style={{ color: COLORS.accentBright, fontWeight: 700 }}>💡 Tip: </span>
          Assign every employee to a pay group so they appear in payroll runs.
          Go to Pay groups tab &gt; click a group &gt; Manage members to add or remove people.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
