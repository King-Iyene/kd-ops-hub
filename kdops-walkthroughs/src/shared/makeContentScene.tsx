import {
  AbsoluteFill,
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

type CardItem = { title: string; desc: string; icon?: string; color?: string; value?: string };
type Step = { num: string; title: string; desc: string };

export const makeStepsScene = (opts: {
  label: string;
  labelColor: string;
  title: string;
  steps: Step[];
  formTitle?: string;
  formFields?: { label: string; value: string }[];
}) => {
  const Comp: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return (
      <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "50px 80px" }}>
        <Interactive.Div name="Label" style={{ fontSize: 16, fontFamily: monoFamily, color: opts.labelColor, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 8, opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.label}
        </Interactive.Div>
        <Interactive.Div name="Title" style={{ fontSize: 48, fontWeight: 700, color: COLORS.white, marginBottom: 32, opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.title}
        </Interactive.Div>
        <div style={{ display: "grid", gridTemplateColumns: opts.formFields ? "1fr 1fr" : "1fr", gap: 32 }}>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            {opts.steps.map((step, i) => {
              const delay = 0.5 + i * 0.35;
              const isActive = Math.floor((frame - 3 * fps) / (1.5 * fps)) % opts.steps.length === i && frame > 3 * fps;
              return (
                <Interactive.Div key={step.num} name={`Step-${i}`} style={{ display: "flex", gap: 16, alignItems: "flex-start", background: isActive ? `${COLORS.accent}22` : COLORS.surface, borderRadius: 12, padding: "16px 20px", border: `1px solid ${isActive ? COLORS.accentBright : COLORS.border}`, opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: isActive ? COLORS.accentBright : COLORS.accent, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16, fontWeight: 700, color: COLORS.white, flexShrink: 0 }}>{step.num}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: COLORS.white, marginBottom: 4 }}>{step.title}</div>
                    <div style={{ fontSize: 14, color: COLORS.textMuted }}>{step.desc}</div>
                  </div>
                </Interactive.Div>
              );
            })}
          </div>
          {opts.formFields && (
            <Interactive.Div name="Form" style={{ background: COLORS.surface, borderRadius: 14, padding: 24, border: `1px solid ${COLORS.border}`, opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 16 }}>{opts.formTitle || "Form"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {opts.formFields.map((f, i) => {
                  const filled = frame > (2 + i * 0.25) * fps;
                  return (
                    <div key={f.label}>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, fontFamily: monoFamily }}>{f.label}</div>
                      <div style={{ background: COLORS.bg, border: `1px solid ${filled ? COLORS.accentBright : COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, color: filled ? COLORS.white : COLORS.textMuted, minHeight: 18 }}>
                        {filled ? f.value : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Interactive.Div>
          )}
        </div>
      </AbsoluteFill>
    );
  };
  return Comp;
};

export const makeCardsScene = (opts: {
  label: string;
  labelColor: string;
  title: string;
  subtitle?: string;
  cards: CardItem[];
  columns?: number;
  callout?: string;
}) => {
  const Comp: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const cols = opts.columns || 2;
    return (
      <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "50px 80px" }}>
        <Interactive.Div name="Label" style={{ fontSize: 16, fontFamily: monoFamily, color: opts.labelColor, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 8, opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.label}
        </Interactive.Div>
        <Interactive.Div name="Title" style={{ fontSize: 48, fontWeight: 700, color: COLORS.white, marginBottom: opts.subtitle ? 12 : 32, opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.title}
        </Interactive.Div>
        {opts.subtitle && (
          <Interactive.Div name="Sub" style={{ fontSize: 18, color: COLORS.textMuted, marginBottom: 32, maxWidth: 700, lineHeight: 1.5, opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            {opts.subtitle}
          </Interactive.Div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
          {opts.cards.map((card, i) => {
            const delay = 0.6 + i * 0.25;
            return (
              <Interactive.Div key={card.title} name={`Card-${i}`} style={{ background: COLORS.surface, borderRadius: 12, padding: 22, border: `1px solid ${COLORS.border}`, opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
                {card.icon && <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>}
                <div style={{ fontSize: 18, fontWeight: 700, color: card.color || COLORS.white, marginBottom: 6 }}>
                  {card.value ? `${card.title}: ${card.value}` : card.title}
                </div>
                <div style={{ fontSize: 14, color: COLORS.textMuted, lineHeight: 1.4 }}>{card.desc}</div>
              </Interactive.Div>
            );
          })}
        </div>
        {opts.callout && (
          <Interactive.Div name="Callout" style={{ marginTop: 20, background: `${COLORS.accent}22`, borderRadius: 10, padding: "14px 24px", borderLeft: `3px solid ${COLORS.accentBright}`, opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <div style={{ fontSize: 15, color: COLORS.accentBright, fontWeight: 600 }}>💡 {opts.callout}</div>
          </Interactive.Div>
        )}
      </AbsoluteFill>
    );
  };
  return Comp;
};

export const makeTableScene = (opts: {
  label: string;
  labelColor: string;
  title: string;
  stats?: string;
  headers: string[];
  rows: string[][];
  callout?: string;
}) => {
  const Comp: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const colTemplate = opts.headers.map(() => "1fr").join(" ");
    return (
      <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "50px 80px" }}>
        <Interactive.Div name="Label" style={{ fontSize: 16, fontFamily: monoFamily, color: opts.labelColor, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 8, opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.label}
        </Interactive.Div>
        <Interactive.Div name="Title" style={{ fontSize: 48, fontWeight: 700, color: COLORS.white, marginBottom: 12, opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {opts.title}
        </Interactive.Div>
        {opts.stats && <div style={{ fontSize: 16, color: COLORS.textMuted, marginBottom: 24, opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{opts.stats}</div>}
        <Interactive.Div name="Table" style={{ background: COLORS.surface, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: "hidden", opacity: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <div style={{ display: "grid", gridTemplateColumns: colTemplate, padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
            {opts.headers.map((h) => <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>)}
          </div>
          {opts.rows.map((row, i) => {
            const delay = 0.8 + i * 0.15;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: colTemplate, padding: "14px 24px", borderBottom: i < opts.rows.length - 1 ? `1px solid ${COLORS.border}` : "none", opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
                {row.map((cell, j) => <div key={j} style={{ fontSize: 14, color: j === 0 ? COLORS.white : COLORS.textMuted, fontWeight: j === 0 ? 600 : 400 }}>{cell}</div>)}
              </div>
            );
          })}
        </Interactive.Div>
        {opts.callout && (
          <Interactive.Div name="Callout" style={{ marginTop: 20, background: `${COLORS.accent}22`, borderRadius: 10, padding: "14px 24px", borderLeft: `3px solid ${COLORS.accentBright}`, opacity: interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <div style={{ fontSize: 15, color: COLORS.accentBright, fontWeight: 600 }}>💡 {opts.callout}</div>
          </Interactive.Div>
        )}
      </AbsoluteFill>
    );
  };
  return Comp;
};
