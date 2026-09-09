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

const VEHICLES = [
  { plate: "LG-234-KJA", type: "Sedan", driver: "Adebayo O.", status: "Active", statusColor: COLORS.green, budget: "₦85,000/mo" },
  { plate: "AB-789-SMK", type: "SUV", driver: "Chioma E.", status: "Active", statusColor: COLORS.green, budget: "₦120,000/mo" },
  { plate: "KN-012-GHI", type: "Truck", driver: "Ibrahim M.", status: "Maintenance", statusColor: COLORS.orange, budget: "₦200,000/mo" },
  { plate: "PH-456-XYZ", type: "Van", driver: "Ngozi A.", status: "Active", statusColor: COLORS.green, budget: "₦95,000/mo" },
];

const HEADERS = ["Plate Number", "Type", "Driver", "Status", "Fuel Budget"];

export const FFFleetOverviewScene: React.FC = () => {
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
        Fleet Overview
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 40,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Vehicle registry
      </Interactive.Div>

      {/* Header row */}
      <Interactive.Div
        name="TableHeader"
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr 1fr",
          gap: 12,
          padding: "16px 24px",
          borderRadius: 10,
          background: `${COLORS.accent}33`,
          marginBottom: 12,
          opacity: interpolate(frame, [0.5 * fps, 0.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {HEADERS.map((h) => (
          <div
            key={h}
            style={{
              fontSize: 13,
              fontFamily: monoFamily,
              color: COLORS.accentBright,
              letterSpacing: 1,
              textTransform: "uppercase" as const,
            }}
          >
            {h}
          </div>
        ))}
      </Interactive.Div>

      {/* Data rows */}
      {VEHICLES.map((v, i) => {
        const delay = 0.9 + i * 0.35;
        return (
          <Interactive.Div
            key={v.plate}
            name={`Row-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr 1fr",
              gap: 12,
              padding: "18px 24px",
              borderRadius: 10,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              marginBottom: 8,
              opacity: interpolate(
                frame,
                [delay * fps, (delay + 0.3) * fps],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }
              ),
              translate: interpolate(
                frame,
                [delay * fps, (delay + 0.3) * fps],
                ["0px 20px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }
              ),
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 600, color: COLORS.white, fontFamily: monoFamily }}>{v.plate}</div>
            <div style={{ fontSize: 17, color: COLORS.textMuted }}>{v.type}</div>
            <div style={{ fontSize: 17, color: COLORS.white }}>{v.driver}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: v.statusColor }}>{v.status}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: COLORS.gold }}>{v.budget}</div>
          </Interactive.Div>
        );
      })}
    </AbsoluteFill>
  );
};
