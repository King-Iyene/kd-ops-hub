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

const STATS = [
  { label: "TOTAL PAYROLL COST", value: "₦4,250,000", sub: "This month", color: COLORS.accentBright },
  { label: "EMPLOYEES ON PAYROLL", value: "30", sub: "Active staff", color: COLORS.gold },
  { label: "NET VS GROSS", value: "72%", sub: "Net-to-gross ratio", color: COLORS.green },
  { label: "PAYMENT SCHEDULE", value: "28th", sub: "Next run date", color: COLORS.orange },
];

export const PIPayrollOverviewScene: React.FC = () => {
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
        Payroll Dashboard
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
        Your payroll command centre
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
        The payroll dashboard is your command centre for monitoring costs, tracking
        employee compensation, and staying on top of payment schedules across your
        entire organisation.
      </Interactive.Div>

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20, marginBottom: 40 }}>
        {STATS.map((stat, i) => {
          const delay = 0.8 + i * 0.3;
          const cardOpacity = interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isHighlighted = Math.floor((frame - 3 * fps) / (1.5 * fps)) % 4 === i && frame > 3 * fps;

          return (
            <Interactive.Div
              key={stat.label}
              name={`Stat-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 14,
                padding: "28px 24px",
                border: `2px solid ${isHighlighted ? stat.color : COLORS.border}`,
                opacity: cardOpacity,
                transition: "border-color 0.3s",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontFamily: monoFamily,
                  color: stat.color,
                  letterSpacing: 1.5,
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: stat.color }} />
                {stat.label}
              </div>
              <div style={{ fontSize: 44, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>{stat.sub}</div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Explanation callouts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { title: "Real-time tracking", desc: "Payroll costs, headcount, and net-to-gross ratios update automatically as you add employees and adjust salaries." },
          { title: "Scheduled runs", desc: "Set your pay date once and KD Ops reminds you before each run so nothing is missed." },
        ].map((item, i) => {
          const delay = 2 + i * 0.4;
          return (
            <Interactive.Div
              key={item.title}
              name={`Tip-${i}`}
              style={{
                background: `${COLORS.accent}22`,
                borderRadius: 10,
                padding: "20px 24px",
                borderLeft: `3px solid ${COLORS.accentBright}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.accentBright, marginBottom: 6 }}>
                💡 {item.title}
              </div>
              <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>{item.desc}</div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
