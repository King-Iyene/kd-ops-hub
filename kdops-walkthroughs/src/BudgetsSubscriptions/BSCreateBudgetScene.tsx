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
  { label: "Department", value: "Marketing", hint: "Choose which department this budget is for" },
  { label: "Budget Amount", value: "₦800,000", hint: "Total amount for the period" },
  { label: "Period", value: "Quarterly", hint: "Monthly, Quarterly, or Annual" },
  { label: "Category", value: "Advertising & Campaigns", hint: "What will the money be used for" },
  { label: "Notes", value: "Q4 campaign push — social media ads + influencer partnerships", hint: "Optional details for your finance team" },
];

export const BSCreateBudgetScene: React.FC = () => {
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
        Create a Budget
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 8,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Click "+ New Budget" and fill in the form
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 18,
          color: COLORS.textMuted,
          marginBottom: 32,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        From the Budgets page, click the "+ New Budget" button in the top-right
        corner. A form will open — fill in each field like this:
      </Interactive.Div>

      {/* Mock form */}
      <Interactive.Div
        name="FormCard"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          padding: "28px 28px 20px",
          border: `1px solid ${COLORS.border}`,
          opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {FORM_FIELDS.map((field, i) => {
          const delay = 1 + i * 0.35;
          const fieldOpacity = interpolate(
            frame,
            [delay * fps, (delay + 0.3) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          return (
            <div
              key={field.label}
              style={{
                marginBottom: 18,
                opacity: fieldOpacity,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>
                {field.label}
              </div>
              <div
                style={{
                  background: COLORS.bgLight,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "12px 16px",
                  fontSize: 16,
                  color: COLORS.white,
                  fontFamily: field.label === "Budget Amount" ? monoFamily : fontFamily,
                }}
              >
                {field.value}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4, fontStyle: "italic" }}>
                {field.hint}
              </div>
            </div>
          );
        })}
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 20,
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
        Set realistic budgets based on last quarter's spending patterns.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
