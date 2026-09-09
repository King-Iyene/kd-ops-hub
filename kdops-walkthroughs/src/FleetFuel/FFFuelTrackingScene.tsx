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

const FUEL_ENTRIES = [
  { date: "03 Sep", vehicle: "LG-234-KJA", litres: "45L", amount: "₦38,250", station: "Total Lekki" },
  { date: "01 Sep", vehicle: "AB-789-SMK", litres: "60L", amount: "₦51,000", station: "NNPC Ikeja" },
  { date: "28 Aug", vehicle: "KN-012-GHI", litres: "80L", amount: "₦68,000", station: "Mobil Apapa" },
  { date: "25 Aug", vehicle: "PH-456-XYZ", litres: "50L", amount: "₦42,500", station: "Conoil PH" },
];

const WEEK_BARS = [
  { label: "Wk 1", value: 45, amount: "₦38k" },
  { label: "Wk 2", value: 70, amount: "₦59k" },
  { label: "Wk 3", value: 85, amount: "₦68k" },
  { label: "Wk 4", value: 40, amount: "₦35k" },
];

export const FFFuelTrackingScene: React.FC = () => {
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
        Fuel Tracking
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
        Monthly fuel log
      </Interactive.Div>

      <div style={{ display: "flex", gap: 24 }}>
        {/* Left: fuel entries table */}
        <div style={{ flex: 1.4 }}>
          {/* Table header */}
          <Interactive.Div
            name="FuelHeader"
            style={{
              display: "grid",
              gridTemplateColumns: "0.8fr 1.2fr 0.6fr 0.8fr 1fr",
              gap: 8,
              padding: "14px 20px",
              borderRadius: 10,
              background: `${COLORS.accent}33`,
              marginBottom: 10,
              opacity: interpolate(frame, [0.5 * fps, 0.8 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {["Date", "Vehicle", "Litres", "Amount", "Station"].map((h) => (
              <div
                key={h}
                style={{
                  fontSize: 12,
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

          {/* Rows */}
          {FUEL_ENTRIES.map((entry, i) => {
            const delay = 0.9 + i * 0.3;
            return (
              <Interactive.Div
                key={`${entry.date}-${entry.vehicle}`}
                name={`FuelRow-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "0.8fr 1.2fr 0.6fr 0.8fr 1fr",
                  gap: 8,
                  padding: "14px 20px",
                  borderRadius: 10,
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  marginBottom: 6,
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
                <div style={{ fontSize: 15, color: COLORS.textMuted }}>{entry.date}</div>
                <div style={{ fontSize: 15, fontFamily: monoFamily, color: COLORS.white }}>{entry.vehicle}</div>
                <div style={{ fontSize: 15, color: COLORS.white }}>{entry.litres}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.gold }}>{entry.amount}</div>
                <div style={{ fontSize: 15, color: COLORS.textMuted }}>{entry.station}</div>
              </Interactive.Div>
            );
          })}
        </div>

        {/* Right: Monthly spend summary */}
        <Interactive.Div
          name="SpendSummary"
          style={{
            flex: 0.6,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: 28,
            opacity: interpolate(frame, [1.2 * fps, 1.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 12, fontFamily: monoFamily, color: COLORS.accentBright, letterSpacing: 1.5, marginBottom: 12, textTransform: "uppercase" as const }}>
            Monthly Total
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.gold, marginBottom: 24 }}>
            {"₦"}199,750
          </div>

          {/* Bar chart mock */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 120 }}>
            {WEEK_BARS.map((bar, i) => {
              const barDelay = 1.6 + i * 0.2;
              const barHeight = interpolate(
                frame,
                [barDelay * fps, (barDelay + 0.4) * fps],
                [0, bar.value],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }
              );
              return (
                <div key={bar.label} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flex: 1 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{bar.amount}</div>
                  <div
                    style={{
                      width: "100%",
                      height: barHeight,
                      background: `linear-gradient(180deg, ${COLORS.accentBright}, ${COLORS.accent})`,
                      borderRadius: 4,
                    }}
                  />
                  <div style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, marginTop: 6 }}>{bar.label}</div>
                </div>
              );
            })}
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
