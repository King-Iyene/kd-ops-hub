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

const VENDORS = [
  { name: "Total Energies", service: "Fuel Supply", status: "Active", statusColor: COLORS.green, expires: "Dec 2026" },
  { name: "AutoFix Lagos", service: "Maintenance", status: "Active", statusColor: COLORS.green, expires: "Mar 2027" },
  { name: "PetroCam Ltd", service: "Bulk Diesel", status: "Renewal", statusColor: COLORS.orange, expires: "Oct 2026" },
  { name: "DriveSecure", service: "Insurance", status: "Active", statusColor: COLORS.green, expires: "Jun 2027" },
];

export const FFVendorManagementScene: React.FC = () => {
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
        Vendor Management
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
        Fuel & service vendors
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {VENDORS.map((vendor, i) => {
          const delay = 0.6 + i * 0.4;
          return (
            <Interactive.Div
              key={vendor.name}
              name={`Vendor-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: 28,
                border: `1px solid ${COLORS.border}`,
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
              <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
                {vendor.name}
              </div>
              <div style={{ fontSize: 16, color: COLORS.textMuted, marginBottom: 16 }}>
                {vendor.service}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted }}>Contract:</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: vendor.statusColor }}>{vendor.status}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted }}>Expires:</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white }}>{vendor.expires}</div>
                </div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
