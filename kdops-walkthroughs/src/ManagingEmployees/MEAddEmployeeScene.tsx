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

const PERSONAL_FIELDS = [
  { label: "Full Name", value: "Tunde Bakare" },
  { label: "Email Address", value: "tunde.bakare@kdsquares.com" },
  { label: "Phone Number", value: "+234 803 456 7890" },
  { label: "Date of Birth", value: "14 Mar 1992" },
];

const EMPLOYMENT_FIELDS = [
  { label: "Department", value: "Operations" },
  { label: "Job Title", value: "Driver" },
  { label: "Start Date", value: "01 Oct 2026" },
  { label: "Employment Type", value: "Full-time" },
];

const COMPENSATION_FIELDS = [
  { label: "Base Salary", value: "₦180,000 / month" },
  { label: "Pay Group", value: "KDS Administrative" },
];

const BANK_FIELDS = [
  { label: "Bank Name", value: "First Bank of Nigeria" },
  { label: "Account Number", value: "3082456190" },
  { label: "Account Name", value: "Tunde Bakare" },
];

const STEPS = [
  { num: "1", title: "Click \"+ Add Employee\"", desc: "Found at the top-right of the Employees page" },
  { num: "2", title: "Fill in Personal Details", desc: "Full name, email, phone, date of birth" },
  { num: "3", title: "Set Employment Info", desc: "Department, job title, start date, type" },
  { num: "4", title: "Enter Compensation", desc: "Base salary and correct Pay Group" },
  { num: "5", title: "Add Bank Details", desc: "Bank name, account number, account name" },
  { num: "6", title: "Click \"Save Employee\"", desc: "Review everything, then save" },
];

export const MEAddEmployeeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const renderSection = (
    title: string,
    fields: { label: string; value: string }[],
    baseDelay: number,
    highlight?: boolean,
  ) => (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontFamily: monoFamily,
          color: highlight ? COLORS.gold : COLORS.accentBright,
          letterSpacing: 1,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {highlight && <span style={{ fontSize: 14 }}>&#9888;&#65039;</span>}
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {fields.map((field, i) => {
          const fillDelay = baseDelay + i * 0.25;
          const fieldFilled = frame > fillDelay * fps;
          return (
            <div key={field.label}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 3, fontFamily: monoFamily }}>{field.label}</div>
              <div
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${fieldFilled ? (highlight ? COLORS.gold : COLORS.accentBright) : COLORS.border}`,
                  borderRadius: 6,
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
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "30px 60px",
      }}
    >
      <Interactive.Div
        name="SceneLabel"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.green,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Step-by-Step
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
        How to add a new employee
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24 }}>
        {/* Steps column */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {STEPS.map((step, i) => {
            const delay = 0.4 + i * 0.3;
            const activeStep = Math.min(Math.floor((frame - 1.5 * fps) / (1.2 * fps)), STEPS.length - 1);
            const isActive = activeStep === i && frame > 1.5 * fps;
            return (
              <Interactive.Div
                key={step.num}
                name={`Step-${i}`}
                style={{
                  display: "flex",
                  gap: 10,
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
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: isActive ? COLORS.accentBright : COLORS.accent,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLORS.white,
                    flexShrink: 0,
                  }}
                >
                  {step.num}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white, marginBottom: 2 }}>{step.title}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.3 }}>{step.desc}</div>
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
            borderRadius: 12,
            padding: 22,
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [1 * fps, 1.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: COLORS.accentBright }}>+</span> Add Employee
          </div>

          {renderSection("Personal Details", PERSONAL_FIELDS, 1.8)}
          {renderSection("Employment", EMPLOYMENT_FIELDS, 2.8)}
          {renderSection("Compensation", COMPENSATION_FIELDS, 3.6)}
          {renderSection("Bank Details", BANK_FIELDS, 4.2, true)}

          {/* Save button */}
          <div
            style={{
              marginTop: 14,
              background: frame > 5.5 * fps ? COLORS.green : COLORS.accentBright,
              borderRadius: 8,
              padding: "11px 24px",
              textAlign: "center" as const,
              fontSize: 15,
              fontWeight: 700,
              color: frame > 5.5 * fps ? COLORS.white : COLORS.bg,
              opacity: interpolate(frame, [5 * fps, 5.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            {frame > 5.5 * fps ? "✓ Employee Saved!" : "Save Employee"}
          </div>
        </Interactive.Div>
      </div>

      {/* Warning callout */}
      <Interactive.Div
        name="BankWarning"
        style={{
          marginTop: 14,
          background: `${COLORS.gold}18`,
          borderRadius: 10,
          padding: "10px 20px",
          borderLeft: `3px solid ${COLORS.gold}`,
          opacity: interpolate(frame, [4.5 * fps, 5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.gold, fontWeight: 700, marginBottom: 2 }}>
          IMPORTANT: Always fill in the Bank Details section
        </div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
          Without bank details, the employee cannot receive salary payments or expense reimbursements.
        </div>
      </Interactive.Div>

      {/* Pay group callout */}
      <Interactive.Div
        name="PayGroupTip"
        style={{
          marginTop: 8,
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "10px 20px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [5.2 * fps, 5.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.accentBright, fontWeight: 600 }}>
          Assign the employee to the correct Pay Group (e.g. KDS Administrative, Commission Staff) so they appear in payroll runs.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
