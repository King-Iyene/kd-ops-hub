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

export const DDFinanceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const healthScore = Math.round(
    interpolate(frame, [1 * fps, 2.5 * fps], [0, 72], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const scoreColor = healthScore >= 70 ? COLORS.green : healthScore >= 50 ? COLORS.orange : COLORS.red;

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
          color: COLORS.orange,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step 2 — Financial Overview
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
        How healthy is the company's cash position?
      </Interactive.Div>

      <Interactive.Div
        name="Subtitle"
        style={{
          fontSize: 18,
          color: COLORS.textMuted,
          marginBottom: 32,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        This section gives you one number that summarises your financial standing, plus the cash details behind it.
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* Financial Health Card */}
        <Interactive.Div
          name="HealthCard"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 28,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: scoreColor }} />
            <span style={{ fontSize: 17, fontWeight: 600, color: COLORS.white }}>Financial Health</span>
          </div>

          {/* Score gauge */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 64, fontWeight: 700, color: scoreColor }}>
              {healthScore}
            </div>
            <div style={{ fontSize: 20, color: COLORS.textMuted }}>/ 100</div>
          </div>

          {/* Progress bar */}
          <div style={{ background: COLORS.bg, borderRadius: 6, height: 10, marginBottom: 16 }}>
            <div
              style={{
                background: scoreColor,
                borderRadius: 6,
                height: 10,
                width: `${healthScore}%`,
                minWidth: 4,
                transition: "width 0.1s",
              }}
            />
          </div>

          {/* Score meaning */}
          <div style={{ fontSize: 14, color: COLORS.textMuted, lineHeight: 1.6 }}>
            <div style={{ color: COLORS.green, fontWeight: 600, marginBottom: 6 }}>
              ✓ Score above 70 = Healthy
            </div>
            <div>Cash on hand: <span style={{ color: COLORS.white, fontWeight: 600 }}>₦5,200,000</span></div>
            <div>Runway: <span style={{ color: COLORS.white, fontWeight: 600 }}>3.2 months</span></div>
          </div>
        </Interactive.Div>

        {/* 30-Day Cash Summary Card */}
        <Interactive.Div
          name="CashSumCard"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 28,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [0.9 * fps, 1.3 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.gold }} />
            <span style={{ fontSize: 17, fontWeight: 600, color: COLORS.white }}>30-Day Cash Summary</span>
          </div>

          <div style={{ fontSize: 48, fontWeight: 700, color: COLORS.white, marginBottom: 6 }}>
            ₦4,850,000
          </div>
          <div style={{ fontSize: 15, color: COLORS.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
            Total disbursements over the last 30 days — approved expenses, salary runs, and payment batches combined.
          </div>

          {/* Mini breakdown */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {[
              { label: "Payroll", amount: "₦3,200,000", pct: 66 },
              { label: "Expenses", amount: "₦950,000", pct: 20 },
              { label: "Vendor Payments", amount: "₦700,000", pct: 14 },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.textMuted, marginBottom: 4 }}>
                  <span>{item.label}</span>
                  <span style={{ color: COLORS.white, fontWeight: 600 }}>{item.amount}</span>
                </div>
                <div style={{ background: COLORS.bg, borderRadius: 4, height: 6 }}>
                  <div style={{ background: COLORS.gold, borderRadius: 4, height: 6, width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Interactive.Div>
      </div>

      {/* Plain-language explanations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          { title: "Cash on Hand", desc: "How much money is available right now. Think of it as your bank balance.", color: COLORS.green },
          { title: "Runway", desc: "How many months the company can keep running at the current spend rate before cash runs out.", color: COLORS.orange },
          { title: "30-Day Cash Sum", desc: "Everything that went out the door in the last 30 days. Helps you see if spending is rising or falling.", color: COLORS.gold },
        ].map((item, i) => {
          const delay = 2.5 + i * 0.3;
          return (
            <Interactive.Div
              key={item.title}
              name={`Explain-${i}`}
              style={{
                background: `${item.color}15`,
                borderRadius: 10,
                padding: "14px 16px",
                borderLeft: `3px solid ${item.color}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 4 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>
                {item.desc}
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
          padding: "16px 20px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [3.5 * fps, 3.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.accentBright, marginBottom: 4 }}>
          💡 Financial Health combines cash runway, pending obligations, and disbursement patterns
        </div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
          It's not just about how much money you have — it also factors in what's owed, what's overdue, and how fast you're spending. One number, full picture.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
