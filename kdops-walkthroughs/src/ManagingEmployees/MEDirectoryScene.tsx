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

const EMPLOYEES = [
  { initials: "AJ", name: "Adebayo Johnson", dept: "Operations", title: "Admin", status: "Active", salary: "₦450,000/mo", color: "#22c55e" },
  { initials: "CO", name: "Chioma Okafor", dept: "Finance", title: "Accountant", status: "Active", salary: "₦350,000/mo", color: "#3b82f6" },
  { initials: "EN", name: "Emeka Nwosu", dept: "IT", title: "Developer", status: "Active", salary: "₦280,000/mo", color: "#8b5cf6" },
  { initials: "FA", name: "Funke Adeyemi", dept: "HR", title: "Manager", status: "Active", salary: "₦400,000/mo", color: "#f59e0b" },
  { initials: "TB", name: "Tunde Bakare", dept: "Operations", title: "Driver", status: "Active", salary: "₦180,000/mo", color: "#ef4444" },
];

const SIDEBAR_ITEMS = [
  { label: "Employees", active: true },
  { label: "Contractors", active: false },
  { label: "Attendance", active: false },
  { label: "Leave", active: false },
  { label: "Timesheets", active: false },
];

export const MEDirectoryScene: React.FC = () => {
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
      {/* Sidebar */}
      <Interactive.Div
        name="Sidebar"
        style={{
          width: 220,
          background: COLORS.surface,
          borderRight: `1px solid ${COLORS.border}`,
          padding: "24px 0",
          display: "flex",
          flexDirection: "column" as const,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ padding: "0 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 12 }}>
            People & HR
          </div>
          <div style={{ fontSize: 10, fontFamily: monoFamily, color: COLORS.accentBright, letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 8 }}>
            Core HR
          </div>
        </div>
        {SIDEBAR_ITEMS.map((item) => (
          <div
            key={item.label}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              color: item.active ? COLORS.white : COLORS.textMuted,
              background: item.active ? `${COLORS.accent}44` : "transparent",
              borderLeft: item.active ? `3px solid ${COLORS.accentBright}` : "3px solid transparent",
              fontWeight: item.active ? 600 : 400,
            }}
          >
            {item.label}
          </div>
        ))}
      </Interactive.Div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "30px 50px", overflow: "hidden" }}>
        {/* Breadcrumb */}
        <Interactive.Div
          name="Breadcrumb"
          style={{
            fontSize: 13,
            fontFamily: monoFamily,
            color: COLORS.textMuted,
            marginBottom: 8,
            opacity: interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          People & HR <span style={{ color: COLORS.accentBright }}>&rarr;</span> Employees
        </Interactive.Div>

        {/* Header row */}
        <Interactive.Div
          name="Header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
            opacity: interpolate(frame, [0.3 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.white }}>
            Employees
          </div>
          <div
            style={{
              background: COLORS.accentBright,
              color: COLORS.bg,
              padding: "10px 22px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Add Employee
          </div>
        </Interactive.Div>

        {/* Stats */}
        <Interactive.Div
          name="Stats"
          style={{
            display: "flex",
            gap: 20,
            marginBottom: 16,
            opacity: interpolate(frame, [0.5 * fps, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.green }} />
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>5 active employees</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accentBright }} />
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>4 departments</span>
          </div>
        </Interactive.Div>

        {/* Search & filters */}
        <Interactive.Div
          name="FilterBar"
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 16,
            opacity: interpolate(frame, [0.7 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, color: COLORS.textMuted, flex: 1 }}>
            Search by name, department, job title...
          </div>
          <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, color: COLORS.textMuted }}>
            Department ▾
          </div>
          <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, color: COLORS.textMuted }}>
            Status ▾
          </div>
        </Interactive.Div>

        {/* Employee table */}
        <Interactive.Div
          name="Table"
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            overflow: "hidden",
            opacity: interpolate(frame, [0.9 * fps, 1.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1.2fr 1fr 0.8fr 1.2fr", padding: "12px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
            {["NAME", "DEPARTMENT", "JOB TITLE", "STATUS", "SALARY"].map((h) => (
              <div key={h} style={{ fontSize: 10, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1 }}>{h}</div>
            ))}
          </div>

          {/* Employee rows */}
          {EMPLOYEES.map((emp, i) => {
            const delay = 1.2 + i * 0.15;
            const highlighted = Math.floor((frame - 4 * fps) / (1.2 * fps)) % EMPLOYEES.length === i && frame > 4 * fps;
            return (
              <div
                key={emp.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.2fr 1.2fr 1fr 0.8fr 1.2fr",
                  padding: "12px 20px",
                  borderBottom: i < EMPLOYEES.length - 1 ? `1px solid ${COLORS.border}` : "none",
                  background: highlighted ? `${COLORS.accent}22` : "transparent",
                  alignItems: "center",
                  opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: emp.color, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 11, fontWeight: 700, color: COLORS.white, flexShrink: 0 }}>
                    {emp.initials}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.white }}>{emp.name}</span>
                </div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>{emp.dept}</div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>{emp.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.green }} />
                  <span style={{ fontSize: 12, color: COLORS.green }}>{emp.status}</span>
                </div>
                <div style={{ fontSize: 13, fontFamily: monoFamily, color: COLORS.white }}>{emp.salary}</div>
              </div>
            );
          })}
        </Interactive.Div>

        {/* Callout */}
        <Interactive.Div
          name="Callout"
          style={{
            marginTop: 16,
            background: `${COLORS.accent}22`,
            borderRadius: 10,
            padding: "12px 20px",
            borderLeft: `3px solid ${COLORS.accentBright}`,
            opacity: interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div style={{ fontSize: 14, color: COLORS.accentBright, fontWeight: 600 }}>
            Click on any employee name to view their full profile and update their details
          </div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
