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
import { COLORS } from "../WelcomeToKDOps/theme";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const { fontFamily: monoFamily } = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] });

export const makeOutroScene = (opts: {
  icon: string;
  title: string;
  subtitle: string;
  upNext: string[];
  isFinal?: boolean;
}) => {
  const Comp: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return (
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 60% 50%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`, display: "flex", flexDirection: "column" as const, justifyContent: "center", alignItems: "center", fontFamily }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentBright}, ${COLORS.gold})` }} />
        <Interactive.Div name="Icon" style={{ fontSize: 64, marginBottom: 24, scale: interpolate(frame, [0.3 * fps, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 200 }) }) }}>
          {opts.icon}
        </Interactive.Div>
        <Interactive.Div name="Title" style={{ fontSize: 52, fontWeight: 700, color: COLORS.white, textAlign: "center" as const, opacity: interpolate(frame, [0.5 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.title}
        </Interactive.Div>
        <Interactive.Div name="Subtitle" style={{ fontSize: 22, color: COLORS.textMuted, textAlign: "center" as const, marginTop: 16, maxWidth: 600, lineHeight: 1.6, opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.subtitle}
        </Interactive.Div>
        <Interactive.Div name="UpNext" style={{ display: "flex", gap: 16, marginTop: 48, opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.upNext.map((t) => (
            <div key={t} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 24px", textAlign: "center" as const }}>
              <div style={{ fontSize: 12, color: COLORS.accentBright, fontFamily: monoFamily, marginBottom: 6 }}>
                {opts.isFinal ? "WATCH AGAIN" : "UP NEXT"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>{t}</div>
            </div>
          ))}
        </Interactive.Div>
        <Interactive.Div name="Footer" style={{ position: "absolute", bottom: 40, fontSize: 14, color: COLORS.textMuted, fontFamily: monoFamily, opacity: interpolate(frame, [2 * fps, 2.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          ops.kdsquares.com · KD Squares Ltd
        </Interactive.Div>
      </AbsoluteFill>
    );
  };
  Comp.displayName = `${opts.title.replace(/\s/g, "")}Outro`;
  return Comp;
};
