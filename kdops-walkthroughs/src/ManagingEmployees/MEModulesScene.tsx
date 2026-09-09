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

const SECTIONS = [
  {
    category: "Core HR",
    color: COLORS.accentBright,
    items: [
      { name: "Employees", desc: "Full employee directory and profiles" },
      { name: "Contractors", desc: "Manage external contractors separately" },
      { name: "Placements", desc: "Track employee placements and assignments" },
      { name: "Attendance", desc: "Monitor clock-in/out and attendance records" },
    ],
  },
  {
    category: "Time & Leave",
    color: COLORS.green,
    items: [
      { name: "Leave", desc: "Request and approve leave applications" },
      { name: "Shifts", desc: "Create and manage shift schedules" },
      { name: "Timesheets", desc: "Track hours worked per employee" },
    ],
  },
  {
    category: "Talent",
    color: COLORS.gold,
    items: [
      { name: "Performance", desc: "Run performance reviews and appraisals" },
      { name: "Training", desc: "Assign and track training programs" },
      { name: "Onboarding", desc: "Automate new hire onboarding steps" },
      { name: "Recruitment", desc: "Post jobs and track candidates" },
    ],
  },
  {
    category: "More",
    color: COLORS.orange,
    items: [
      { name: "Benefits", desc: "Manage employee benefits packages" },
      { name: "Staff Loans", desc: "Process and track staff loan requests" },
      { name: "Disciplinary", desc: "Document disciplinary actions" },
      { name: "HR Letters", desc: "Generate offer letters, confirmations, etc." },
    ],
  },
];

export const MEModulesScene: React.FC = () => {
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
          color: COLORS.gold,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 8,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        People & HR Modules
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 28,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Everything under People & HR
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        {SECTIONS.map((section, si) => {
          const sectionDelay = 0.5 + si * 0.4;
          return (
            <Interactive.Div
              key={section.category}
              name={`Section-${si}`}
              style={{
                opacity: interpolate(frame, [sectionDelay * fps, (sectionDelay + 0.3) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontFamily: monoFamily,
                  color: section.color,
                  letterSpacing: 1.5,
                  textTransform: "uppercase" as const,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: `2px solid ${section.color}`,
                }}
              >
                {section.category}
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {section.items.map((item, ii) => {
                  const itemDelay = sectionDelay + 0.3 + ii * 0.15;
                  return (
                    <div
                      key={item.name}
                      style={{
                        background: COLORS.surface,
                        borderRadius: 8,
                        padding: "12px 14px",
                        border: `1px solid ${COLORS.border}`,
                        opacity: interpolate(frame, [itemDelay * fps, (itemDelay + 0.2) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, marginBottom: 2 }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.3 }}>{item.desc}</div>
                    </div>
                  );
                })}
              </div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
