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

const FORM_FIELDS = [
  { label: "Contractor Name", value: "James Adeyemi" },
  { label: "Company", value: "Adeyemi Consulting" },
  { label: "Email", value: "james@adeyemi.co" },
  { label: "Contract Type", value: "Fixed-Term" },
  { label: "Monthly Rate", value: "₦450,000" },
  { label: "End Date", value: "31 Dec 2026" },
];

const STEPS = [
  { num: "1", title: 'Click "+ Add Contractor"', desc: "Top-right of Contractors page" },
  { num: "2", title: "Enter contractor details", desc: "Name, company, email, phone" },
  { num: "3", title: "Set contract terms", desc: "Type, rate, start/end dates" },
  { num: "4", title: "Submit & notify", desc: "Contractor receives onboarding email" },
];

export const CDAddContractorScene: React.FC = () => {
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
          color: COLORS.green,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Adding Contractors
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        How to add a new contractor
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          {STEPS.map((step, i) => {
            const delay = 0.5 + i * 0.4;
            const isActive = Math.floor((frame - 3 * fps) / (1.5 * fps)) % 4 === i && frame > 3 * fps;
            return (
              <Interactive.Div
                key={step.num}
                name={`Step-${i}`}
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                  background: isActive ? `${COLORS.accent}22` : COLORS.surface,
                  borderRadius: 12,
                  padding: "18px 20px",
                  border: `1px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                  opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: isActive ? COLORS.accentBright : COLORS.accent,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 16,
                    fontWeight: 700,
                    color: COLORS.white,
                    flexShrink: 0,
                  }}
                >
                  {step.num}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontSize: 14, color: COLORS.textMuted }}>{step.desc}</div>
                </div>
              </Interactive.Div>
            );
          })}
        </div>

        {/* Mock form */}
        <Interactive.Div
          name="Form"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 28,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.white, marginBottom: 20 }}>
            + Add Contractor
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {FORM_FIELDS.map((field, i) => {
              const fillDelay = 2 + i * 0.3;
              const fieldFilled = frame > fillDelay * fps;
              return (
                <div key={field.label}>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 4, fontFamily: monoFamily }}>{field.label}</div>
                  <div
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${fieldFilled ? COLORS.accentBright : COLORS.border}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 14,
                      color: fieldFilled ? COLORS.white : COLORS.textMuted,
                      minHeight: 20,
                    }}
                  >
                    {fieldFilled ? field.value : ""}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Submit button */}
          <div
            style={{
              marginTop: 20,
              background: frame > 4.5 * fps ? COLORS.accentBright : COLORS.accent,
              borderRadius: 8,
              padding: "12px 24px",
              textAlign: "center" as const,
              fontSize: 16,
              fontWeight: 600,
              color: COLORS.white,
              opacity: interpolate(frame, [4 * fps, 4.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            {frame > 5 * fps ? "✓ Contractor Added!" : "Submit & Notify →"}
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
