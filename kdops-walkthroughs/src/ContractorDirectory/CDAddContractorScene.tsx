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

const BASIC_FIELDS = [
  { label: "Company / Individual Name", value: "TechServe Solutions" },
  { label: "Contact Person", value: "Emeka Nwachukwu" },
  { label: "Email", value: "emeka@techserve.ng" },
  { label: "Phone", value: "+234 802 345 6789" },
  { label: "Service Category", value: "IT Consulting", isDropdown: true },
  { label: "Contract Type", value: "Monthly Retainer", isDropdown: true },
  { label: "Payment Amount", value: "₦850,000" },
  { label: "Contract Start Date", value: "01 Jan 2026" },
  { label: "Contract End Date", value: "31 Dec 2026" },
];

const BANK_FIELDS = [
  { label: "Bank Name", value: "First Bank of Nigeria" },
  { label: "Account Number", value: "2034567890" },
  { label: "Account Name", value: "TechServe Solutions Ltd" },
];

const STEPS = [
  { num: "1", title: 'Click "+ Add Contractor"', desc: "Top-right of the Contractors page" },
  { num: "2", title: "Enter contractor info", desc: "Name, contact person, email, phone" },
  { num: "3", title: "Set service & contract terms", desc: "Category, type, amount, dates" },
  { num: "4", title: "Add bank details", desc: "Required for payment processing" },
  { num: "5", title: "Save contractor", desc: "Ready for Contractor Payment batches" },
];

export const CDAddContractorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "36px 56px",
      }}
    >
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 12,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 4,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <span style={{ color: COLORS.accentBright }}>People & HR</span>
        <span style={{ margin: "0 6px" }}>→</span>
        <span style={{ color: COLORS.accentBright }}>Contractors</span>
        <span style={{ margin: "0 6px" }}>→</span>
        <span style={{ color: COLORS.white }}>Add Contractor</span>
      </Interactive.Div>

      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.green,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 4,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Adding a Contractor
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 38,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 20,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        How to add a new contractor
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24 }}>
        {/* Steps sidebar */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
          {STEPS.map((step, i) => {
            const delay = 0.4 + i * 0.3;
            const activeStep = frame < 3 * fps ? 0
              : frame < 5 * fps ? 1
              : frame < 7 * fps ? 2
              : frame < 9 * fps ? 3
              : 4;
            const isActive = i === activeStep;
            return (
              <Interactive.Div
                key={step.num}
                name={`Step-${i}`}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  background: isActive ? `${COLORS.accent}22` : COLORS.surface,
                  borderRadius: 10,
                  padding: "12px 14px",
                  border: `1px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                  opacity: interpolate(frame, [delay * fps, (delay + 0.25) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: isActive ? COLORS.accentBright : COLORS.accent,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: isActive ? COLORS.bg : COLORS.white,
                    flexShrink: 0,
                  }}
                >
                  {step.num}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white, marginBottom: 2 }}>{step.title}</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>{step.desc}</div>
                </div>
              </Interactive.Div>
            );
          })}
        </div>

        {/* Form panel */}
        <Interactive.Div
          name="Form"
          style={{
            background: COLORS.surface,
            borderRadius: 14,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            display: "flex",
            flexDirection: "column" as const,
            gap: 16,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white }}>
            + Add Contractor
          </div>

          {/* Basic fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {BASIC_FIELDS.map((field, i) => {
              const fillDelay = 2 + i * 0.25;
              const fieldFilled = frame > fillDelay * fps;
              return (
                <div key={field.label}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 3, fontFamily: monoFamily }}>{field.label}</div>
                  <div
                    style={{
                      background: COLORS.bg,
                      border: `1px solid ${fieldFilled ? COLORS.accentBright : COLORS.border}`,
                      borderRadius: 7,
                      padding: "8px 12px",
                      fontSize: 13,
                      color: fieldFilled ? COLORS.white : COLORS.textMuted,
                      minHeight: 18,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{fieldFilled ? field.value : ""}</span>
                    {field.isDropdown && <span style={{ fontSize: 10, color: COLORS.textMuted }}>▾</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bank Details section - EMPHASIZED */}
          <Interactive.Div
            name="BankSection"
            style={{
              background: `${COLORS.orange}11`,
              border: `2px solid ${COLORS.orange}`,
              borderRadius: 12,
              padding: 16,
              opacity: interpolate(frame, [7 * fps, 7.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.orange, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏦</span> Bank / Payment Details
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {BANK_FIELDS.map((field, i) => {
                const fillDelay = 7.5 + i * 0.3;
                const fieldFilled = frame > fillDelay * fps;
                return (
                  <div key={field.label}>
                    <div style={{ fontSize: 11, color: COLORS.orange, marginBottom: 3, fontFamily: monoFamily, fontWeight: 600 }}>{field.label}</div>
                    <div
                      style={{
                        background: COLORS.bg,
                        border: `1px solid ${fieldFilled ? COLORS.orange : COLORS.border}`,
                        borderRadius: 7,
                        padding: "8px 12px",
                        fontSize: 13,
                        color: fieldFilled ? COLORS.white : COLORS.textMuted,
                        minHeight: 18,
                      }}
                    >
                      {fieldFilled ? field.value : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </Interactive.Div>

          {/* Bank warning callout */}
          <Interactive.Div
            name="BankWarning"
            style={{
              background: `${COLORS.red}15`,
              borderRadius: 10,
              padding: "12px 18px",
              borderLeft: `4px solid ${COLORS.red}`,
              opacity: interpolate(frame, [8.5 * fps, 9 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <div style={{ fontSize: 14, color: COLORS.red, fontWeight: 700 }}>
              ⚠️ IMPORTANT: Always fill in the contractor's bank details — without this, payments cannot be processed through Payment Batches
            </div>
          </Interactive.Div>

          {/* Submit button */}
          <div
            style={{
              background: frame > 10 * fps ? COLORS.green : COLORS.accentBright,
              borderRadius: 10,
              padding: "12px 24px",
              textAlign: "center" as const,
              fontSize: 16,
              fontWeight: 700,
              color: frame > 10 * fps ? COLORS.white : COLORS.bg,
              opacity: interpolate(frame, [9.5 * fps, 10 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            {frame > 10.5 * fps ? "✓ Contractor Saved!" : "Save Contractor →"}
          </div>
        </Interactive.Div>
      </div>

      {/* Bottom callout */}
      <Interactive.Div
        name="BottomCallout"
        style={{
          marginTop: 12,
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "12px 20px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [11 * fps, 11.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.accentBright, fontWeight: 600 }}>
          💡 After adding a contractor, you can include them in Contractor Payment batches
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
