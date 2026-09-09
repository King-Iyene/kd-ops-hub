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

const DEDUCTIONS = [
  { title: "PAYE Tax", desc: "Income tax calculated per FIRS tax tables" },
  { title: "Pension", desc: "8% employee + 10% employer contribution" },
  { title: "NHF", desc: "National Housing Fund — 2.5% of basic salary" },
];

const ALLOWANCES = [
  { title: "Housing", desc: "50% of basic salary" },
  { title: "Transport", desc: "₦25,000 monthly" },
  { title: "Meal", desc: "₦15,000 monthly" },
];

export const PIPayrollBreakdownScene: React.FC = () => {
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
        Payroll Breakdown
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
        Deductions & allowances
      </Interactive.Div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* Left column: Deductions */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          <Interactive.Div
            name="DeductionsHeader"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.red,
              fontFamily: monoFamily,
              letterSpacing: 1,
              opacity: interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            ▼ DEDUCTIONS
          </Interactive.Div>
          {DEDUCTIONS.map((item, i) => {
            const delay = 0.7 + i * 0.3;
            return (
              <Interactive.Div
                key={item.title}
                name={`Deduction-${i}`}
                style={{
                  background: `${COLORS.red}15`,
                  borderRadius: 12,
                  padding: "20px 24px",
                  border: `1px solid ${COLORS.red}44`,
                  opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.red, marginBottom: 6 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.4 }}>
                  {item.desc}
                </div>
              </Interactive.Div>
            );
          })}
        </div>

        {/* Right column: Allowances */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          <Interactive.Div
            name="AllowancesHeader"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.green,
              fontFamily: monoFamily,
              letterSpacing: 1,
              opacity: interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            ▲ ALLOWANCES
          </Interactive.Div>
          {ALLOWANCES.map((item, i) => {
            const delay = 0.7 + i * 0.3;
            return (
              <Interactive.Div
                key={item.title}
                name={`Allowance-${i}`}
                style={{
                  background: `${COLORS.green}15`,
                  borderRadius: 12,
                  padding: "20px 24px",
                  border: `1px solid ${COLORS.green}44`,
                  opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.green, marginBottom: 6 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.4 }}>
                  {item.desc}
                </div>
              </Interactive.Div>
            );
          })}
        </div>
      </div>

      {/* Summary bar */}
      <Interactive.Div
        name="SummaryBar"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          padding: "24px 32px",
          border: `1px solid ${COLORS.border}`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 32,
          opacity: interpolate(frame, [2.2 * fps, 2.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 12, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6 }}>
            GROSS PAY
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.white }}>{"₦"}350,000</div>
        </div>
        <div style={{ fontSize: 32, color: COLORS.red, fontWeight: 700 }}>−</div>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 12, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6 }}>
            DEDUCTIONS
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.red }}>{"₦"}98,000</div>
        </div>
        <div style={{ fontSize: 32, color: COLORS.textMuted, fontWeight: 700 }}>=</div>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 12, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6 }}>
            NET PAY
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.green }}>{"₦"}252,000</div>
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
