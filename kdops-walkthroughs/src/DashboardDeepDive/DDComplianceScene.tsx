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

const BUDGETS = [
  { label: "Marketing", spent: 320000, total: 500000, color: COLORS.accentBright },
  { label: "Operations", spent: 480000, total: 600000, color: COLORS.orange },
  { label: "Software & Tools", spent: 195000, total: 250000, color: COLORS.gold },
  { label: "Travel", spent: 45000, total: 150000, color: COLORS.green },
];

const RENEWALS = [
  { name: "Google One", amount: "₦40,000", date: "15/10/2026", daysOut: "in 36d", status: "upcoming" },
  { name: "OpenAI API", amount: "₦20,000", date: "22/10/2026", daysOut: "in 43d", status: "upcoming" },
  { name: "YouTube Premium", amount: "₦1,800", date: "01/11/2026", daysOut: "in 53d", status: "upcoming" },
];

const formatNaira = (n: number) =>
  "₦" + n.toLocaleString("en-NG");

export const DDComplianceScene: React.FC = () => {
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
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.gold,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step 4 — Budget & Renewals
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
        Where is the money going, and what's coming up?
      </Interactive.Div>

      <Interactive.Div
        name="Subtitle"
        style={{
          fontSize: 18,
          color: COLORS.textMuted,
          marginBottom: 28,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Budget Utilisation shows how much of each department's budget has been used. Upcoming Renewals warns you about subscriptions that will auto-charge soon.
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 28 }}>
        {/* Budget Utilisation */}
        <div>
          <Interactive.Div
            name="BudgetCard"
            style={{
              background: COLORS.surface,
              borderRadius: 14,
              border: `1px solid ${COLORS.border}`,
              overflow: "hidden",
              opacity: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: COLORS.white }}>
                📊 Budget Utilisation
              </div>
              <div style={{ fontSize: 13, color: COLORS.accentBright, fontFamily: monoFamily }}>
                View all →
              </div>
            </div>

            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column" as const, gap: 16 }}>
              {BUDGETS.map((b, i) => {
                const pct = Math.round((b.spent / b.total) * 100);
                const delay = 1 + i * 0.25;
                const barWidth = interpolate(frame, [delay * fps, (delay + 0.5) * fps], [0, pct], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <div
                    key={b.label}
                    style={{
                      opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                      <span style={{ color: COLORS.white, fontWeight: 600 }}>{b.label}</span>
                      <span style={{ color: COLORS.textMuted, fontSize: 13 }}>
                        {formatNaira(b.spent)} / {formatNaira(b.total)}{" "}
                        <span style={{ color: pct > 80 ? COLORS.orange : COLORS.green, fontWeight: 600 }}>
                          ({pct}%)
                        </span>
                      </span>
                    </div>
                    <div style={{ background: COLORS.bg, borderRadius: 4, height: 8 }}>
                      <div
                        style={{
                          background: b.color,
                          borderRadius: 4,
                          height: 8,
                          width: `${barWidth}%`,
                          transition: "width 0.1s",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Interactive.Div>

          {/* Budget explanation */}
          <Interactive.Div
            name="BudgetExplain"
            style={{
              marginTop: 12,
              fontSize: 13,
              color: COLORS.textMuted,
              lineHeight: 1.5,
              opacity: interpolate(frame, [2.5 * fps, 2.9 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            Each bar shows how much of a department's monthly budget has been spent. When a bar turns orange or approaches 100%, it's time to review spending or adjust the budget.
          </Interactive.Div>
        </div>

        {/* Upcoming Renewals */}
        <div>
          <Interactive.Div
            name="RenewalsCard"
            style={{
              background: COLORS.surface,
              borderRadius: 14,
              border: `1px solid ${COLORS.border}`,
              overflow: "hidden",
              opacity: interpolate(frame, [1.2 * fps, 1.6 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: COLORS.white }}>
                🔄 Upcoming Renewals
              </div>
            </div>

            {RENEWALS.map((r, i) => (
              <div
                key={r.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 22px",
                  borderBottom: i < RENEWALS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>{r.date}</div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{r.amount}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: monoFamily,
                      color: COLORS.orange,
                      background: `${COLORS.orange}22`,
                      padding: "2px 8px",
                      borderRadius: 4,
                      marginTop: 3,
                      display: "inline-block",
                    }}
                  >
                    {r.daysOut}
                  </div>
                </div>
              </div>
            ))}
          </Interactive.Div>

          {/* Renewals explanation */}
          <Interactive.Div
            name="RenewalsExplain"
            style={{
              marginTop: 12,
              fontSize: 13,
              color: COLORS.textMuted,
              lineHeight: 1.5,
              fontStyle: "italic",
              opacity: interpolate(frame, [2 * fps, 2.4 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            Renewals are pulled automatically from the Subscriptions module. If you see something here you don't recognise, check with your manager before the charge date.
          </Interactive.Div>
        </div>
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "16px 20px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          marginTop: 20,
          opacity: interpolate(frame, [3 * fps, 3.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.accentBright, marginBottom: 4 }}>
          💡 Keep an eye on upcoming renewals so there are no surprise charges
        </div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
          The dashboard warns you before subscriptions auto-renew. If a tool is no longer needed, cancel it in the Subscriptions module before the renewal date to save money.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
