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

const LEAVE_TYPES = ["Annual Leave", "Sick Leave", "Compassionate", "Maternity / Paternity", "Study Leave", "Unpaid Leave"];

const FORM_FIELDS: Array<{
  label: string;
  value: string;
  span?: boolean;
  type?: "dropdown" | "text" | "computed" | "textarea" | "file";
  options?: string[];
}> = [
  { label: "Leave Type", value: "Annual Leave", type: "dropdown", options: LEAVE_TYPES },
  { label: "Start Date", value: "20/10/2026", type: "text" },
  { label: "End Date", value: "22/10/2026", type: "text" },
  { label: "Duration", value: "3 working days", type: "computed" },
  { label: "Reason", value: "Family event — travelling to Calabar", span: true, type: "textarea" },
  { label: "Handover Notes", value: "Funke Adeyemi to cover my tasks", span: true, type: "textarea" },
  { label: "Attachment (optional)", value: "medical-certificate.pdf", type: "file" },
];

export const LRRequestScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = (start: number, dur = 0.4) =>
    interpolate(frame, [start * fps, (start + dur) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 70px",
      }}
    >
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 13,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: fade(0),
        }}
      >
        People &amp; HR &nbsp;→&nbsp; Time &amp; Leave &nbsp;→&nbsp; Leave &nbsp;→&nbsp;{" "}
        <span style={{ color: COLORS.green }}>New Request</span>
      </Interactive.Div>

      {/* Title */}
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 40,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 6,
          opacity: fade(0.15),
        }}
      >
        Request Leave
      </Interactive.Div>

      <Interactive.Div
        name="Subtitle"
        style={{
          fontSize: 16,
          color: COLORS.textMuted,
          marginBottom: 28,
          opacity: fade(0.25),
        }}
      >
        Click <span style={{ color: COLORS.accentBright, fontWeight: 600 }}>+ Request Leave</span> to open this form
      </Interactive.Div>

      {/* Form card */}
      <Interactive.Div
        name="FormCard"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          padding: 28,
          border: `1px solid ${COLORS.border}`,
          opacity: fade(0.5),
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.white, marginBottom: 22 }}>
          New Leave Request
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {FORM_FIELDS.map((field, i) => {
            const fillDelay = 0.8 + i * 0.35;
            const fieldFilled = frame > fillDelay * fps;
            const isComputed = field.type === "computed";
            const isFile = field.type === "file";
            const isDropdown = field.type === "dropdown";

            return (
              <div
                key={field.label}
                style={{
                  gridColumn: field.span ? "1 / -1" : undefined,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textMuted,
                    marginBottom: 4,
                    fontFamily: monoFamily,
                  }}
                >
                  {field.label}
                </div>
                <div
                  style={{
                    background: isComputed ? `${COLORS.accentBright}12` : COLORS.bg,
                    border: `1px solid ${fieldFilled ? (isComputed ? COLORS.accentBright : COLORS.accentBright) : COLORS.border}`,
                    borderRadius: 8,
                    padding: field.span ? "10px 14px" : "10px 14px",
                    fontSize: 14,
                    color: fieldFilled
                      ? isComputed
                        ? COLORS.accentBright
                        : COLORS.white
                      : COLORS.textMuted,
                    minHeight: field.span ? 36 : 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontWeight: isComputed ? 600 : 400,
                  }}
                >
                  <span>{fieldFilled ? field.value : ""}</span>
                  {isDropdown && (
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>▾</span>
                  )}
                  {isFile && fieldFilled && (
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>📎</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit button */}
        <div
          style={{
            marginTop: 22,
            background: frame > 4.5 * fps ? COLORS.green : COLORS.accentBright,
            borderRadius: 8,
            padding: "12px 24px",
            textAlign: "center" as const,
            fontSize: 16,
            fontWeight: 700,
            color: frame > 4.5 * fps ? COLORS.white : COLORS.bg,
            opacity: fade(3.8),
          }}
        >
          {frame > 4.5 * fps ? "✓ Request Submitted!" : "Submit Request"}
        </div>
      </Interactive.Div>

      {/* Callouts */}
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <Interactive.Div
          name="CalloutHandover"
          style={{
            flex: 1,
            background: `${COLORS.accentBright}12`,
            border: `1px solid ${COLORS.accentBright}44`,
            borderRadius: 10,
            padding: "10px 16px",
            fontSize: 13,
            color: COLORS.accentBright,
            opacity: fade(4.8),
          }}
        >
          💡 Always add handover notes so your team knows who's covering your responsibilities
        </Interactive.Div>

        <Interactive.Div
          name="CalloutMedical"
          style={{
            flex: 1,
            background: `${COLORS.gold}12`,
            border: `1px solid ${COLORS.gold}44`,
            borderRadius: 10,
            padding: "10px 16px",
            fontSize: 13,
            color: COLORS.gold,
            opacity: fade(5.2),
          }}
        >
          💡 For sick leave beyond 2 days, attach a medical certificate
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
