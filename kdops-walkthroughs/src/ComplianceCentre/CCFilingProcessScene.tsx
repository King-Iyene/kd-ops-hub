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

const STEPS = [
  {
    num: 1,
    title: "Select filing type",
    desc: "Click on the compliance item you need to file — for example, \"PAYE Filing\".",
    detail: "Filing Type: PAYE  |  Period: September 2026",
  },
  {
    num: 2,
    title: "Upload your document",
    desc: "Click \"Upload Document\" and choose the file from your computer (PDF or scanned image).",
    detail: "File: PAYE_Sept_2026_Receipt.pdf  |  Size: 340 KB",
  },
  {
    num: 3,
    title: "Add reference number",
    desc: "Type the reference number from the tax authority into the Reference field.",
    detail: "Reference: PAY-2026-09-001",
  },
  {
    num: 4,
    title: "Submit",
    desc: "Review everything, then click the green \"Submit Filing\" button. KDOps will mark this item as filed.",
    detail: "Status changes: Due Soon → Filed",
  },
];

export const CCFilingProcessScene: React.FC = () => {
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
        Filing a Compliance Item
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 12,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        How to file a PAYE return, step by step
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 18,
          color: COLORS.textMuted,
          marginBottom: 32,
          maxWidth: 720,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Let's walk through filing a PAYE return for September 2026. The same
        steps apply to any compliance item.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 18 }}>
        {STEPS.map((step, i) => {
          const delay = 0.8 + i * 0.5;
          return (
            <Interactive.Div
              key={step.title}
              name={`Step-${i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: COLORS.accentBright,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  color: COLORS.bg,
                  flexShrink: 0,
                }}
              >
                {step.num}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5, marginBottom: 8 }}>
                  {step.desc}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontFamily: monoFamily,
                    color: COLORS.accentBright,
                    background: `${COLORS.accent}33`,
                    borderRadius: 6,
                    padding: "8px 14px",
                    display: "inline-block",
                  }}
                >
                  {step.detail}
                </div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 28,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          color: COLORS.accentBright,
          lineHeight: 1.5,
          opacity: interpolate(frame, [3.5 * fps, 3.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Always keep your filing reference numbers — you may need them for
        audits.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
