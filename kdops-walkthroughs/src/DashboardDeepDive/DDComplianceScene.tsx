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

const FILINGS = [
  { name: "PAYE", date: "10 Sept 2026, 5:00 am (GMT+1)", desc: "File PAYE return for previous month", due: "in 0d", color: COLORS.red },
  { name: "Pension", date: "07 Oct 2026, 5:00 am (GMT+1)", desc: "Remit pension contributions for previous month", due: "in 27d", color: COLORS.green },
  { name: "VAT", date: "21 Sept 2026, 5:00 am (GMT+1)", desc: "File monthly VAT return", due: "in 11d", color: COLORS.orange },
];

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
        Compliance & Tasks
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
        Nigerian Compliance Tracker
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 32 }}>
        {/* Compliance filings */}
        <div>
          <Interactive.Div
            name="FilingsCard"
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
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: COLORS.gold }}>🏛</span> Nigerian Compliance
              </div>
              <div style={{ fontSize: 13, color: COLORS.accentBright, fontFamily: monoFamily }}>View All →</div>
            </div>

            {FILINGS.map((f, i) => {
              const delay = 1 + i * 0.3;
              return (
                <div
                  key={f.name}
                  style={{
                    padding: "18px 24px",
                    borderBottom: i < FILINGS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    opacity: interpolate(frame, [delay * fps, (delay + 0.25) * fps], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white, marginBottom: 4 }}>
                      {f.name} — {f.date}
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.textMuted }}>{f.desc}</div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: monoFamily,
                      color: f.color,
                      background: `${f.color}22`,
                      padding: "4px 10px",
                      borderRadius: 6,
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {f.due}
                  </div>
                </div>
              );
            })}

            {/* Tax Clearance */}
            <div
              style={{
                padding: "18px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: interpolate(frame, [2 * fps, 2.3 * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white, marginBottom: 4 }}>
                  Tax Clearance Certificate
                </div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>Upload your TCC to Documents</div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: monoFamily,
                  color: COLORS.red,
                  background: `${COLORS.red}22`,
                  padding: "4px 10px",
                  borderRadius: 6,
                }}
              >
                Missing
              </div>
            </div>
          </Interactive.Div>
        </div>

        {/* Tasks & Goals */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>
          <Interactive.Div
            name="TasksCard"
            style={{
              background: COLORS.surface,
              borderRadius: 14,
              padding: 24,
              border: `1px solid ${COLORS.border}`,
              opacity: interpolate(frame, [1.5 * fps, 1.9 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
              📋 My Tasks
            </div>
            <div style={{ fontSize: 16, color: COLORS.green }}>
              ✓ You're all caught up. No open tasks assigned to you.
            </div>
          </Interactive.Div>

          <Interactive.Div
            name="GoalsCard"
            style={{
              background: COLORS.surface,
              borderRadius: 14,
              padding: 24,
              border: `1px solid ${COLORS.border}`,
              opacity: interpolate(frame, [1.8 * fps, 2.2 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
              🎯 My Goals This Quarter
            </div>
            <div style={{ fontSize: 16, color: COLORS.textMuted }}>
              No goals assigned for 2026-Q3.
            </div>
          </Interactive.Div>

          <Interactive.Div
            name="PaymentsCard"
            style={{
              background: COLORS.surface,
              borderRadius: 14,
              padding: 24,
              border: `1px solid ${COLORS.border}`,
              opacity: interpolate(frame, [2.1 * fps, 2.5 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
              💳 Payments This Week
            </div>
            <div style={{ fontSize: 14, color: COLORS.textMuted }}>
              No payments in the next 7 days. Scheduled payment batches will appear here.
            </div>
          </Interactive.Div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
