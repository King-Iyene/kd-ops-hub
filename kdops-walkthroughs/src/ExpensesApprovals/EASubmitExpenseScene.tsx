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

const CATEGORIES = ["Fuel", "Transport", "Equipment", "General", "Meals", "Other"];

export const EASubmitExpenseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animate fields filling in one by one
  const categoryFill = frame > 1.5 * fps;
  const amountFill = frame > 2.0 * fps;
  const dateFill = frame > 2.5 * fps;
  const descFill = frame > 3.0 * fps;
  const receiptFill = frame > 3.5 * fps;
  const submitReady = frame > 4.2 * fps;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
      }}
    >
      {/* Scene label */}
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.accentBright,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Step-by-step
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 8,
          opacity: interpolate(frame, [0.1 * fps, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Submitting a New Expense
      </Interactive.Div>

      <Interactive.Div
        name="Instruction"
        style={{
          fontSize: 16,
          color: COLORS.textMuted,
          marginBottom: 24,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Click the{" "}
        <span
          style={{
            background: COLORS.accent,
            color: COLORS.white,
            padding: "2px 10px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          + New Expense
        </span>{" "}
        button at the top of the Expenses page. Then fill in the form below:
      </Interactive.Div>

      {/* Expense form mock */}
      <Interactive.Div
        name="Form"
        style={{
          background: COLORS.surface,
          borderRadius: 12,
          border: `1px solid ${COLORS.border}`,
          padding: "28px 32px",
          maxWidth: 700,
          opacity: interpolate(frame, [0.6 * fps, 0.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white, marginBottom: 24 }}>
          New Expense
        </div>

        {/* Category */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6, fontFamily: monoFamily, letterSpacing: 1 }}>
            CATEGORY
          </div>
          <div
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${categoryFill ? COLORS.accentBright : COLORS.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 14,
              color: categoryFill ? COLORS.white : COLORS.textMuted,
              display: "flex",
              justifyContent: "space-between",
              transition: "border-color 0.3s",
            }}
          >
            <span>{categoryFill ? "Fuel" : "Select category..."}</span>
            <span style={{ color: COLORS.textMuted }}>&#x25BC;</span>
          </div>
          {categoryFill && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
              Options: {CATEGORIES.join(", ")}
            </div>
          )}
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6, fontFamily: monoFamily, letterSpacing: 1 }}>
            AMOUNT
          </div>
          <div
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${amountFill ? COLORS.accentBright : COLORS.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 14,
              color: amountFill ? COLORS.white : COLORS.textMuted,
              transition: "border-color 0.3s",
            }}
          >
            {amountFill ? "₦15,000" : "₦ 0.00"}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6, fontFamily: monoFamily, letterSpacing: 1 }}>
            DATE
          </div>
          <div
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${dateFill ? COLORS.accentBright : COLORS.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 14,
              color: dateFill ? COLORS.white : COLORS.textMuted,
              transition: "border-color 0.3s",
            }}
          >
            {dateFill ? "02/10/2026" : "DD/MM/YYYY"}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6, fontFamily: monoFamily, letterSpacing: 1 }}>
            DESCRIPTION
          </div>
          <div
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${descFill ? COLORS.accentBright : COLORS.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 14,
              color: descFill ? COLORS.white : COLORS.textMuted,
              minHeight: 40,
              transition: "border-color 0.3s",
            }}
          >
            {descFill
              ? "Office generator fuel — October week 1"
              : "Describe your expense..."}
          </div>
        </div>

        {/* Receipt upload */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6, fontFamily: monoFamily, letterSpacing: 1 }}>
            RECEIPT
          </div>
          <div
            style={{
              background: receiptFill ? `${COLORS.green}15` : COLORS.bgLight,
              border: `2px dashed ${receiptFill ? COLORS.green : COLORS.border}`,
              borderRadius: 8,
              padding: "18px 14px",
              fontSize: 13,
              color: receiptFill ? COLORS.green : COLORS.textMuted,
              textAlign: "center" as const,
              transition: "all 0.3s",
            }}
          >
            {receiptFill
              ? "✅ fuel_receipt_oct.jpg uploaded"
              : "Drag & drop receipt or click to upload"}
          </div>
        </div>

        {/* Submit button */}
        <div
          style={{
            background: submitReady ? COLORS.accent : COLORS.border,
            borderRadius: 8,
            padding: "12px 0",
            textAlign: "center" as const,
            fontSize: 15,
            fontWeight: 700,
            color: COLORS.white,
            transition: "background 0.3s",
          }}
        >
          Submit Expense
        </div>
      </Interactive.Div>

      {/* Callouts */}
      <div style={{ display: "flex", gap: 14, marginTop: 18, maxWidth: 700 }}>
        <Interactive.Div
          name="ReceiptTip"
          style={{
            flex: 1,
            background: `${COLORS.accent}22`,
            borderRadius: 8,
            padding: "12px 16px",
            borderLeft: `3px solid ${COLORS.accentBright}`,
            opacity: interpolate(frame, [4.5 * fps, 4.9 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: COLORS.accentBright }}>
              &#x1F4A1; Tip:
            </span>{" "}
            Always attach your receipt! Expenses without receipts may be rejected.
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="BankTip"
          style={{
            flex: 1,
            background: `${COLORS.gold}18`,
            borderRadius: 8,
            padding: "12px 16px",
            borderLeft: `3px solid ${COLORS.gold}`,
            opacity: interpolate(frame, [5.0 * fps, 5.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: COLORS.gold }}>
              &#x1F4A1; Important:
            </span>{" "}
            Go to{" "}
            <span style={{ fontWeight: 700 }}>My Portal &rarr; Profile</span> to
            add your bank account details for reimbursements.
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
