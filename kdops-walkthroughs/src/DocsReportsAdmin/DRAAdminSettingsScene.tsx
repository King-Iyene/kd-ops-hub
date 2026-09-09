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

const SETTINGS = [
  { icon: "🏢", title: "Company Profile", desc: "Company name, logo, address, tax IDs" },
  { icon: "🔐", title: "Roles & Permissions", desc: "Define who can access what" },
  { icon: "🏗️", title: "Departments", desc: "Create and manage org structure" },
  { icon: "📝", title: "Audit Trail", desc: "Track all system changes (last 90 days)" },
  { icon: "🔗", title: "Integrations", desc: "Connect payroll, banking, and HR tools" },
];

export const DRAAdminSettingsScene: React.FC = () => {
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
        Admin Settings
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        System configuration
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {SETTINGS.map((setting, i) => {
          const delay = 0.6 + i * 0.35;
          return (
            <Interactive.Div
              key={setting.title}
              name={`Setting-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: "20px 28px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 28 }}>{setting.icon}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
                  {setting.title}
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted }}>{setting.desc}</div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
