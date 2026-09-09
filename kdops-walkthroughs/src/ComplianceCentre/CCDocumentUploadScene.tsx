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
  { icon: "📜", name: "Tax Certificates", count: "4 files" },
  { icon: "📊", name: "Audit Reports", count: "2 files" },
  { icon: "📬", name: "Regulatory Letters", count: "6 files" },
  { icon: "🪪", name: "Licences", count: "3 files" },
];

export const CCDocumentUploadScene: React.FC = () => {
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
        Compliance Documents
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
        Upload and organise compliance documents
      </Interactive.Div>

      <Interactive.Div
        name="Description"
        style={{
          fontSize: 18,
          color: COLORS.textMuted,
          marginBottom: 28,
          maxWidth: 720,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        All compliance-related files live here, sorted into categories.
        Drag and drop files into the upload area, or click "Browse" to pick
        from your computer.
      </Interactive.Div>

      {/* Upload area */}
      <Interactive.Div
        name="UploadArea"
        style={{
          background: COLORS.surface,
          border: `2px dashed ${COLORS.border}`,
          borderRadius: 16,
          padding: "36px 24px",
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
          opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ fontSize: 44, marginBottom: 10 }}>📤</span>
        <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 6 }}>
          Drag & drop files here
        </div>
        <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 14 }}>
          PDF, JPG, PNG — max 10 MB per file
        </div>
        <div
          style={{
            background: COLORS.accentBright,
            color: COLORS.bg,
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Browse Files
        </div>
      </Interactive.Div>

      {/* Document categories */}
      <Interactive.Div
        name="CategoriesLabel"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 14,
          opacity: interpolate(frame, [1.2 * fps, 1.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Document Categories
      </Interactive.Div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {CATEGORIES.map((cat, i) => {
          const delay = 1.4 + i * 0.25;
          return (
            <Interactive.Div
              key={cat.name}
              name={`Cat-${i}`}
              style={{
                background: COLORS.surface,
                borderRadius: 12,
                padding: "18px 22px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <span style={{ fontSize: 28 }}>{cat.icon}</span>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white }}>{cat.name}</div>
                <div style={{ fontSize: 13, color: COLORS.textMuted }}>{cat.count}</div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          marginTop: 24,
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
        Upload documents as soon as you receive them — they're safer in KDOps
        than in email.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
