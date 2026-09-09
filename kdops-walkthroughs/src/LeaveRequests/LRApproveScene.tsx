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

const FLOW_STEPS = [
  { label: "Employee Submits", icon: "📝" },
  { label: "Manager Reviews", icon: "👀" },
  { label: "HR Confirms", icon: "✅" },
  { label: "Leave Approved", icon: "🎉" },
];

const PENDING = [
  { name: "Keneth Cyril-Ita", type: "Annual Leave", dates: "8–12 Oct", days: 5, status: "Pending" },
  { name: "Gogo Marosi Benson", type: "Sick Leave", dates: "15 Oct", days: 1, status: "Pending" },
  { name: "Princewill James", type: "Compassionate", dates: "20–22 Oct", days: 3, status: "Pending" },
];

export const LRApproveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeStep = Math.min(Math.floor((frame - 1 * fps) / (1.2 * fps)), 3);

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
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Approving Leave
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Manager approval flow
      </Interactive.Div>

      {/* Flow diagram */}
      <Interactive.Div
        name="FlowDiagram"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          marginBottom: 36,
          opacity: interpolate(frame, [0.5 * fps, 0.9 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {FLOW_STEPS.map((step, i) => {
          const isActive = frame > 1 * fps && i <= activeStep;
          return (
            <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  background: isActive ? `${COLORS.accentBright}` : COLORS.surface,
                  border: `2px solid ${isActive ? COLORS.accentBright : COLORS.border}`,
                  borderRadius: 14,
                  padding: "16px 22px",
                  textAlign: "center" as const,
                  minWidth: 140,
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>{step.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? COLORS.white : COLORS.textMuted }}>{step.label}</div>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <div style={{ fontSize: 20, color: isActive ? COLORS.accentBright : COLORS.border, margin: "0 8px" }}>→</div>
              )}
            </div>
          );
        })}
      </Interactive.Div>

      {/* Pending requests table */}
      <Interactive.Div
        name="PendingTable"
        style={{
          background: COLORS.surface,
          borderRadius: 14,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          opacity: interpolate(frame, [2 * fps, 2.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.white }}>Pending Requests</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 0.5fr 0.8fr", padding: "10px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          {["EMPLOYEE", "TYPE", "DATES", "DAYS", "STATUS"].map((h) => (
            <div key={h} style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
          ))}
        </div>

        {PENDING.map((req, i) => (
          <div
            key={req.name}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1.2fr 1fr 0.5fr 0.8fr",
              padding: "14px 24px",
              borderBottom: i < PENDING.length - 1 ? `1px solid ${COLORS.border}` : "none",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{req.name}</div>
            <div style={{ fontSize: 14, color: COLORS.textMuted }}>{req.type}</div>
            <div style={{ fontSize: 14, color: COLORS.textMuted }}>{req.dates}</div>
            <div style={{ fontSize: 14, color: COLORS.textMuted }}>{req.days}</div>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.gold, background: `${COLORS.gold}22`, padding: "4px 10px", borderRadius: 6 }}>
                {req.status}
              </span>
            </div>
          </div>
        ))}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
