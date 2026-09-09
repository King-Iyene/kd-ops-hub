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

const SETTINGS_SECTIONS = [
  { icon: "🏢", title: "Company Profile", desc: "Company name, logo, address, and tax IDs" },
  { icon: "🏗️", title: "Departments", desc: "Create, rename, or remove departments" },
  { icon: "🔐", title: "Roles & Permissions", desc: "Control who can access each section" },
  { icon: "🔗", title: "Integrations", desc: "Connect payroll providers, banks, and other tools" },
  { icon: "🔔", title: "Notifications", desc: "Set up email and in-app alerts for your team" },
];

const DEPARTMENTS = [
  "Operations", "IT", "Marketing", "HR", "Finance", "Legal",
];

const ROLES = [
  { role: "Super Admin", access: "Full access to everything", color: COLORS.red },
  { role: "HR Manager", access: "HR module, leave, employee records", color: COLORS.orange },
  { role: "Finance Manager", access: "Finance, payroll, budgets, compliance", color: COLORS.gold },
  { role: "Employee", access: "Own profile, payslips, leave requests", color: COLORS.green },
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
      {/* Breadcrumb */}
      <Interactive.Div
        name="Breadcrumb"
        style={{
          fontSize: 14,
          fontFamily: monoFamily,
          color: COLORS.textMuted,
          marginBottom: 6,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Admin &rarr; Settings
      </Interactive.Div>

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
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 24,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Company settings and access control
      </Interactive.Div>

      {/* Settings sections row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {SETTINGS_SECTIONS.map((s, i) => {
          const delay = 0.6 + i * 0.2;
          return (
            <Interactive.Div
              key={s.title}
              name={`Section-${i}`}
              style={{
                flex: 1,
                background: COLORS.surface,
                borderRadius: 10,
                padding: "16px 14px",
                border: `1px solid ${COLORS.border}`,
                textAlign: "center" as const,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>{s.desc}</div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Two-column: Departments + Roles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 20 }}>
        {/* Departments */}
        <Interactive.Div
          name="Departments"
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: "20px 22px",
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [1.8 * fps, 2.2 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white, marginBottom: 14 }}>
            Departments
          </div>
          {DEPARTMENTS.map((dept, i) => (
            <div
              key={dept}
              style={{
                padding: "10px 14px",
                borderBottom: i < DEPARTMENTS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                fontSize: 15,
                color: COLORS.text,
              }}
            >
              {dept}
            </div>
          ))}
        </Interactive.Div>

        {/* Roles */}
        <Interactive.Div
          name="Roles"
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: "20px 22px",
            border: `1px solid ${COLORS.border}`,
            opacity: interpolate(frame, [2 * fps, 2.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white, marginBottom: 14 }}>
            Roles & Permissions
          </div>
          {ROLES.map((r, i) => (
            <div
              key={r.role}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderBottom: i < ROLES.length - 1 ? `1px solid ${COLORS.border}` : "none",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: r.color,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{r.role}</div>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>{r.access}</div>
              </div>
            </div>
          ))}
        </Interactive.Div>
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 20,
          background: `${COLORS.accent}33`,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          color: COLORS.accentBright,
          lineHeight: 1.5,
          opacity: interpolate(frame, [3.2 * fps, 3.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Only Super Admins can change company settings and manage roles.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
