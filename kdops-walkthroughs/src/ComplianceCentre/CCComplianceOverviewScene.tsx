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
  { name: "PAYE", due: "Due 10th monthly", status: "On track", color: COLORS.green },
  { name: "Pension", due: "Due 7th monthly", status: "On track", color: COLORS.green },
  { name: "VAT", due: "Due 21st monthly", status: "Due soon", color: COLORS.orange },
  { name: "ITF", due: "Annual filing", status: "Overdue", color: COLORS.red },
  { name: "NSITF", due: "Annual filing", status: "Filed", color: COLORS.green },
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
        Compliance Overview
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
        Nigerian Compliance Dashboard
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
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
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white, minWidth: 100 }}>
                {item.name}
              </div>
              <div style={{ fontSize: 15, color: COLORS.textMuted, flex: 1 }}>
                {item.due}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: item.color,
                  background: `${item.color}22`,
                  padding: "6px 14px",
                  borderRadius: 8,
                }}
              >
                {item.status}
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
