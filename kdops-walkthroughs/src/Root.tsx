import "./index.css";
import { Composition, Folder } from "remotion";
import { WelcomeToKDOps } from "./WelcomeToKDOps/WelcomeToKDOps";
import { IntroScene } from "./WelcomeToKDOps/IntroScene";
import { LoginScene } from "./WelcomeToKDOps/LoginScene";
import { DashboardScene } from "./WelcomeToKDOps/DashboardScene";
import { SidebarScene } from "./WelcomeToKDOps/SidebarScene";
import { TroubleshootScene } from "./WelcomeToKDOps/TroubleshootScene";
import { OutroScene } from "./WelcomeToKDOps/OutroScene";
import { DashboardDeepDive } from "./DashboardDeepDive/DashboardDeepDive";
import { DDIntroScene } from "./DashboardDeepDive/DDIntroScene";
import { DDStatCardsScene } from "./DashboardDeepDive/DDStatCardsScene";
import { DDFinanceScene } from "./DashboardDeepDive/DDFinanceScene";
import { DDQuickActionsScene } from "./DashboardDeepDive/DDQuickActionsScene";
import { DDComplianceScene } from "./DashboardDeepDive/DDComplianceScene";
import { DDTroubleshootScene } from "./DashboardDeepDive/DDTroubleshootScene";
import { DDOutroScene } from "./DashboardDeepDive/DDOutroScene";
import { ManagingEmployees } from "./ManagingEmployees/ManagingEmployees";
import { MEIntroScene } from "./ManagingEmployees/MEIntroScene";
import { MEDirectoryScene } from "./ManagingEmployees/MEDirectoryScene";
import { MEAddEmployeeScene } from "./ManagingEmployees/MEAddEmployeeScene";
import { MEModulesScene } from "./ManagingEmployees/MEModulesScene";
import { METroubleshootScene } from "./ManagingEmployees/METroubleshootScene";
import { MEOutroScene } from "./ManagingEmployees/MEOutroScene";
import { LeaveRequests } from "./LeaveRequests/LeaveRequests";
import { LRIntroScene } from "./LeaveRequests/LRIntroScene";
import { LRBalancesScene } from "./LeaveRequests/LRBalancesScene";
import { LRRequestScene } from "./LeaveRequests/LRRequestScene";
import { LRApproveScene } from "./LeaveRequests/LRApproveScene";
import { LRTroubleshootScene } from "./LeaveRequests/LRTroubleshootScene";
import { LROutroScene } from "./LeaveRequests/LROutroScene";
import { TasksAccountability } from "./TasksAccountability/TasksAccountability";
import { TAIntroScene } from "./TasksAccountability/TAIntroScene";
import { TATaskBoardScene } from "./TasksAccountability/TATaskBoardScene";
import { TACreateTaskScene } from "./TasksAccountability/TACreateTaskScene";
import { TATroubleshootScene } from "./TasksAccountability/TATroubleshootScene";
import { TAOutroScene } from "./TasksAccountability/TAOutroScene";
import { PaymentBatches } from "./PaymentBatches/PaymentBatches";
import { PBIntroScene } from "./PaymentBatches/PBIntroScene";
import { PBBatchOverviewScene } from "./PaymentBatches/PBBatchOverviewScene";
import { PBCreateBatchScene } from "./PaymentBatches/PBCreateBatchScene";
import { PBBatchApprovalScene } from "./PaymentBatches/PBBatchApprovalScene";
import { PBTroubleshootScene } from "./PaymentBatches/PBTroubleshootScene";
import { PBOutroScene } from "./PaymentBatches/PBOutroScene";
import { ContractorDirectory } from "./ContractorDirectory/ContractorDirectory";
import { CDIntroScene } from "./ContractorDirectory/CDIntroScene";
import { CDContractorListScene } from "./ContractorDirectory/CDContractorListScene";
import { CDAddContractorScene } from "./ContractorDirectory/CDAddContractorScene";
import { CDTroubleshootScene } from "./ContractorDirectory/CDTroubleshootScene";
import { CDOutroScene } from "./ContractorDirectory/CDOutroScene";
import { ExpensesApprovals } from "./ExpensesApprovals/ExpensesApprovals";
import { EAIntroScene } from "./ExpensesApprovals/EAIntroScene";
import { EAExpenseListScene } from "./ExpensesApprovals/EAExpenseListScene";
import { EASubmitExpenseScene } from "./ExpensesApprovals/EASubmitExpenseScene";
import { EAApprovalFlowScene } from "./ExpensesApprovals/EAApprovalFlowScene";
import { EATroubleshootScene } from "./ExpensesApprovals/EATroubleshootScene";
import { EAOutroScene } from "./ExpensesApprovals/EAOutroScene";
import { PayrollIntelligence } from "./PayrollIntelligence/PayrollIntelligence";
import { PIIntroScene } from "./PayrollIntelligence/PIIntroScene";
import { PIPayrollOverviewScene } from "./PayrollIntelligence/PIPayrollOverviewScene";
import { PIRunPayrollScene } from "./PayrollIntelligence/PIRunPayrollScene";
import { PIPayrollBreakdownScene } from "./PayrollIntelligence/PIPayrollBreakdownScene";
import { PIPayrollHistoryScene } from "./PayrollIntelligence/PIPayrollHistoryScene";
import { PITroubleshootScene } from "./PayrollIntelligence/PITroubleshootScene";
import { PIOutroScene } from "./PayrollIntelligence/PIOutroScene";
import { BudgetsSubscriptions } from "./BudgetsSubscriptions/BudgetsSubscriptions";
import { BSIntroScene } from "./BudgetsSubscriptions/BSIntroScene";
import { BSBudgetOverviewScene } from "./BudgetsSubscriptions/BSBudgetOverviewScene";
import { BSCreateBudgetScene } from "./BudgetsSubscriptions/BSCreateBudgetScene";
import { BSSubscriptionTrackerScene } from "./BudgetsSubscriptions/BSSubscriptionTrackerScene";
import { BSTroubleshootScene } from "./BudgetsSubscriptions/BSTroubleshootScene";
import { BSOutroScene } from "./BudgetsSubscriptions/BSOutroScene";
import { ComplianceCentre } from "./ComplianceCentre/ComplianceCentre";
import { CCIntroScene } from "./ComplianceCentre/CCIntroScene";
import { CCComplianceOverviewScene } from "./ComplianceCentre/CCComplianceOverviewScene";
import { CCFilingProcessScene } from "./ComplianceCentre/CCFilingProcessScene";
import { CCDocumentUploadScene } from "./ComplianceCentre/CCDocumentUploadScene";
import { CCTroubleshootScene } from "./ComplianceCentre/CCTroubleshootScene";
import { CCOutroScene } from "./ComplianceCentre/CCOutroScene";
import { FleetFuel } from "./FleetFuel/FleetFuel";
import { FFIntroScene } from "./FleetFuel/FFIntroScene";
import { FFFleetOverviewScene } from "./FleetFuel/FFFleetOverviewScene";
import { FFFuelTrackingScene } from "./FleetFuel/FFFuelTrackingScene";
import { FFVendorManagementScene } from "./FleetFuel/FFVendorManagementScene";
import { FFTroubleshootScene } from "./FleetFuel/FFTroubleshootScene";
import { FFOutroScene } from "./FleetFuel/FFOutroScene";
import { DocsReportsAdmin } from "./DocsReportsAdmin/DocsReportsAdmin";
import { DRAIntroScene } from "./DocsReportsAdmin/DRAIntroScene";
import { DRADocumentsOverviewScene } from "./DocsReportsAdmin/DRADocumentsOverviewScene";
import { DRAReportsModuleScene } from "./DocsReportsAdmin/DRAReportsModuleScene";
import { DRAAdminSettingsScene } from "./DocsReportsAdmin/DRAAdminSettingsScene";
import { DRATroubleshootScene } from "./DocsReportsAdmin/DRATroubleshootScene";
import { DRAOutroScene } from "./DocsReportsAdmin/DRAOutroScene";
import { MyPortal } from "./MyPortal/MyPortal";
import { ProfileSetup } from "./ProfileSetup/ProfileSetup";
import { SidebarNavigation } from "./SidebarNavigation/SidebarNavigation";
import { ApprovalsInbox } from "./ApprovalsInbox/ApprovalsInbox";
import { FuelRequests } from "./FuelRequests/FuelRequests";
import { TripLogging } from "./TripLogging/TripLogging";
import { EarnedWages } from "./EarnedWages/EarnedWages";
import { TransactionHistory } from "./TransactionHistory/TransactionHistory";
import { CardsManagement } from "./CardsManagement/CardsManagement";
import { PaymentSchedule } from "./PaymentSchedule/PaymentSchedule";
import { PayHubOverview } from "./PayHubOverview/PayHubOverview";
import { StaffLoans } from "./StaffLoans/StaffLoans";
import { RecruitmentPipeline } from "./RecruitmentPipeline/RecruitmentPipeline";
import { OnboardingOffboarding } from "./OnboardingOffboarding/OnboardingOffboarding";
import { DisciplinaryProcess } from "./DisciplinaryProcess/DisciplinaryProcess";
import { HRLettersModule } from "./HRLettersModule/HRLettersModule";
import { GrievanceManagement } from "./GrievanceManagement/GrievanceManagement";
import { SuccessionPlanning } from "./SuccessionPlanning/SuccessionPlanning";
import { GoalsSetting } from "./GoalsSetting/GoalsSetting";
import { PerformanceReviews } from "./PerformanceReviews/PerformanceReviews";
import { SurveysModule } from "./SurveysModule/SurveysModule";
import { BenefitsEnrollment } from "./BenefitsEnrollment/BenefitsEnrollment";
import { ClientsManagement } from "./ClientsManagement/ClientsManagement";
import { InvoicingClients } from "./InvoicingClients/InvoicingClients";

const FPS = 30;

// Video 1: 4+7+8+8+6+4 = 37s, minus 5 transitions × 0.5s = 34.5s ≈ 1035 frames
const V1_FRAMES = 3315;

// Video 2: 4+8+8+8+8+6+4 = 46s, minus 6 transitions × 0.5s = 43s = 1290 frames
const V2_FRAMES = 3720;

// Video 3: ManagingEmployees — 4+8+8+8+6+4 = 38s, minus 5 × 0.5s = 35.5s ≈ 1065 frames
const V3_FRAMES = 3435;

// Video 5: LeaveRequests — 4+7+8+7+6+4 = 36s, minus 5 × 0.5s = 33.5s ≈ 1005 frames
const V5_FRAMES = 2565;

// Video 6: TasksAccountability — 4+8+8+6+4 = 30s, minus 4 × 0.5s = 28s = 840 frames
const V6_FRAMES = 2430;

// Video 7: PaymentBatches — 4+8+8+8+6+4 = 38s, minus 5 × 0.5s = 35.5s ≈ 1065 frames
const V7_FRAMES = 2895;

// Video 4: ContractorDirectory — 4+8+8+6+4 = 30s, minus 4 × 0.5s = 28s = 840 frames
const V4_FRAMES = 2130;

// Video 8: ExpensesApprovals — 4+8+8+8+6+4 = 38s, minus 5 × 0.5s = 35.5s ≈ 1065 frames
const V8_FRAMES = 2715;

// Video 9: PayrollIntelligence — 4+8+8+8+8+6+4 = 46s, minus 6 × 0.5s = 43s = 1290 frames
const V9_FRAMES = 3360;

// Video 10: BudgetsSubscriptions — 4+8+8+8+6+4 = 38s, minus 5 × 0.5s = 35.5s ≈ 1065 frames
const V10_FRAMES = 2835;

// Video 11: ComplianceCentre — 4+8+8+8+6+4 = 38s, minus 5 × 0.5s = 35.5s ≈ 1065 frames
const V11_FRAMES = 2775;

// Video 12: FleetFuel — 4+8+8+8+6+4 = 38s, minus 5 × 0.5s = 35.5s ≈ 1065 frames
const V12_FRAMES = 2775;

// Video 13: DocsReportsAdmin — 4+8+8+8+6+4 = 38s, minus 5 × 0.5s = 35.5s ≈ 1065 frames
const V13_FRAMES = 2805;

// Batch 2 videos (14-25)
const V14_FRAMES = 3210;
const V15_FRAMES = 4695;
const V16_FRAMES = 4620;
const V17_FRAMES = 3690;
const V18_FRAMES = 5715;
const V19_FRAMES = 3630;
const V20_FRAMES = 4590;
const V21_FRAMES = 3570;
const V22_FRAMES = 3750;
const V23_FRAMES = 3570;
const V24_FRAMES = 3330;
const V25_FRAMES = 4020;

// Batch 3 videos (26-37)
const V26_FRAMES = 6255;
const V27_FRAMES = 6135;
const V28_FRAMES = 6495;
const V29_FRAMES = 4890;
const V30_FRAMES = 5070;
const V31_FRAMES = 4740;
const V32_FRAMES = 5340;
const V33_FRAMES = 6465;
const V34_FRAMES = 6705;
const V35_FRAMES = 2700;
const V36_FRAMES = 2250;
const V37_FRAMES = 5880;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* === Video 1: Welcome to KDOps === */}
      <Composition
        id="WelcomeToKDOps"
        component={WelcomeToKDOps}
        durationInFrames={V1_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="WelcomeToKDOps-Scenes">
        <Composition id="V1-Intro" component={IntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V1-Login" component={LoginScene} durationInFrames={19 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V1-Dashboard" component={DashboardScene} durationInFrames={28 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V1-Sidebar" component={SidebarScene} durationInFrames={22 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V1-Troubleshooting" component={TroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V1-Outro" component={OutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 2: Dashboard Deep Dive === */}
      <Composition
        id="DashboardDeepDive"
        component={DashboardDeepDive}
        durationInFrames={V2_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="DashboardDeepDive-Scenes">
        <Composition id="V2-Intro" component={DDIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V2-StatCards" component={DDStatCardsScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V2-Finance" component={DDFinanceScene} durationInFrames={23 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V2-QuickActions" component={DDQuickActionsScene} durationInFrames={28 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V2-Compliance" component={DDComplianceScene} durationInFrames={22 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V2-Troubleshooting" component={DDTroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V2-Outro" component={DDOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 3: Managing Employees === */}
      <Composition
        id="ManagingEmployees"
        component={ManagingEmployees}
        durationInFrames={V3_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="ManagingEmployees-Scenes">
        <Composition id="V3-Intro" component={MEIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V3-Directory" component={MEDirectoryScene} durationInFrames={21 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V3-AddEmployee" component={MEAddEmployeeScene} durationInFrames={32 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V3-Modules" component={MEModulesScene} durationInFrames={25 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V3-Troubleshooting" component={METroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V3-Outro" component={MEOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 5: Leave Requests === */}
      <Composition
        id="LeaveRequests"
        component={LeaveRequests}
        durationInFrames={V5_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="LeaveRequests-Scenes">
        <Composition id="V5-Intro" component={LRIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V5-Balances" component={LRBalancesScene} durationInFrames={16 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V5-Request" component={LRRequestScene} durationInFrames={18 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V5-Approve" component={LRApproveScene} durationInFrames={16 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V5-Troubleshooting" component={LRTroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V5-Outro" component={LROutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 6: Tasks & Accountability === */}
      <Composition
        id="TasksAccountability"
        component={TasksAccountability}
        durationInFrames={V6_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="TasksAccountability-Scenes">
        <Composition id="V6-Intro" component={TAIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V6-TaskBoard" component={TATaskBoardScene} durationInFrames={22 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V6-CreateTask" component={TACreateTaskScene} durationInFrames={23 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V6-Troubleshooting" component={TATroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V6-Outro" component={TAOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 7: Payment Batches === */}
      <Composition
        id="PaymentBatches"
        component={PaymentBatches}
        durationInFrames={V7_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="PaymentBatches-Scenes">
        <Composition id="V7-Intro" component={PBIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V7-BatchOverview" component={PBBatchOverviewScene} durationInFrames={18 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V7-CreateBatch" component={PBCreateBatchScene} durationInFrames={24 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V7-BatchApproval" component={PBBatchApprovalScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V7-Troubleshooting" component={PBTroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V7-Outro" component={PBOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 4: Contractor Directory === */}
      <Composition
        id="ContractorDirectory"
        component={ContractorDirectory}
        durationInFrames={V4_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="ContractorDirectory-Scenes">
        <Composition id="V4-Intro" component={CDIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V4-ContractorList" component={CDContractorListScene} durationInFrames={17 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V4-AddContractor" component={CDAddContractorScene} durationInFrames={21 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V4-Troubleshooting" component={CDTroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V4-Outro" component={CDOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 8: Expenses & Approvals === */}
      <Composition
        id="ExpensesApprovals"
        component={ExpensesApprovals}
        durationInFrames={V8_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="ExpensesApprovals-Scenes">
        <Composition id="V8-Intro" component={EAIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V8-ExpenseList" component={EAExpenseListScene} durationInFrames={16 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V8-SubmitExpense" component={EASubmitExpenseScene} durationInFrames={19 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V8-ApprovalFlow" component={EAApprovalFlowScene} durationInFrames={17 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V8-Troubleshooting" component={EATroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V8-Outro" component={EAOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 9: Payroll Intelligence === */}
      <Composition
        id="PayrollIntelligence"
        component={PayrollIntelligence}
        durationInFrames={V9_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="PayrollIntelligence-Scenes">
        <Composition id="V9-Intro" component={PIIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V9-PayrollOverview" component={PIPayrollOverviewScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V9-RunPayroll" component={PIRunPayrollScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V9-PayrollBreakdown" component={PIPayrollBreakdownScene} durationInFrames={18 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V9-PayrollHistory" component={PIPayrollHistoryScene} durationInFrames={19 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V9-Troubleshooting" component={PITroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V9-Outro" component={PIOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 10: Budgets & Subscriptions === */}
      <Composition
        id="BudgetsSubscriptions"
        component={BudgetsSubscriptions}
        durationInFrames={V10_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="BudgetsSubscriptions-Scenes">
        <Composition id="V10-Intro" component={BSIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V10-BudgetOverview" component={BSBudgetOverviewScene} durationInFrames={18 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V10-CreateBudget" component={BSCreateBudgetScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V10-SubscriptionTracker" component={BSSubscriptionTrackerScene} durationInFrames={19 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V10-Troubleshooting" component={BSTroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V10-Outro" component={BSOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 11: Compliance Centre === */}
      <Composition
        id="ComplianceCentre"
        component={ComplianceCentre}
        durationInFrames={V11_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="ComplianceCentre-Scenes">
        <Composition id="V11-Intro" component={CCIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V11-ComplianceOverview" component={CCComplianceOverviewScene} durationInFrames={19 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V11-FilingProcess" component={CCFilingProcessScene} durationInFrames={17 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V11-DocumentUpload" component={CCDocumentUploadScene} durationInFrames={19 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V11-Troubleshooting" component={CCTroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V11-Outro" component={CCOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 12: Fleet & Fuel === */}
      <Composition
        id="FleetFuel"
        component={FleetFuel}
        durationInFrames={V12_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="FleetFuel-Scenes">
        <Composition id="V12-Intro" component={FFIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V12-FleetOverview" component={FFFleetOverviewScene} durationInFrames={19 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V12-FuelTracking" component={FFFuelTrackingScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V12-VendorManagement" component={FFVendorManagementScene} durationInFrames={18 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V12-Troubleshooting" component={FFTroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V12-Outro" component={FFOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Video 13: Docs, Reports & Admin === */}
      <Composition
        id="DocsReportsAdmin"
        component={DocsReportsAdmin}
        durationInFrames={V13_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      <Folder name="DocsReportsAdmin-Scenes">
        <Composition id="V13-Intro" component={DRAIntroScene} durationInFrames={26 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V13-DocumentsOverview" component={DRADocumentsOverviewScene} durationInFrames={21 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V13-ReportsModule" component={DRAReportsModuleScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V13-AdminSettings" component={DRAAdminSettingsScene} durationInFrames={17 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V13-Troubleshooting" component={DRATroubleshootScene} durationInFrames={35 * FPS} fps={FPS} width={1920} height={1080} />
        <Composition id="V13-Outro" component={DRAOutroScene} durationInFrames={20 * FPS} fps={FPS} width={1920} height={1080} />
      </Folder>

      {/* === Batch 2: Videos 14-25 === */}
      <Composition id="MyPortal" component={MyPortal} durationInFrames={V14_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="ProfileSetup" component={ProfileSetup} durationInFrames={V15_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="SidebarNavigation" component={SidebarNavigation} durationInFrames={V16_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="ApprovalsInbox" component={ApprovalsInbox} durationInFrames={V17_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="FuelRequests" component={FuelRequests} durationInFrames={V18_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="TripLogging" component={TripLogging} durationInFrames={V19_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="EarnedWages" component={EarnedWages} durationInFrames={V20_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="TransactionHistory" component={TransactionHistory} durationInFrames={V21_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="CardsManagement" component={CardsManagement} durationInFrames={V22_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="PaymentSchedule" component={PaymentSchedule} durationInFrames={V23_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="PayHubOverview" component={PayHubOverview} durationInFrames={V24_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="StaffLoans" component={StaffLoans} durationInFrames={V25_FRAMES} fps={FPS} width={1920} height={1080} />

      {/* === Batch 3: Videos 26-37 === */}
      <Composition id="RecruitmentPipeline" component={RecruitmentPipeline} durationInFrames={V26_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="OnboardingOffboarding" component={OnboardingOffboarding} durationInFrames={V27_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="DisciplinaryProcess" component={DisciplinaryProcess} durationInFrames={V28_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="HRLettersModule" component={HRLettersModule} durationInFrames={V29_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="GrievanceManagement" component={GrievanceManagement} durationInFrames={V30_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="SuccessionPlanning" component={SuccessionPlanning} durationInFrames={V31_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="GoalsSetting" component={GoalsSetting} durationInFrames={V32_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="PerformanceReviews" component={PerformanceReviews} durationInFrames={V33_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="SurveysModule" component={SurveysModule} durationInFrames={V34_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="BenefitsEnrollment" component={BenefitsEnrollment} durationInFrames={V35_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="ClientsManagement" component={ClientsManagement} durationInFrames={V36_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="InvoicingClients" component={InvoicingClients} durationInFrames={V37_FRAMES} fps={FPS} width={1920} height={1080} />
    </>
  );
};
