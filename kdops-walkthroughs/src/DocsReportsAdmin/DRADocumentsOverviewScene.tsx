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

const CATEGORIES = [
  { icon: "📋", title: "HR Letters", desc: "Offer letters, confirmations, warnings" },
  { icon: "📑", title: "Compliance Docs", desc: "Tax clearances, pension certs" },
  { icon: "💰", title: "Financial Reports", desc: "P&L, balance sheets, audits" },
  { icon: "👤", title: "Employee Documents", desc: "IDs, contracts, certificates" },
];

export const DRADocumentsOverviewScene: React.FC = () => {
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
        Documents
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Document categories
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {CATEGORIES.map((cat, i) => {
          const delay = 0.6 + i * 0.4;
          return (
            <Interactive.Div
              key={cat.title}
              name={`Category-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: 28,
                border: `1px solid ${COLORS.border}`,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>{cat.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
                {cat.title}
              </div>
              <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
                {cat.desc}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div
                  style={{
                    background: `${COLORS.accent}33`,
                    color: COLORS.accentBright,
                    borderRadius: 6,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Upload
                </div>
                <div
                  style={{
                    background: `${COLORS.accent}33`,
                    color: COLORS.accentBright,
                    borderRadius: 6,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Download
                </div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
