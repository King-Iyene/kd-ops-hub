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

const ITEMS = [
  {
    "label": "Employee",
    "value": "Select the borrower",
    "icon": "👤"
  },
  {
    "label": "Loan Amount",
    "value": "Total amount to disburse",
    "icon": "💰"
  },
  {
    "label": "Loan Type",
    "value": "Salary advance, Emergency, Equipment",
    "icon": "📋"
  },
  {
    "label": "Repayment Period",
    "value": "Number of months",
    "icon": "📅"
  },
  {
    "label": "Monthly Deduction",
    "value": "Auto-calculated",
    "icon": "🔢"
  }
];

export const SLCreateLoanScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "40px 60px" }}>
      {/* Breadcrumb */}
      <Interactive.Div name="Breadcrumb" style={{ fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted, marginBottom: 10, opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <span style={{ color: COLORS.accentBright }}>Finance</span><span style={{ margin: "0 8px" }}>{"›"}</span>
        <span style={{ color: COLORS.white }}>Staff Loans</span>
      </Interactive.Div>

      {/* Title */}
      <Interactive.Div name="Title" style={{ fontSize: 36, fontWeight: 700, color: COLORS.white, marginBottom: 24, opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Creating a Staff Loan
      </Interactive.Div>

      {/* Items grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {ITEMS.map((item, i) => {
          const delay = 0.5 + i * 0.3;
          return (
            <Interactive.Div
              key={item.label}
              name={`Item-${i}`}
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: "20px 24px",
                opacity: interpolate(frame, [delay * fps, (delay + 0.4) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                transform: `translateY(${interpolate(frame, [delay * fps, (delay + 0.4) * fps], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 24 }}>{item.icon}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.white }}>{item.label}</span>
              </div>
              <div style={{ fontSize: 14, color: COLORS.textMuted, lineHeight: 1.5 }}>
                {item.value || item.desc || ""}
              </div>
              {item.status && (
                <div style={{ marginTop: 8, fontSize: 12, fontFamily: monoFamily, color: item.color || COLORS.accentBright, letterSpacing: 1, textTransform: "uppercase" as const }}>
                  {item.status}
                </div>
              )}
            </Interactive.Div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
