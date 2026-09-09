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
  {
    name: "Office Toyota Hilux",
    plate: "KD-001AB",
    status: "Active",
    statusColor: COLORS.green,
    km: "45,230 km",
    assigned: "Tunde Bakare",
  },
  {
    name: "Office Honda Accord",
    plate: "KD-002CD",
    status: "Active",
    statusColor: COLORS.green,
    km: "32,100 km",
    assigned: "Service due: 15/10/2026",
  },
  {
    name: "Delivery Van",
    plate: "KD-003EF",
    status: "In Maintenance",
    statusColor: COLORS.orange,
    km: "78,500 km",
    assigned: "Ngozi Okafor",
  },
];

const TRIP_FIELDS = [
  { label: "From", value: "Head Office — Victoria Island" },
  { label: "To", value: "Client Site — Ikeja GRA" },
  { label: "Distance", value: "28 km" },
  { label: "Purpose", value: "Client meeting — Dangote contract" },
];

const MAINTENANCE_ITEMS = [
  { vehicle: "Toyota Hilux (KD-001AB)", service: "Oil change & filter", date: "15/10/2026", cost: "₦35,000" },
  { vehicle: "Honda Accord (KD-002CD)", service: "Brake pad replacement", date: "01/12/2026", cost: "₦52,000" },
];

const TABS = [
  "Dashboard",
  "My Requests",
  "Fuel",
  "Trips",
  "Vehicles",
  "Maintenance",
];

export const FFVendorManagementScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* Phase boundaries (seconds) for three sections */
  const vehiclesEnd = 3.5;
  const tripsEnd = 6.0;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
        overflow: "hidden",
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
        <span style={{ color: COLORS.white }}>Fleet</span>
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
        Managing Vehicles & Trips
      </Interactive.Div>

      {/* Tab bar — Vehicles active first, then Trips, then Maintenance */}
      <Interactive.Div
        name="TabBar"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `2px solid ${COLORS.border}`,
          marginBottom: 20,
          opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {TABS.map((tab) => {
          const isVehicles =
            tab === "Vehicles" && frame < vehiclesEnd * fps;
          const isTrips =
            tab === "Trips" &&
            frame >= vehiclesEnd * fps &&
            frame < tripsEnd * fps;
          const isMaint =
            tab === "Maintenance" && frame >= tripsEnd * fps;
          const isActive = isVehicles || isTrips || isMaint;

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

      {/* ===== SECTION 1: Vehicles ===== */}
      <Interactive.Div
        name="VehiclesSection"
        style={{
          opacity: interpolate(
            frame,
            [0.6 * fps, 1.0 * fps, (vehiclesEnd - 0.3) * fps, vehiclesEnd * fps],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          ),
          display: frame >= vehiclesEnd * fps ? "none" : "block",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontFamily: monoFamily,
            color: COLORS.accentBright,
            letterSpacing: 1.5,
            textTransform: "uppercase" as const,
            marginBottom: 14,
          }}
        >
          Vehicles Tab
        </div>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
          {VEHICLES.map((v, i) => {
            const delay = 0.8 + i * 0.4;
            return (
              <Interactive.Div
                key={v.plate}
                name={`Vehicle-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "18px 24px",
                  opacity: interpolate(
                    frame,
                    [delay * fps, (delay + 0.3) * fps],
                    [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                  ),
                  translate: interpolate(
                    frame,
                    [delay * fps, (delay + 0.3) * fps],
                    ["0px 16px", "0px 0px"],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                    }
                  ),
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white }}>
                    {v.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontFamily: monoFamily,
                      color: COLORS.textMuted,
                      marginTop: 4,
                    }}
                  >
                    {v.plate} &nbsp;·&nbsp; {v.km}
                  </div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: v.statusColor,
                      marginBottom: 4,
                    }}
                  >
                    {v.status}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                    {v.assigned}
                  </div>
                </div>
              </Interactive.Div>
            );
          })}
        </div>
      </Interactive.Div>

      {/* ===== SECTION 2: Trips ===== */}
      <Interactive.Div
        name="TripsSection"
        style={{
          opacity: interpolate(
            frame,
            [vehiclesEnd * fps, (vehiclesEnd + 0.4) * fps, (tripsEnd - 0.3) * fps, tripsEnd * fps],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          ),
          display:
            frame < vehiclesEnd * fps || frame >= tripsEnd * fps
              ? "none"
              : "block",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontFamily: monoFamily,
            color: COLORS.accentBright,
            letterSpacing: 1.5,
            textTransform: "uppercase" as const,
            marginBottom: 14,
          }}
        >
          Trips Tab — Log a Trip
        </div>

        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: "24px 28px",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.white,
              marginBottom: 20,
            }}
          >
            New Trip Log
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px 24px",
            }}
          >
            {TRIP_FIELDS.map((field, i) => {
              const fieldDelay = vehiclesEnd + 0.5 + i * 0.3;
              const fillProgress = interpolate(
                frame,
                [fieldDelay * fps, (fieldDelay + 0.35) * fps],
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
                      fontSize: 14,
                      color: fillProgress > 0.5 ? COLORS.white : COLORS.textMuted,
                    }}
                  >
                    {fillProgress > 0.5 ? field.value : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Log Trip button */}
          <div
            style={{
              marginTop: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentBright})`,
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 700,
              color: COLORS.bg,
            }}
          >
            Log Trip
          </div>
        </div>
      </Interactive.Div>

      {/* ===== SECTION 3: Maintenance ===== */}
      <Interactive.Div
        name="MaintenanceSection"
        style={{
          opacity: interpolate(
            frame,
            [tripsEnd * fps, (tripsEnd + 0.4) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          ),
          display: frame < tripsEnd * fps ? "none" : "block",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontFamily: monoFamily,
            color: COLORS.accentBright,
            letterSpacing: 1.5,
            textTransform: "uppercase" as const,
            marginBottom: 14,
          }}
        >
          Maintenance Tab — Scheduled Services
        </div>

        {MAINTENANCE_ITEMS.map((item, i) => {
          const delay = tripsEnd + 0.5 + i * 0.4;
          return (
            <Interactive.Div
              key={item.vehicle}
              name={`Maint-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: "18px 24px",
                marginBottom: 10,
                opacity: interpolate(
                  frame,
                  [delay * fps, (delay + 0.3) * fps],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                ),
                translate: interpolate(
                  frame,
                  [delay * fps, (delay + 0.3) * fps],
                  ["0px 16px", "0px 0px"],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }
                ),
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>
                  {item.vehicle}
                </div>
                <div style={{ fontSize: 14, color: COLORS.textMuted, marginTop: 4 }}>
                  {item.service}
                </div>
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted }}>
                  {item.date}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.gold, marginTop: 4 }}>
                  {item.cost}
                </div>
              </div>
            </Interactive.Div>
          );
        })}
      </Interactive.Div>

      {/* Callout — always visible at bottom */}
      <Interactive.Div
        name="Callout"
        style={{
          position: "absolute",
          bottom: 40,
          left: 60,
          right: 60,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: `${COLORS.accentBright}12`,
          border: `1px solid ${COLORS.accentBright}33`,
          borderRadius: 10,
          padding: "14px 20px",
          opacity: interpolate(frame, [2.0 * fps, 2.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ fontSize: 20 }}>💡</span>
        <span style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.5 }}>
          Report any vehicle issues immediately through the Maintenance tab
        </span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
