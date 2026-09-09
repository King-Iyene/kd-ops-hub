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
    icon: "👥",
    items: [
      { name: "Employees", desc: "View and manage your full employee directory" },
      { name: "Contractors", desc: "Track external contractors and their contracts" },
      { name: "Attendance", desc: "Monitor daily clock-in, clock-out, and absences" },
    ],
  },
  {
    category: "Time & Leave",
    color: COLORS.green,
    icon: "📅",
    items: [
      { name: "Leave", desc: "Submit and approve leave requests" },
      { name: "Shifts", desc: "Create and assign shift schedules" },
      { name: "Timesheets", desc: "Track hours worked by each employee" },
    ],
  },
  {
    category: "Talent",
    color: COLORS.gold,
    icon: "⭐",
    items: [
      { name: "Performance", desc: "Run performance reviews and set goals" },
      { name: "Training", desc: "Assign courses and track completion" },
      { name: "Onboarding", desc: "Guide new hires through their first steps" },
      { name: "Recruitment", desc: "Post openings and track applicants" },
    ],
  },
  {
    category: "Compensation & Wellbeing",
    color: COLORS.orange,
    icon: "💰",
    items: [
      { name: "Benefits", desc: "Manage employee benefit packages" },
      { name: "Staff Loans", desc: "Process and track staff loan requests" },
    ],
  },
];

const SIDEBAR_FULL = [
  { group: "Core HR", items: ["Contractors", "Employees", "Placements", "Attendance"] },
  { group: "Time & Leave", items: ["Leave", "Shifts", "Timesheets"] },
  { group: "Talent", items: ["Performance", "Training", "Onboarding", "Recruitment", "Succession"] },
  { group: "Compensation", items: ["Benefits", "Staff Loans"] },
  { group: "Policy", items: ["Disciplinary", "HR Letters", "Surveys", "Grievances"] },
];

export const MEModulesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        display: "flex",
        flexDirection: "row" as const,
      }}
    >
      {/* Sidebar showing full People & HR menu */}
      <Interactive.Div
        name="Sidebar"
        style={{
          width: 210,
          background: COLORS.surface,
          borderRight: `1px solid ${COLORS.border}`,
          padding: "20px 0",
          overflow: "hidden",
          opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ padding: "0 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>People & HR</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted }}>All employee modules</div>
        </div>
        {SIDEBAR_FULL.map((group, gi) => (
          <div key={group.group} style={{ marginBottom: 10 }}>
            <div style={{ padding: "0 16px", fontSize: 10, fontFamily: monoFamily, color: COLORS.accentBright, letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 4 }}>
              {group.group}
            </div>
            {group.items.map((item) => (
              <div
                key={item}
                style={{
                  padding: "5px 16px 5px 22px",
                  fontSize: 12,
                  color: COLORS.textMuted,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        ))}
      </Interactive.Div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "30px 50px", overflow: "hidden" }}>
        <Interactive.Div
          name="SceneLabel"
          style={{
            fontSize: 14,
            fontFamily: monoFamily,
            color: COLORS.gold,
            letterSpacing: 2,
            textTransform: "uppercase" as const,
            marginBottom: 6,
            opacity: interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          People & HR Modules
        </Interactive.Div>

        <Interactive.Div
          name="Title"
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: COLORS.white,
            marginBottom: 6,
            opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          Everything you need for your team
        </Interactive.Div>

        <Interactive.Div
          name="Subtitle"
          style={{
            fontSize: 15,
            color: COLORS.textMuted,
            marginBottom: 24,
            opacity: interpolate(frame, [0.5 * fps, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          All employee-related tasks live under People & HR in the sidebar. Here is what each section does:
        </Interactive.Div>

        {/* Module cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {SECTIONS.map((section, si) => {
            const sectionDelay = 0.8 + si * 0.4;
            return (
              <Interactive.Div
                key={section.category}
                name={`Section-${si}`}
                style={{
                  background: COLORS.surface,
                  borderRadius: 12,
                  border: `1px solid ${COLORS.border}`,
                  padding: 18,
                  opacity: interpolate(frame, [sectionDelay * fps, (sectionDelay + 0.3) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>{section.icon}</span>
                  <div
                    style={{
                      fontSize: 13,
                      fontFamily: monoFamily,
                      color: section.color,
                      letterSpacing: 1,
                      textTransform: "uppercase" as const,
                      fontWeight: 700,
                    }}
                  >
                    {section.category}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                  {section.items.map((item, ii) => {
                    const itemDelay = sectionDelay + 0.3 + ii * 0.12;
                    return (
                      <div
                        key={item.name}
                        style={{
                          background: COLORS.bg,
                          borderRadius: 8,
                          padding: "10px 12px",
                          border: `1px solid ${COLORS.border}`,
                          opacity: interpolate(frame, [itemDelay * fps, (itemDelay + 0.15) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white, marginBottom: 2 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.3 }}>{item.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </Interactive.Div>
            );
          })}
        </div>

        {/* Callout */}
        <Interactive.Div
          name="Callout"
          style={{
            marginTop: 16,
            background: `${COLORS.accent}22`,
            borderRadius: 10,
            padding: "12px 20px",
            borderLeft: `3px solid ${COLORS.accentBright}`,
            opacity: interpolate(frame, [3.5 * fps, 4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ fontSize: 14, color: COLORS.accentBright, fontWeight: 600 }}>
            All employee-related tasks are under People & HR -- check the sidebar to find what you need.
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
