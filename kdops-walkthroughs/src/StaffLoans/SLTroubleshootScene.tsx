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

export const SLTroubleshootScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tips = [
    { icon: "❓", text: "Check your role and permissions if a module is missing" },
    { icon: "🏦", text: "Verify bank details before any disbursement request" },
    { icon: "🔄", text: "Refresh the page if data isn't loading" },
    { icon: "👤", text: "Contact your admin for access or permission issues" },
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "40px 60px" }}>
      <Interactive.Div name="Title" style={{ fontSize: 36, fontWeight: 700, color: COLORS.white, marginBottom: 8, opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Troubleshooting
      </Interactive.Div>
      <Interactive.Div name="Subtitle" style={{ fontSize: 16, color: COLORS.textMuted, marginBottom: 32, opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Common issues and how to fix them
      </Interactive.Div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {tips.map((tip, i) => (
          <Interactive.Div key={i} name={`Tip-${i}`} style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: interpolate(frame, [(0.4 + i * 0.4) * fps, (0.8 + i * 0.4) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}>
            <span style={{ fontSize: 28 }}>{tip.icon}</span>
            <span style={{ fontSize: 16, color: COLORS.text, lineHeight: 1.5 }}>{tip.text}</span>
          </Interactive.Div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
