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

const EMPLOYEES = [
  { name: "Adebayo Johnson", base: 450000, housing: 50000 },
  { name: "Chioma Okafor", base: 350000, housing: 30000 },
  { name: "Emeka Nwosu", base: 280000, housing: 25000 },
];

export const PIRunPayrollScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phases: step 1 (click button) -> step 2 (select pay group) -> step 3 (employee list) -> step 4 (run)
  const phase = frame < 2 * fps ? 0 : frame < 4 * fps ? 1 : frame < 6 * fps ? 2 : 3;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily,
        padding: "40px 60px",
      }}
    >
      {/* Scene label */}
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
        Step-by-step
      </Interactive.Div>

      <Interactive.Div
        name="Title"
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: COLORS.white,
          marginBottom: 28,
          opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Running a payroll cycle
      </Interactive.Div>

      {/* Step 1: Click + New payroll run */}
      <Interactive.Div
        name="Step1"
        style={{
          background: phase === 0 ? `${COLORS.accentBright}15` : COLORS.surface,
          borderRadius: 12,
          padding: "18px 24px",
          border: `1px solid ${phase === 0 ? COLORS.accentBright : COLORS.border}`,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: phase >= 0 ? COLORS.accentBright : COLORS.border, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16, fontWeight: 700, color: COLORS.bg, flexShrink: 0 }}>1</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
            Click "+ New payroll run" button
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMuted }}>
            You will find this button in the top-right corner of the Payroll page
          </div>
        </div>
        {phase === 0 && (
          <div style={{ background: COLORS.accentBright, color: COLORS.bg, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            + New payroll run
          </div>
        )}
      </Interactive.Div>

      {/* Step 2: Select pay group and period */}
      <Interactive.Div
        name="Step2"
        style={{
          background: phase === 1 ? `${COLORS.accentBright}15` : COLORS.surface,
          borderRadius: 12,
          padding: "18px 24px",
          border: `1px solid ${phase === 1 ? COLORS.accentBright : COLORS.border}`,
          marginBottom: 14,
          opacity: interpolate(frame, [0.7 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: phase === 1 ? 16 : 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: phase >= 1 ? COLORS.accentBright : COLORS.border, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16, fontWeight: 700, color: COLORS.bg, flexShrink: 0 }}>2</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
              Select a pay group and period
            </div>
            <div style={{ fontSize: 14, color: COLORS.textMuted }}>
              Pick which group of employees you are paying and for which month
            </div>
          </div>
        </div>
        {phase === 1 && (
          <div style={{ display: "flex", gap: 16, paddingLeft: 52 }}>
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: "10px 18px", border: `1px solid ${COLORS.accentBright}`, flex: 1 }}>
              <div style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 }}>PAY GROUP</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>KDS - Administrative</div>
            </div>
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: "10px 18px", border: `1px solid ${COLORS.border}`, flex: 1 }}>
              <div style={{ fontSize: 11, fontFamily: monoFamily, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 }}>PERIOD</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>October 2026</div>
            </div>
          </div>
        )}
      </Interactive.Div>

      {/* Step 3: Employee list with amounts */}
      <Interactive.Div
        name="Step3"
        style={{
          background: phase === 2 ? `${COLORS.accentBright}15` : COLORS.surface,
          borderRadius: 12,
          padding: "18px 24px",
          border: `1px solid ${phase === 2 ? COLORS.accentBright : COLORS.border}`,
          marginBottom: 14,
          opacity: interpolate(frame, [1 * fps, 1.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: phase === 2 ? 16 : 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: phase >= 2 ? COLORS.accentBright : COLORS.border, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16, fontWeight: 700, color: COLORS.bg, flexShrink: 0 }}>3</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
              Review employee amounts
            </div>
            <div style={{ fontSize: 14, color: COLORS.textMuted }}>
              KDOps calculates each employee's total pay based on their salary structure
            </div>
          </div>
        </div>
        {phase === 2 && (
          <div style={{ paddingLeft: 52 }}>
            {EMPLOYEES.map((emp, i) => {
              const total = emp.base + emp.housing;
              return (
                <div
                  key={emp.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 16px",
                    background: COLORS.bg,
                    borderRadius: 8,
                    marginBottom: i < EMPLOYEES.length - 1 ? 8 : 0,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{emp.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                      {"₦"}{emp.base.toLocaleString()} (Base) + {"₦"}{emp.housing.toLocaleString()} (Housing)
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, fontFamily: monoFamily }}>
                    {"₦"}{total.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Interactive.Div>

      {/* Step 4: Run Payroll button */}
      <Interactive.Div
        name="Step4"
        style={{
          background: phase === 3 ? `${COLORS.accentBright}15` : COLORS.surface,
          borderRadius: 12,
          padding: "18px 24px",
          border: `1px solid ${phase === 3 ? COLORS.green : COLORS.border}`,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: interpolate(frame, [1.3 * fps, 1.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: phase >= 3 ? COLORS.green : COLORS.border, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16, fontWeight: 700, color: COLORS.bg, flexShrink: 0 }}>4</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
            Click "Run Payroll" to process
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMuted }}>
            This sends the payroll for approval and processing. Employees receive their pay on the scheduled date.
          </div>
        </div>
        {phase === 3 && (
          <div style={{ background: COLORS.green, color: COLORS.white, padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            Run Payroll
          </div>
        )}
      </Interactive.Div>

      {/* Callout */}
      <Interactive.Div
        name="Callout"
        style={{
          background: `${COLORS.accent}22`,
          borderRadius: 10,
          padding: "16px 24px",
          borderLeft: `3px solid ${COLORS.accentBright}`,
          opacity: interpolate(frame, [2.2 * fps, 2.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontSize: 15, color: COLORS.textMuted, lineHeight: 1.5 }}>
          <span style={{ color: COLORS.accentBright, fontWeight: 700 }}>💡 Tip: </span>
          Make sure all employee bank details and tax IDs are up to date before running payroll.
          Go to People &gt; Employee Profile to check.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
