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

const DOCUMENTS = [
  "Tax Clearance Certificate",
  "PAYE Remittance Receipt",
  "Pension Fund Statement",
  "VAT Filing Confirmation",
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
        Document Upload
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 32,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Upload compliance documents
      </Interactive.Div>

      {/* Upload area */}
      <Interactive.Div
        name="UploadArea"
        style={{
          background: COLORS.surface,
          border: `2px dashed ${COLORS.border}`,
          borderRadius: 16,
          padding: "40px 24px",
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 40,
          opacity: interpolate(frame, [0.4 * fps, 0.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span style={{ fontSize: 48, marginBottom: 12 }}>📤</span>
        <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.white, marginBottom: 6 }}>
          Drag & drop files here
        </div>
        <div style={{ fontSize: 14, color: COLORS.textMuted }}>
          PDF, JPG, PNG — max 5 MB per file
        </div>
      </Interactive.Div>

      {/* Required documents */}
      <Interactive.Div
        name="DocsLabel"
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 16,
          opacity: interpolate(frame, [1 * fps, 1.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Required Documents
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
        {DOCUMENTS.map((doc, i) => {
          const delay = 1.2 + i * 0.25;
          return (
            <Interactive.Div
              key={doc}
              name={`Doc-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: `2px solid ${COLORS.accentBright}`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 13,
                  color: COLORS.accentBright,
                  flexShrink: 0,
                }}
              >
                ✓
              </div>
              <div style={{ fontSize: 17, color: COLORS.white }}>{doc}</div>
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
