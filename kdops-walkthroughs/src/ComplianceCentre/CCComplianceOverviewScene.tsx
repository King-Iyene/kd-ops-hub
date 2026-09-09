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

const ITEMS = [
  { name: "PAYE Filing", due: "Due 10 Oct 2026", status: "Due Soon", color: COLORS.orange },
  { name: "Pension Remittance", due: "Submitted 28 Sep 2026", status: "Up to Date", color: COLORS.green },
  { name: "NHF Contribution", due: "Due 15 Oct 2026", status: "Due Soon", color: COLORS.orange },
  { name: "ITF Levy", due: "Submitted 1 Sep 2026", status: "Up to Date", color: COLORS.green },
];

const DEADLINES = [
  { date: "10 Oct", label: "PAYE Filing deadline" },
  { date: "15 Oct", label: "NHF Contribution deadline" },
  { date: "21 Oct", label: "VAT Returns" },
  { date: "31 Oct", label: "Withholding Tax remittance" },
];

export const CCComplianceOverviewScene: React.FC = () => {
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
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Finance &rarr; Compliance
      </Interactive.Div>

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
        Compliance Dashboard
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 28,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Your compliance status at a glance
      </Interactive.Div>

      {/* Status cards - 2x2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {ITEMS.map((item, i) => {
          const delay = 0.6 + i * 0.3;
          return (
            <Interactive.Div
              key={item.name}
              name={`Item-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: "20px 24px",
                border: `1px solid ${COLORS.border}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white }}>
                  {item.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: item.color,
                    background: `${item.color}22`,
                    padding: "5px 12px",
                    borderRadius: 8,
                  }}
                >
                  {item.status}
                </div>
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>{item.due}</div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Upcoming deadlines calendar strip */}
      <Interactive.Div
        name="CalendarLabel"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 12,
          opacity: interpolate(frame, [2 * fps, 2.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Upcoming Deadlines
      </Interactive.Div>

      <div style={{ display: "flex", gap: 12 }}>
        {DEADLINES.map((d, i) => {
          const delay = 2.2 + i * 0.2;
          return (
            <Interactive.Div
              key={d.date}
              name={`Deadline-${i}`}
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                padding: "14px 18px",
                flex: 1,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: monoFamily, color: COLORS.accentBright, marginBottom: 6 }}>
                {d.date}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>{d.label}</div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 24,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          color: COLORS.accentBright,
          lineHeight: 1.5,
          opacity: interpolate(frame, [3.2 * fps, 3.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Yellow warnings mean a deadline is approaching — take action before it
        turns red.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
