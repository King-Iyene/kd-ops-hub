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
  { label: "Vehicle", value: "Office Toyota Hilux (KD-001AB)", type: "dropdown" },
  { label: "Fuel Type", value: "PMS (Petrol)", type: "dropdown" },
  { label: "Amount Requested", value: "₦15,000", type: "input" },
  { label: "Current Odometer", value: "45,230 km", type: "input" },
  { label: "Station / Vendor", value: "Total Energies — Lekki", type: "input" },
  { label: "Receipt", value: "fuel-receipt-sept.jpg", type: "upload" },
];

const TABS = [
  "Dashboard",
  "My Requests",
  "Fuel",
  "Trips",
  "Vehicles",
  "Maintenance",
];

export const FFFuelTrackingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
      }}
    >
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 10,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ color: COLORS.accentBright }}>Operations</span>
        <span style={{ margin: "0 8px" }}>{"›"}</span>
        <span style={{ color: COLORS.accentBright }}>Fleet</span>
        <span style={{ margin: "0 8px" }}>{"›"}</span>
        <span style={{ color: COLORS.white }}>My Requests</span>
      </Interactive.Div>

      {/* Title */}
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 16,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Submitting a Fuel Request
      </Interactive.Div>

      {/* Tab bar with My Requests highlighted */}
      <Interactive.Div
        name="TabBar"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `2px solid ${COLORS.border}`,
          marginBottom: 24,
          opacity: interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {TABS.map((tab, i) => {
          const isActive = tab === "My Requests";
          return (
            <div
              key={tab}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? COLORS.accentBright : COLORS.textMuted,
                borderBottom: isActive
                  ? `2px solid ${COLORS.accentBright}`
                  : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              {tab}
            </div>
          );
        })}
      </Interactive.Div>

      {/* Cursor clicking My Requests indicator */}
      <Interactive.Div
        name="ClickHint"
        style={{
          fontSize: 13,
          color: COLORS.accentBright,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: interpolate(frame, [0.7 * fps, 1.0 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ fontSize: 16 }}>👆</span>
        <span style={{ fontFamily: monoFamily, letterSpacing: 1 }}>
          Click "My Requests" tab → then "New Fuel Request"
        </span>
      </Interactive.Div>

      {/* Fuel request form */}
      <Interactive.Div
        name="FormContainer"
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          padding: "28px 32px",
          marginBottom: 16,
          opacity: interpolate(frame, [1.0 * fps, 1.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.white,
            marginBottom: 24,
          }}
        >
          New Fuel Request
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px 28px",
          }}
        >
          {FORM_FIELDS.map((field, i) => {
            const fieldDelay = 1.4 + i * 0.3;
            const fillProgress = interpolate(
              frame,
              [fieldDelay * fps, (fieldDelay + 0.4) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div key={field.label}>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: monoFamily,
                    color: COLORS.textMuted,
                    letterSpacing: 1,
                    textTransform: "uppercase" as const,
                    marginBottom: 6,
                  }}
                >
                  {field.label}
                </div>
                <div
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${fillProgress > 0.5 ? COLORS.accentBright : COLORS.border}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    fontSize: 15,
                    color: fillProgress > 0.5 ? COLORS.white : COLORS.textMuted,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "border-color 0.2s",
                  }}
                >
                  <span>
                    {fillProgress > 0.5 ? field.value : "—"}
                  </span>
                  {field.type === "dropdown" && (
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                      ▼
                    </span>
                  )}
                  {field.type === "upload" && (
                    <span style={{ fontSize: 12, color: COLORS.accentBright }}>
                      📎
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit button */}
        <Interactive.Div
          name="SubmitBtn"
          style={{
            marginTop: 24,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
            borderRadius: 10,
            padding: "14px 32px",
            fontSize: 16,
            fontWeight: 700,
            color: COLORS.bg,
            opacity: interpolate(frame, [3.4 * fps, 3.8 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [3.4 * fps, 3.8 * fps], [0.9, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Submit Request
        </Interactive.Div>
      </Interactive.Div>

      {/* Callouts */}
      <div style={{ display: "flex", gap: 14 }}>
        <Interactive.Div
          name="Callout1"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: `${COLORS.accentBright}12`,
            border: `1px solid ${COLORS.accentBright}33`,
            borderRadius: 10,
            padding: "12px 16px",
            opacity: interpolate(frame, [3.8 * fps, 4.2 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
            Always record the odometer reading — it helps track fuel efficiency
            and flag anomalies
          </span>
        </Interactive.Div>

        <Interactive.Div
          name="Callout2"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: `${COLORS.gold}12`,
            border: `1px solid ${COLORS.gold}33`,
            borderRadius: 10,
            padding: "12px 16px",
            opacity: interpolate(frame, [4.2 * fps, 4.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
            Attach your fuel receipt for faster approval
          </span>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
