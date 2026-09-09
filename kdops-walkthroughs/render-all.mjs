import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";

const OUT = "out";
if (!existsSync(OUT)) mkdirSync(OUT);

const COMPOSITIONS = [
  "WelcomeToKDOps",
  "DashboardDeepDive",
  "ManagingEmployees",
  "ContractorDirectory",
  "LeaveRequests",
  "TasksAccountability",
  "PaymentBatches",
  "ExpensesApprovals",
  "PayrollIntelligence",
  "BudgetsSubscriptions",
  "ComplianceCentre",
  "FleetFuel",
  "DocsReportsAdmin",
];

for (const comp of COMPOSITIONS) {
  const outFile = `${OUT}/${comp}.mp4`;
  console.log(`\n🎬 Rendering ${comp}...`);
  try {
    execSync(
      `npx remotion render ${comp} ${outFile} --concurrency=1`,
      { stdio: "inherit", timeout: 600000 }
    );
    console.log(`✓ ${comp} → ${outFile}`);
  } catch (err) {
    console.error(`✗ ${comp} failed: ${err.message}`);
  }
}

console.log("\n✅ All renders complete.");
