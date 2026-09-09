#!/usr/bin/env node
// Generate professional voiceover audio for all 13 KDOps walkthrough videos
// Uses Microsoft Edge TTS (free, no API key needed)
// Usage: node generate-voiceover.mjs

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const VOICE = "en-US-GuyNeural"; // Professional male voice
const RATE = "-5%"; // Slightly slower for clarity
const PITCH = "+0Hz";
const OUT_DIR = join(import.meta.dirname, "voiceover");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Narration scripts for all 13 videos — each scene gets its own audio file
const VIDEOS = {
  "01-WelcomeToKDOps": {
    scenes: [
      { id: "intro", text: "Welcome to KDOps, your operations command centre. This guide will walk you through logging in, navigating the dashboard, and finding your way around the platform." },
      { id: "login", text: "Start by visiting ops.kdsquares.com. Enter your company email address and password, then click Sign In. If you've forgotten your password, click Forgot Password to reset it via email. Bookmark the URL for quick access." },
      { id: "dashboard", text: "Once logged in, you'll land on your dashboard. This is your home base. At the top, you'll see key numbers: total employees, total disbursements this month, pending approvals, and fleet fuel spend. Below that, Quick Actions give you shortcuts to common tasks like creating payments, reviewing approvals, and running payroll. The Financial Health score shows your company's overall financial standing." },
      { id: "sidebar", text: "The sidebar is your main navigation menu. Every module in KDOps lives here: Finance, People and HR, Operations, CRM, Workspace, and Admin. Click any section to expand it and see all the options inside. You can also find the Platform Guide in the sidebar for video tutorials on every module." },
      { id: "troubleshoot", text: "If you can't log in, use Forgot Password to reset via email. If you see an Unauthorized page, your role may not have access — ask your admin to check your role assignment. If the dashboard shows zero everywhere, that's normal — data populates as your team uses the system." },
      { id: "outro", text: "You're all set! Explore the sidebar modules, complete your setup checklist, and start managing your operations. Next up: Dashboard Deep Dive." },
    ],
  },
  "02-DashboardDeepDive": {
    scenes: [
      { id: "intro", text: "Dashboard Deep Dive. Let's explore your real-time operational snapshot in detail." },
      { id: "stat-cards", text: "The four KPI cards at the top of your dashboard tell you what's happening right now. Total Employees shows how many people are on payroll. Total Disbursed tracks all payments this month. Pending Approvals shows items waiting for sign-off. Fleet Fuel Spend tracks vehicle fuel costs. These numbers update in real-time — no need to refresh." },
      { id: "finance", text: "The Financial Health section gives you one score out of 100 that summarises your financial standing. Below it, you'll see cash on hand — your current available balance — and runway, which tells you how many months the company can operate at the current spend rate. The 30-day cash summary breaks down where money went: payroll, expenses, and vendor payments." },
      { id: "quick-actions", text: "Quick Actions are shortcuts to the tasks you do most. Click New Payment to create a salary run or vendor payment. Click Approvals to see everything waiting for your sign-off. Each button jumps straight to the right page, saving you time navigating through menus." },
      { id: "compliance", text: "Budget Utilisation shows how much of each department's monthly budget has been spent. When a bar approaches 100 percent, it's time to review spending. Upcoming Renewals warns you about subscriptions that will auto-charge soon. If you see something you don't recognise, check with your manager before the charge date." },
      { id: "troubleshoot", text: "If the dashboard shows zero everywhere, no transactions have been processed yet this period. If Financial Health is stuck at zero, add your cash balance under Finance, then Treasury. If Quick Actions aren't working, your role may not have the required permissions." },
      { id: "outro", text: "Dashboard mastered! You now know how to read your KPIs, track cash flow, monitor budgets, and use quick actions." },
    ],
  },
  "03-ManagingEmployees": {
    scenes: [
      { id: "intro", text: "Managing Employees. Learn how to add, manage, and organise your team in People and HR." },
      { id: "directory", text: "Navigate to People and HR, then Employees. You'll see the full employee directory with names, departments, job titles, status, and salary. Use the search bar to find someone quickly, or filter by department or status. Click on any employee's name to view their full profile." },
      { id: "add-employee", text: "To add a new employee, click the Add Employee button at the top right. Fill in their personal details — name, email, phone, and date of birth. Then set their employment info: department, job title, start date, and employment type. Enter their compensation — base salary and the correct pay group. Important: always fill in the bank details section. Without bank details, the employee cannot receive salary payments or expense reimbursements." },
      { id: "modules", text: "All employee-related tasks live under People and HR in the sidebar. Core HR covers employees, contractors, and attendance. Time and Leave handles leave requests, shifts, and timesheets. Talent includes performance reviews, training, onboarding, and recruitment. Compensation and Wellbeing manages benefits and staff loans." },
      { id: "troubleshoot", text: "If you can't add an employee, make sure you have the Admin or HR Manager role. If an employee isn't receiving their invite email, check the address for typos and ask them to check their spam folder. If you can't see all employees, a department filter may be active — reset it to view everyone." },
      { id: "outro", text: "Team management — done! You can now add employees, manage their profiles, and navigate all People and HR modules." },
    ],
  },
  "04-ContractorDirectory": {
    scenes: [
      { id: "intro", text: "Contractor Directory. Learn how to view and manage external contractors in KDOps." },
      { id: "list", text: "Navigate to People and HR, then Contractors. The contractor directory shows all your external workers with their name, company, contract type, status, and rate. Use search and filters to find specific contractors quickly." },
      { id: "add", text: "To add a new contractor, click Add Contractor. Fill in their details including name, company, email, phone, and contract type. Important: enter their payment account details — bank name, account number, and account name. Without these, they cannot receive payments through the system." },
      { id: "troubleshoot", text: "If a contractor isn't appearing in the list, check your filters. If you can't add contractors, verify you have the right permissions. If payment details are missing, edit the contractor profile to add them before processing any payments." },
      { id: "outro", text: "Contractor management — sorted! You can now view, add, and manage contractors with their payment details." },
    ],
  },
  "05-LeaveRequests": {
    scenes: [
      { id: "intro", text: "Leave Requests. Learn how to check leave balances, request time off, and approve leave as a manager." },
      { id: "balances", text: "Navigate to People and HR, then Leave. The leave overview shows your available balance for each leave type — annual leave, sick leave, and compassionate leave. You can see how many days you've used and how many remain." },
      { id: "request", text: "To request leave, click New Request. Select the leave type, choose your start and end dates, and add a reason. Your request will be sent to your manager for approval. You'll receive a notification when it's approved or declined." },
      { id: "approve", text: "If you're a manager, pending leave requests appear in your Approvals queue. Review the request details, check the team calendar for conflicts, then approve or decline. The employee is notified immediately." },
      { id: "troubleshoot", text: "If your leave balance shows zero, check with HR that your allocation has been set for this period. If you can't submit a request, make sure you're not requesting dates that overlap with an existing approved leave. If your request is stuck as pending, remind your manager to check their approvals." },
      { id: "outro", text: "Leave management — done! You now know how to check balances, submit requests, and handle approvals." },
    ],
  },
  "06-TasksAccountability": {
    scenes: [
      { id: "intro", text: "Tasks and Accountability. Learn how to assign, track, and complete tasks across your team." },
      { id: "taskboard", text: "Navigate to Workspace, then Tasks. The task board shows all tasks organised in columns: To Do, In Progress, Review, and Done. Each task card displays the title, assignee, priority, and due date. Drag tasks between columns to update their status, or click to open full details." },
      { id: "create", text: "To create a new task, click New Task at the top of the page. Enter the task title and description, assign it to a team member, set a due date, and choose the priority level. Use the category field to organise tasks by department. Set a realistic due date and assign a clear owner — accountability starts with clarity." },
      { id: "troubleshoot", text: "If you can't assign a task, the employee must have an active status in the system. If tasks aren't appearing, check your filters — a status or assignee filter may be active. If overdue tasks are piling up, set reminders in task settings to get notifications." },
      { id: "outro", text: "Task tracking — sorted! You can now create tasks, assign them to your team, and track progress on the board." },
    ],
  },
  "07-PaymentBatches": {
    scenes: [
      { id: "intro", text: "Payment Batches. Learn how to create, approve, and process bulk payments for contractors and employees." },
      { id: "overview", text: "Navigate to Finance, then Payments. The payment batches page shows all your payment runs with their status, total amount, number of recipients, and creation date. You can filter by status to see pending, approved, or completed batches." },
      { id: "create", text: "To create a new batch, click New Batch. Select the payment type — salary run, contractor payment, or vendor payment. Add recipients, enter the amounts, and set the payment date. Review the total before submitting. Important: ensure all recipients have their bank details on file before creating the batch." },
      { id: "approval", text: "Once submitted, the batch goes to your approver for review. They'll verify the recipients and amounts, then approve or reject. After approval, the batch is processed and each recipient receives their payment. You can track the status in real-time on the batches page." },
      { id: "troubleshoot", text: "If a payment fails, check that the recipient's bank details are correct and up to date. If a batch is stuck in pending, remind the approver to check their queue. If amounts look wrong, edit the batch before it's approved — you can't change amounts after approval." },
      { id: "outro", text: "Payment batches — mastered! You can now create bulk payments, manage approvals, and track payment status." },
    ],
  },
  "08-ExpensesApprovals": {
    scenes: [
      { id: "intro", text: "Expenses and Approvals. Learn how to submit expenses, add payment details for reimbursement, and manage the approval flow." },
      { id: "list", text: "Navigate to Finance, then Expenses. The expense list shows all submitted claims with their amount, category, date, and approval status. Use filters to view pending, approved, or rejected expenses." },
      { id: "submit", text: "To submit a new expense, click New Expense. Select the category, enter the amount and date, add a description, and upload your receipt. Important: make sure your payment account details are up to date in your profile — without them, approved reimbursements can't be processed." },
      { id: "approval", text: "Submitted expenses go to your manager for approval. They'll review the details and receipt, then approve, reject, or request more information. Once approved, the reimbursement is added to the next payment batch automatically." },
      { id: "troubleshoot", text: "If your reimbursement hasn't arrived, check that your bank details are correct in your profile. If an expense was rejected, review the rejection reason and resubmit with the required changes. If you can't upload a receipt, check that the file is under 5 megabytes and in a supported format." },
      { id: "outro", text: "Expense management — done! You can now submit claims, track approvals, and ensure timely reimbursements." },
    ],
  },
  "09-PayrollIntelligence": {
    scenes: [
      { id: "intro", text: "Payroll Intelligence. Learn how to run payroll, understand pay groups, review breakdowns, and access payroll history." },
      { id: "overview", text: "Navigate to Finance, then Payroll. The payroll overview shows your pay groups, upcoming run dates, and total payroll cost. Each pay group represents a category of employees — for example, administrative staff, commission staff, or executives — each with their own pay schedule." },
      { id: "run", text: "To run payroll, select a pay group and click Run Payroll. The system calculates gross pay, deductions, taxes, and net pay for every employee in that group. Review the breakdown carefully before confirming. Once confirmed, payments are queued for processing." },
      { id: "breakdown", text: "The payroll breakdown shows each employee's pay details: basic salary, allowances, deductions, tax, and net pay. You can drill into any line item to see the calculation. Use this view to spot anomalies before confirming the run." },
      { id: "history", text: "Payroll history gives you a complete record of every payroll run. Filter by date range or pay group. Click any past run to see the full breakdown, download payslips, or reprint reports. This is your audit trail for all salary payments." },
      { id: "troubleshoot", text: "If an employee is missing from a payroll run, check they're assigned to the correct pay group. If amounts look wrong, verify their salary and deductions in their employee profile. If a run fails to process, check that all employees in the group have valid bank details." },
      { id: "outro", text: "Payroll — mastered! You can now run payroll, review breakdowns, and access your complete payroll history." },
    ],
  },
  "10-BudgetsSubscriptions": {
    scenes: [
      { id: "intro", text: "Budgets and Subscriptions. Learn how to create budgets, track spending, and manage recurring subscriptions." },
      { id: "overview", text: "Navigate to Finance, then Budgets. The budget overview shows all active budgets with their allocated amount, spent amount, and utilisation percentage. Colour-coded bars make it easy to see which departments are on track and which are approaching their limits." },
      { id: "create", text: "To create a new budget, click New Budget. Name the budget, select the department or category, set the total amount and time period. Once created, all matching expenses are automatically tracked against this budget. You'll see the utilisation update in real-time." },
      { id: "subscriptions", text: "The Subscriptions module tracks all recurring charges — software tools, services, and vendor contracts. Each subscription shows the name, cost, billing cycle, and next renewal date. Review these regularly to cancel unused services and avoid surprise charges." },
      { id: "troubleshoot", text: "If budget utilisation seems wrong, check that expenses are categorised correctly. If a subscription isn't showing, add it manually in the Subscriptions module. If you want to adjust a budget mid-period, edit the allocated amount — the system recalculates utilisation automatically." },
      { id: "outro", text: "Budget and subscription management — sorted! You can now create budgets, track spending, and stay on top of renewals." },
    ],
  },
  "11-ComplianceCentre": {
    scenes: [
      { id: "intro", text: "Compliance Centre. Learn how to manage regulatory filings, track compliance status, and upload required documents." },
      { id: "overview", text: "Navigate to Finance, then Compliance. The compliance overview shows all your regulatory obligations with their filing status, due dates, and completion progress. Items are colour-coded: green for completed, amber for upcoming, and red for overdue." },
      { id: "filing", text: "To file a compliance item, click on it to open the details. Follow the step-by-step checklist — gather required documents, fill in the filing form, and submit. The system tracks each step so you know exactly where you are in the process." },
      { id: "upload", text: "Many compliance items require supporting documents. Click Upload to attach files — certificates, permits, tax filings, or any required paperwork. Uploaded documents are stored securely and linked to the compliance item for easy reference during audits." },
      { id: "troubleshoot", text: "If a compliance item shows as overdue, prioritise it immediately and check the filing requirements. If you can't upload a document, verify the file format and size. If items aren't appearing, check with your admin that your compliance calendar has been configured." },
      { id: "outro", text: "Compliance management — done! You can now track regulatory obligations, file compliance items, and upload required documents." },
    ],
  },
  "12-FleetFuel": {
    scenes: [
      { id: "intro", text: "Fleet and Fuel Management. Learn how to manage your vehicle fleet, track fuel consumption, and handle vendor relationships." },
      { id: "fleet", text: "Navigate to Operations, then Fleet. The fleet overview shows all company vehicles with their status, assigned driver, mileage, and maintenance schedule. Click any vehicle to see its full history — trips, fuel logs, maintenance records, and insurance details." },
      { id: "fuel", text: "The fuel tracking module logs every fuelling event. Each entry shows the vehicle, amount, litres, station, and date. Use the fuel analytics to spot trends — which vehicles consume the most, whether fuel costs are rising, and if any usage patterns look unusual." },
      { id: "vendor", text: "Vendor management lets you track fuel stations, maintenance workshops, and other fleet service providers. Add vendors with their contact details and payment terms. When logging fuel or maintenance, select the vendor so you can track spend by supplier." },
      { id: "troubleshoot", text: "If a vehicle isn't appearing, check it's been added to the fleet register. If fuel logs seem incomplete, remind drivers to log every fuelling event. If maintenance alerts aren't showing, verify the maintenance schedule has been set for each vehicle." },
      { id: "outro", text: "Fleet management — sorted! You can now track vehicles, monitor fuel consumption, and manage service vendors." },
    ],
  },
  "13-DocsReportsAdmin": {
    scenes: [
      { id: "intro", text: "Documents, Reports, and Admin Settings. Learn how to manage documents, generate reports, and configure platform settings." },
      { id: "documents", text: "Navigate to Workspace, then Documents. The document vault stores all your company files organised in folders. Upload contracts, policies, templates, and any important documents. Use search to find files quickly, and set permissions to control who can view or edit each folder." },
      { id: "reports", text: "The Reports module generates detailed reports across all platform data. Choose from financial reports, payroll summaries, employee reports, fleet analytics, and more. Select your date range, apply filters, and export to PDF or CSV for sharing with stakeholders." },
      { id: "admin", text: "Admin Settings is where you configure the platform. Manage user roles and permissions, set up departments, configure approval workflows, and customise platform preferences. Only Super Admins have full access to these settings." },
      { id: "troubleshoot", text: "If you can't access Admin Settings, you need the Super Admin role. If a report shows no data, check your date range and filters. If document uploads fail, verify the file size is under the limit and the format is supported." },
      { id: "outro", text: "Documents, reports, and admin — mastered! You now have full control over your platform's content and configuration." },
    ],
  },
};

async function generateAll() {
  const entries = Object.entries(VIDEOS);
  console.log(`Generating voiceover for ${entries.length} videos...\n`);

  for (const [videoName, { scenes }] of entries) {
    const videoDir = join(OUT_DIR, videoName);
    if (!existsSync(videoDir)) mkdirSync(videoDir, { recursive: true });

    console.log(`\n── ${videoName} (${scenes.length} scenes) ──`);
    for (const scene of scenes) {
      const sceneDir = join(videoDir, scene.id);
      const finalFile = join(videoDir, `${scene.id}.mp3`);
      if (!existsSync(sceneDir)) mkdirSync(sceneDir, { recursive: true });
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        await tts.toFile(sceneDir, scene.text, { rate: RATE, pitch: PITCH });
        // toFile creates audio.mp3 inside the dir — rename it
        const src = join(sceneDir, "audio.mp3");
        if (existsSync(src)) {
          const { renameSync, statSync } = await import("fs");
          renameSync(src, finalFile);
          const size = statSync(finalFile).size;
          console.log(`  ✓ ${scene.id}.mp3 (${(size / 1024).toFixed(0)}KB)`);
          // Clean up empty dir
          const { rmdirSync } = await import("fs");
          try { rmdirSync(sceneDir); } catch {}
        }
      } catch (err) {
        console.error(`  ✗ ${scene.id}: ${err.message}`);
      }
    }
  }

  console.log("\n✅ All voiceover audio generated in:", OUT_DIR);
}

generateAll().catch(console.error);
