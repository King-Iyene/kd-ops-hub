import { readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const FPS = 30;
const TRANS = 15; // 0.5s transition
const BITRATE = 12000; // 96kbps MP3
const PADDING = 1.0; // 1s padding after audio ends

function getAudioDuration(filePath) {
  const size = statSync(filePath).size;
  return size / BITRATE;
}

// Each video: [folder, mainFile, voiceoverFolder, scenes as [sceneId, voiceoverId]]
const VIDEOS = [
  ["WelcomeToKDOps", "WelcomeToKDOps.tsx", "01-WelcomeToKDOps", [
    ["Intro", "intro"], ["Login", "login"], ["Dashboard", "dashboard"], ["Sidebar", "sidebar"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["DashboardDeepDive", "DashboardDeepDive.tsx", "02-DashboardDeepDive", [
    ["Intro", "intro"], ["StatCards", "stat-cards"], ["Finance", "finance"], ["QuickActions", "quick-actions"], ["Compliance", "compliance"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["ManagingEmployees", "ManagingEmployees.tsx", "03-ManagingEmployees", [
    ["Intro", "intro"], ["Directory", "directory"], ["AddEmployee", "add-employee"], ["Modules", "modules"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["ContractorDirectory", "ContractorDirectory.tsx", "04-ContractorDirectory", [
    ["Intro", "intro"], ["ContractorList", "list"], ["AddContractor", "add"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["LeaveRequests", "LeaveRequests.tsx", "05-LeaveRequests", [
    ["Intro", "intro"], ["Balances", "balances"], ["Request", "request"], ["Approve", "approve"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["TasksAccountability", "TasksAccountability.tsx", "06-TasksAccountability", [
    ["Intro", "intro"], ["TaskBoard", "taskboard"], ["CreateTask", "create"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["PaymentBatches", "PaymentBatches.tsx", "07-PaymentBatches", [
    ["Intro", "intro"], ["BatchOverview", "overview"], ["CreateBatch", "create"], ["BatchApproval", "approval"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["ExpensesApprovals", "ExpensesApprovals.tsx", "08-ExpensesApprovals", [
    ["Intro", "intro"], ["ExpenseList", "list"], ["SubmitExpense", "submit"], ["ApprovalFlow", "approval"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["PayrollIntelligence", "PayrollIntelligence.tsx", "09-PayrollIntelligence", [
    ["Intro", "intro"], ["PayrollOverview", "overview"], ["RunPayroll", "run"], ["PayrollBreakdown", "breakdown"], ["PayrollHistory", "history"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["BudgetsSubscriptions", "BudgetsSubscriptions.tsx", "10-BudgetsSubscriptions", [
    ["Intro", "intro"], ["BudgetOverview", "overview"], ["CreateBudget", "create"], ["SubscriptionTracker", "subscriptions"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["ComplianceCentre", "ComplianceCentre.tsx", "11-ComplianceCentre", [
    ["Intro", "intro"], ["ComplianceOverview", "overview"], ["FilingProcess", "filing"], ["DocumentUpload", "upload"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["FleetFuel", "FleetFuel.tsx", "12-FleetFuel", [
    ["Intro", "intro"], ["FleetOverview", "fleet"], ["FuelTracking", "fuel"], ["VendorManagement", "vendor"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["DocsReportsAdmin", "DocsReportsAdmin.tsx", "13-DocsReportsAdmin", [
    ["Intro", "intro"], ["DocumentsOverview", "documents"], ["ReportsModule", "reports"], ["AdminSettings", "admin"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
];

const rootUpdates = []; // for Root.tsx frame count updates

for (const [folder, file, voFolder, scenes] of VIDEOS) {
  const filePath = join("src", folder, file);
  let content = readFileSync(filePath, "utf-8");

  // Calculate new durations based on audio length
  const newScenes = scenes.map(([sceneLabel, voId]) => {
    const mp3Path = join("public/voiceover", voFolder, voId + ".mp3");
    const audioDur = getAudioDuration(mp3Path);
    const sceneDur = Math.ceil(audioDur + PADDING); // round up + 1s padding
    return { sceneLabel, voId, audioDur, sceneDur };
  });

  // Update scene durations in the TransitionSeries
  for (const { sceneLabel, sceneDur } of newScenes) {
    // Match patterns like: durationInFrames={4 * fps} name="Intro"
    // or: durationInFrames={8 * fps} name="Dashboard"
    const regex = new RegExp(
      `durationInFrames=\\{\\d+ \\* fps\\}(\\s+name="${sceneLabel}")`,
      "g"
    );
    content = content.replace(regex, `durationInFrames={${sceneDur} * fps}$1`);
  }

  // Update voSegments array
  const segments = [];
  let cumFrame = 0;
  for (let i = 0; i < newScenes.length; i++) {
    const { voId, sceneDur } = newScenes[i];
    const durationFrames = sceneDur * FPS;
    segments.push({
      startFrame: cumFrame,
      durationFrames,
      file: `voiceover/${voFolder}/${voId}.mp3`,
    });
    if (i < newScenes.length - 1) {
      cumFrame += durationFrames - TRANS;
    }
  }

  // Replace the voSegments const
  const segStr = JSON.stringify(segments, null, 4)
    .replace(/"startFrame"/g, "startFrame")
    .replace(/"durationFrames"/g, "durationFrames")
    .replace(/"file"/g, "file");
  content = content.replace(
    /const voSegments = \[[\s\S]*?\];/,
    `const voSegments = ${segStr};`
  );

  writeFileSync(filePath, content);

  // Calculate total frames for Root.tsx
  const totalSceneFrames = newScenes.reduce((sum, s) => sum + s.sceneDur * FPS, 0);
  const totalTransOverlap = (newScenes.length - 1) * TRANS;
  const totalFrames = totalSceneFrames - totalTransOverlap;

  rootUpdates.push({ folder, totalFrames, scenes: newScenes });

  console.log(`✓ ${folder}: ${newScenes.map(s => `${s.sceneLabel}=${s.sceneDur}s`).join(", ")} → ${totalFrames} frames (${(totalFrames/FPS).toFixed(1)}s)`);
}

// Update Root.tsx frame counts
let rootContent = readFileSync("src/Root.tsx", "utf-8");
const VAR_MAP = {
  WelcomeToKDOps: "V1_FRAMES",
  DashboardDeepDive: "V2_FRAMES",
  ManagingEmployees: "V3_FRAMES",
  ContractorDirectory: "V4_FRAMES",
  LeaveRequests: "V5_FRAMES",
  TasksAccountability: "V6_FRAMES",
  PaymentBatches: "V7_FRAMES",
  ExpensesApprovals: "V8_FRAMES",
  PayrollIntelligence: "V9_FRAMES",
  BudgetsSubscriptions: "V10_FRAMES",
  ComplianceCentre: "V11_FRAMES",
  FleetFuel: "V12_FRAMES",
  DocsReportsAdmin: "V13_FRAMES",
};

for (const { folder, totalFrames } of rootUpdates) {
  const varName = VAR_MAP[folder];
  if (varName) {
    const regex = new RegExp(`const ${varName} = \\d+;`);
    rootContent = rootContent.replace(regex, `const ${varName} = ${totalFrames};`);
  }
}

// Also update the scene durations in Root.tsx Folder compositions
for (const { folder, scenes } of rootUpdates) {
  for (const { sceneLabel, sceneDur } of scenes) {
    // Match: component={XXScene} durationInFrames={N * FPS}
    // These use FPS (constant) not fps (hook)
    const regex = new RegExp(
      `(id="V\\d+-${sceneLabel}"[^>]*durationInFrames=\\{)\\d+( \\* FPS\\})`,
      "g"
    );
    rootContent = rootContent.replace(regex, `$1${sceneDur}$2`);
  }
}

writeFileSync("src/Root.tsx", rootContent);
console.log("\n✓ Root.tsx frame counts updated");
console.log("\n✅ All timings fixed. Re-render needed.");
