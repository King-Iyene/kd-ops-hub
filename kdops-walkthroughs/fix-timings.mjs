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
  ["MyPortal", "MyPortal.tsx", "14-MyPortal", [
    ["Intro", "intro"], ["PortalOverview", "overview"], ["QuickActions", "actions"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["ProfileSetup", "ProfileSetup.tsx", "15-ProfileSetup", [
    ["Intro", "intro"], ["AccountTab", "account"], ["PayslipsTab", "payslips"], ["SecurityTab", "security"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["SidebarNavigation", "SidebarNavigation.tsx", "16-SidebarNavigation", [
    ["Intro", "intro"], ["HubOverview", "hubs"], ["FindingModules", "finding"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["ApprovalsInbox", "ApprovalsInbox.tsx", "17-ApprovalsInbox", [
    ["Intro", "intro"], ["InboxView", "inbox"], ["ApprovingItem", "approving"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["FuelRequests", "FuelRequests.tsx", "18-FuelRequests", [
    ["Intro", "intro"], ["SubmitRequest", "submit"], ["TrackingStatus", "tracking"], ["BankReminder", "bankreminder"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["TripLogging", "TripLogging.tsx", "19-TripLogging", [
    ["Intro", "intro"], ["LogTrip", "logging"], ["TripHistory", "history"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["EarnedWages", "EarnedWages.tsx", "20-EarnedWages", [
    ["Intro", "intro"], ["RequestEWA", "request"], ["TrackEWA", "tracking"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["TransactionHistory", "TransactionHistory.tsx", "21-TransactionHistory", [
    ["Intro", "intro"], ["SearchTransactions", "search"], ["TransactionDetail", "details"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["CardsManagement", "CardsManagement.tsx", "22-CardsManagement", [
    ["Intro", "intro"], ["ManageCards", "manage"], ["CardControls", "controls"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["PaymentSchedule", "PaymentSchedule.tsx", "23-PaymentSchedule", [
    ["Intro", "intro"], ["CreateSchedule", "create"], ["ManageSchedules", "manage"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["PayHubOverview", "PayHubOverview.tsx", "24-PayHubOverview", [
    ["Intro", "intro"], ["PayDashboard", "dashboard"], ["PayNavigation", "navigation"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["StaffLoans", "StaffLoans.tsx", "25-StaffLoans", [
    ["Intro", "intro"], ["CreateLoan", "create"], ["TrackLoans", "tracking"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["RecruitmentPipeline", "RecruitmentPipeline.tsx", "26-RecruitmentPipeline", [
    ["Intro", "intro"], ["CreateOpening", "CreateOpening"], ["ManageCandidates", "ManageCandidates"], ["ExtendOffer", "ExtendOffer"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["OnboardingOffboarding", "OnboardingOffboarding.tsx", "27-OnboardingOffboarding", [
    ["Intro", "intro"], ["JoiningChecklist", "JoiningChecklist"], ["ExitChecklist", "ExitChecklist"], ["TrackProgress", "TrackProgress"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["DisciplinaryProcess", "DisciplinaryProcess.tsx", "28-DisciplinaryProcess", [
    ["Intro", "intro"], ["CreateRecord", "CreateRecord"], ["ResponseThread", "ResponseThread"], ["AcknowledgeExpunge", "AcknowledgeExpunge"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["HRLettersModule", "HRLettersModule.tsx", "29-HRLettersModule", [
    ["Intro", "intro"], ["CreateLetter", "CreateLetter"], ["ESignature", "ESignature"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["GrievanceManagement", "GrievanceManagement.tsx", "30-GrievanceManagement", [
    ["Intro", "intro"], ["FileGrievance", "FileGrievance"], ["TrackResolution", "TrackResolution"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["SuccessionPlanning", "SuccessionPlanning.tsx", "31-SuccessionPlanning", [
    ["Intro", "intro"], ["IdentifyRoles", "IdentifyRoles"], ["AssignCandidates", "AssignCandidates"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["GoalsSetting", "GoalsSetting.tsx", "32-GoalsSetting", [
    ["Intro", "intro"], ["CreateGoal", "CreateGoal"], ["TrackProgress", "TrackProgress"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["PerformanceReviews", "PerformanceReviews.tsx", "33-PerformanceReviews", [
    ["Intro", "intro"], ["CreateCycle", "CreateCycle"], ["RateCompetencies", "RateCompetencies"], ["AcknowledgeReview", "AcknowledgeReview"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["SurveysModule", "SurveysModule.tsx", "34-SurveysModule", [
    ["Intro", "intro"], ["CreateSurvey", "CreateSurvey"], ["RespondToSurvey", "RespondToSurvey"], ["ViewResults", "ViewResults"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["BenefitsEnrollment", "BenefitsEnrollment.tsx", "35-BenefitsEnrollment", [
    ["Intro", "intro"], ["EnrollBenefit", "EnrollBenefit"], ["TrackEnrollments", "TrackEnrollments"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["ClientsManagement", "ClientsManagement.tsx", "36-ClientsManagement", [
    ["Intro", "intro"], ["AddClient", "AddClient"], ["ClientProfile", "ClientProfile"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
  ]],
  ["InvoicingClients", "InvoicingClients.tsx", "37-InvoicingClients", [
    ["Intro", "intro"], ["CreateInvoice", "CreateInvoice"], ["TrackPayments", "TrackPayments"], ["Troubleshooting", "troubleshoot"], ["Outro", "outro"],
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
  MyPortal: "V14_FRAMES",
  ProfileSetup: "V15_FRAMES",
  SidebarNavigation: "V16_FRAMES",
  ApprovalsInbox: "V17_FRAMES",
  FuelRequests: "V18_FRAMES",
  TripLogging: "V19_FRAMES",
  EarnedWages: "V20_FRAMES",
  TransactionHistory: "V21_FRAMES",
  CardsManagement: "V22_FRAMES",
  PaymentSchedule: "V23_FRAMES",
  PayHubOverview: "V24_FRAMES",
  StaffLoans: "V25_FRAMES",
  RecruitmentPipeline: "V26_FRAMES",
  OnboardingOffboarding: "V27_FRAMES",
  DisciplinaryProcess: "V28_FRAMES",
  HRLettersModule: "V29_FRAMES",
  GrievanceManagement: "V30_FRAMES",
  SuccessionPlanning: "V31_FRAMES",
  GoalsSetting: "V32_FRAMES",
  PerformanceReviews: "V33_FRAMES",
  SurveysModule: "V34_FRAMES",
  BenefitsEnrollment: "V35_FRAMES",
  ClientsManagement: "V36_FRAMES",
  InvoicingClients: "V37_FRAMES",
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
