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

const CATEGORIES = [
  { icon: "📋", title: "HR Policies", count: "12 docs" },
  { icon: "💰", title: "Finance Reports", count: "8 docs" },
  { icon: "✅", title: "Compliance Docs", count: "15 docs" },
  { icon: "📄", title: "Templates", count: "6 docs" },
];

const RECENT_DOCS = [
  { name: "Staff Handbook 2026", category: "HR Policies", date: "5 Sep 2026", author: "Ngozi Eze" },
  { name: "Q3 Payroll Summary", category: "Finance Reports", date: "2 Sep 2026", author: "Emeka Obi" },
  { name: "PAYE Certificate Aug 2026", category: "Compliance Docs", date: "30 Aug 2026", author: "Funke Balogun" },
  { name: "Offer Letter Template", category: "Templates", date: "28 Aug 2026", author: "Tunde Adeyemi" },
];

export const DRADocumentsOverviewScene: React.FC = () => {
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
        Admin &rarr; Documents
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
        Documents
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 12,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        All company documents in one place
      </Interactive.Div>

      {/* Search bar mock */}
      <Interactive.Div
        name="SearchBar"
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          padding: "14px 20px",
          fontSize: 15,
          color: COLORS.textMuted,
          marginBottom: 24,
          opacity: interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        🔍  Search documents by name or category...
      </Interactive.Div>

      {/* Category cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
        {CATEGORIES.map((cat, i) => {
          const delay = 0.7 + i * 0.2;
          return (
            <Interactive.Div
              key={cat.title}
              name={`Category-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: "20px 16px",
                border: `1px solid ${COLORS.border}`,
                textAlign: "center" as const,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{cat.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
                {cat.title}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>{cat.count}</div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Recent documents table */}
      <Interactive.Div
        name="RecentLabel"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 12,
          opacity: interpolate(frame, [1.6 * fps, 1.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Recent Documents
      </Interactive.Div>

      <Interactive.Div
        name="RecentTable"
        style={{
          background: COLORS.surface,
          borderRadius: 12,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
          opacity: interpolate(frame, [1.8 * fps, 2.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {RECENT_DOCS.map((doc, i) => (
          <div
            key={doc.name}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1.2fr 1fr 1fr",
              padding: "14px 20px",
              borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none",
              fontSize: 14,
            }}
          >
            <div style={{ fontWeight: 600, color: COLORS.white }}>{doc.name}</div>
            <div style={{ color: COLORS.textMuted }}>{doc.category}</div>
            <div style={{ color: COLORS.textMuted }}>{doc.date}</div>
            <div style={{ color: COLORS.textMuted }}>{doc.author}</div>
          </div>
        ))}
      </Interactive.Div>

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
          opacity: interpolate(frame, [3 * fps, 3.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        All company documents are stored here — search by name or category to
        find what you need.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
