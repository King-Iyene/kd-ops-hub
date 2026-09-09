#!/usr/bin/env node
// Generate voiceover audio for Batch 2 videos (14-25)
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { mkdirSync, existsSync, renameSync, statSync, rmdirSync, copyFileSync } from "fs";
import { join } from "path";

const VOICE = "en-US-GuyNeural";
const RATE = "-5%";
const PITCH = "+0Hz";
const VO_DIR = join(import.meta.dirname, "voiceover");
const PUB_DIR = join(import.meta.dirname, "public", "voiceover");

const VIDEOS = {
  "14-MyPortal": {
    scenes: [
      { id: "intro", text: "My Portal — your personal dashboard. This is your home base as an employee. From here you can see your upcoming tasks, recent payslips, leave balance, and quick links to submit requests. Let's walk through everything step by step." },
      { id: "overview", text: "After logging in, click on My Portal in the sidebar. This is your personal space — different from the main dashboard that managers see. At the top, you'll see your name, role, and department. Below that are cards showing your leave balance, pending requests, and recent payslips. The Quick Actions section lets you submit an expense, request leave, or log a fuel request with one click." },
      { id: "actions", text: "The Quick Actions bar gives you one-click access to the most common things you'll need to do. Click Submit Expense to file an expense claim with a receipt. Click Request Leave to apply for time off. Click Fuel Request if you're a field staff member who needs to log fuel purchases. Each action opens a simple form — fill it in and submit. Your manager gets notified automatically for approval." },
      { id: "troubleshoot", text: "If My Portal shows zero everywhere, that's normal for new accounts — data populates as you use the system. If your leave balance looks wrong, check with your HR admin — they manage leave allocations in Settings. If you can't see Quick Actions like Fuel Request, your role may not include fleet access — ask your admin to check your permissions." },
      { id: "outro", text: "That's My Portal — your personal command centre. Check it daily for updates, submit requests with one click, and stay on top of your tasks. Next up: Your Profile Page." },
    ],
  },
  "15-ProfileSetup": {
    scenes: [
      { id: "intro", text: "Your Profile Page. This is where you manage your personal information, view your employment details, download payslips, and set up security like multi-factor authentication. Let's go through each section." },
      { id: "account", text: "Click on your name or avatar at the top-right corner of any page to open your profile. The Account tab shows your basic information: full name, email address, phone number, department, and role. You can update your phone number and profile photo here. Important: make sure your bank account details are correct — this is where your salary and any reimbursements will be sent. Click Edit Bank Details to enter or update your bank name, account number, and account name. Double-check every digit — an incorrect account number means delayed payments." },
      { id: "payslips", text: "Click the Payslips tab in your profile. Here you'll see a list of all your past payslips, sorted by month. Each entry shows the pay period, gross amount, deductions, and net pay. Click on any payslip to see the full breakdown — basic salary, allowances, tax deductions, pension, and net amount. You can download the payslip as a PDF to save or print. If a payslip is missing, contact your finance admin — they run payroll and can reissue it." },
      { id: "security", text: "Click the Security tab. Here you can change your password and set up multi-factor authentication, or MFA. To change your password, enter your current password, then type your new password twice. For MFA, click Enable MFA and scan the QR code with an authenticator app like Google Authenticator or Microsoft Authenticator on your phone. Once enabled, you'll need to enter a code from the app every time you log in. This protects your account even if someone guesses your password." },
      { id: "troubleshoot", text: "If you can't update your bank details, your admin may have locked that field — contact them directly. If your payslips tab is empty, payroll hasn't been run for your pay group yet — check with finance. If you get locked out after enabling MFA, use the recovery codes that were shown during setup, or ask your admin to reset your MFA." },
      { id: "outro", text: "Your profile is set up. Keep your bank details updated, download your payslips monthly, and enable MFA for security. Important reminder: always ensure your bank account details are correct to receive salary and reimbursements on time." },
    ],
  },
  "16-SidebarNavigation": {
    scenes: [
      { id: "intro", text: "Navigating the Sidebar Hubs. The KDOps sidebar organises every module into six colour-coded hubs. Understanding where things live is key to moving fast. Let's walk through each hub so you always know where to find what you need." },
      { id: "hubs", text: "The sidebar has six hubs, each with its own colour. Finance is green — it handles payments, payroll, invoices, budgets, compliance, and anomalies. People and HR is blue — employees, contractors, leave, shifts, recruitment, training, and more. Operations is amber — fleet management and vendors. Workspace is purple — tasks, goals, documents, reports, and the AI assistant. CRM is sky blue — clients, contacts, referrals, and communications. Admin is grey — audit log, approval workflows, settings, and database tools. Click any hub to expand it and see all the modules inside." },
      { id: "finding", text: "Not sure which hub a module is in? Here's a quick cheat sheet. Need to make a payment? Finance hub, then Payments. Need to check someone's leave? People and HR hub, then Leave. Need to file an expense? Finance hub, then Expenses. Need to check fleet fuel? Operations hub, then Fleet. Need to assign a task? Workspace hub, then Tasks. Need to see compliance status? Finance hub, under Risk and Controls, then Compliance. You can also use the search bar at the top of the sidebar to type any module name and jump there directly." },
      { id: "troubleshoot", text: "If a module is missing from your sidebar, your role doesn't have access to it. Ask your admin to check your role assignment in Settings. Different roles see different modules — field staff see a smaller set than finance users or admins. If the sidebar feels overwhelming, remember: most people only use a handful of modules daily. Start with the ones your role needs and explore from there." },
      { id: "outro", text: "Now you know where everything lives. Six hubs, one sidebar, every module at your fingertips. Use the search bar for quick jumps, and remember the colour coding. Next: explore the specific modules your role needs most." },
    ],
  },
  "17-ApprovalsInbox": {
    scenes: [
      { id: "intro", text: "The Approvals Inbox. If you're a manager, finance user, or admin, this is where you review and approve everything your team submits — payment batches, expense claims, leave requests, earned wage advances, and staff loans. Let's walk through how it works." },
      { id: "inbox", text: "Click Approvals in the sidebar — it's near the top, with a badge showing how many items are waiting. The inbox lists every pending approval across all types. Each item shows what it is — expense, payment, leave, or loan — who submitted it, the amount or dates, and when it was submitted. Items are sorted by oldest first, so nothing gets missed. Click on any item to open the full details before making a decision." },
      { id: "approving", text: "When you open an approval item, you see all the details: the full expense breakdown with receipts, or the leave dates with balance information, or the payment batch line items. Review everything carefully. At the bottom, you have three options: Approve to confirm and move it forward, Reject to decline with a reason, or Request Info to ask the submitter for more details. Always add a comment when rejecting — it helps the person understand what to fix. Once you approve, the item moves to the next step automatically — for expenses that means reimbursement, for payments that means disbursement." },
      { id: "troubleshoot", text: "If you don't see any pending approvals, either nothing has been submitted or your role doesn't have approval permissions. Check with your admin. If an approval is stuck, it might be waiting on someone else in a multi-step approval chain — check the workflow status on the item. If you approved something by mistake, contact your admin immediately — some approvals can be reversed before processing." },
      { id: "outro", text: "Keep your approvals inbox clear — your team is waiting on you. Review items daily, add comments when rejecting, and remember that approvals drive the entire payment and reimbursement pipeline." },
    ],
  },
  "18-FuelRequests": {
    scenes: [
      { id: "intro", text: "Fuel Requests — step by step. If you drive a company vehicle or manage fleet operations, this video shows you exactly how to submit a fuel request, track its approval, and understand the full process from request to disbursement. Important: make sure your bank details are up to date in your profile before submitting — fuel reimbursements are paid to the bank account on file." },
      { id: "submit", text: "Step one: Navigate to Operations in the sidebar, then click Fleet. You'll land on the Fleet page. Click the My Requests tab at the top. Then click the New Fuel Request button. A form opens. Fill in every field carefully. Select your assigned vehicle from the dropdown. Choose the fuel type — PMS for petrol, AGO for diesel. Enter the amount in naira. Enter your current odometer reading — this is the number on your vehicle's dashboard that shows total kilometres driven. Select the fuel station or vendor where you purchased or plan to purchase. Finally, attach a photo of your fuel receipt. Click Submit Request when you're done." },
      { id: "tracking", text: "After submitting, your request appears in the My Requests tab with a Pending status. Your manager or fleet admin will review it. You'll see the status change: Pending means it's waiting for review. Approved means it's been accepted and will be processed for payment. Rejected means it was declined — check the comment from the reviewer to understand why, fix the issue, and resubmit. Disbursed means the money has been sent to your bank account. Keep checking the status and make sure your bank details are correct in your profile — that's where the reimbursement goes." },
      { id: "bankreminder", text: "This is critical: before you submit any request that involves a disbursement — fuel requests, expense claims, earned wage advances — you must make sure your bank details are correct and up to date in your profile. Go to your profile by clicking your name at the top right, then the Account tab. Scroll to Bank Details. Verify your bank name, account number, and account name are all correct. If any detail is wrong, your payment will fail or go to the wrong account. Update it immediately if anything has changed. Your admin can also help if the field is locked." },
      { id: "troubleshoot", text: "If you can't see the Fleet module, your role doesn't have fleet access — ask your admin. If your fuel request keeps getting rejected, check that you attached a valid receipt and the amount matches what's on the receipt. If you submitted but your status shows Disbursed and you haven't received the money, check your bank details in your profile — an incorrect account number is the most common cause of payment issues. Contact your finance admin with the request reference number." },
      { id: "outro", text: "You know how to submit fuel requests now. Remember: always attach your receipt, record the odometer, and keep your bank details updated. Your reimbursement depends on having the correct bank account on file." },
    ],
  },
  "19-TripLogging": {
    scenes: [
      { id: "intro", text: "Trip Logging. Every time you use a company vehicle for a trip, you need to log it in KDOps. This creates a record of mileage, destinations, and purpose — which helps the company track fleet usage, calculate fuel efficiency, and plan vehicle maintenance. Let's walk through exactly how to do it." },
      { id: "logging", text: "Navigate to Operations, then Fleet, then click the Trips tab. Click New Trip to start logging. Fill in the form: select your vehicle, enter the start location and destination, record the starting odometer and ending odometer readings, choose the trip purpose from the dropdown — options include Client Visit, Delivery, Site Inspection, and more. Add any notes if needed. Click Save Trip when done. The system automatically calculates the distance from your odometer readings." },
      { id: "history", text: "The Trips tab shows all logged trips in a table — vehicle, date, start and end locations, distance, and purpose. You can filter by vehicle, date range, or trip purpose. Click on any trip to see the full details. Managers can see trips from all drivers, while field staff see only their own trips. This history is used for fleet reporting, mileage tracking, and anomaly detection — if the system sees unusually high mileage, it flags it for review." },
      { id: "troubleshoot", text: "If you can't see the Trips tab, check that you have fleet access in your role. If the distance calculation looks wrong, double-check your odometer readings — the end reading must be higher than the start reading. If you forgot to log a trip, you can add it later — but do it the same day if possible, while the odometer readings are fresh in your mind." },
      { id: "outro", text: "Log every trip, every time. It takes 30 seconds and keeps your fleet records accurate. Accurate trip logs help the company plan routes, maintain vehicles, and control fuel costs." },
    ],
  },
  "20-EarnedWages": {
    scenes: [
      { id: "intro", text: "Earned Wage Access, or EWA. This feature lets you request an advance on the salary you've already earned before your next payday. If you need money urgently — for an emergency, a bill, or any reason — you can access a portion of what you've earned so far this month. Important: make sure your bank details are correct in your profile, because the advance is sent directly to your bank account." },
      { id: "request", text: "Navigate to Finance in the sidebar, then click Earned Wages. You'll see your available balance — this is the amount you've earned so far this pay cycle, minus any previous advances. Click Request Advance. Enter the amount you want — it must be within your available balance. Add a reason if required. Review the summary: it shows the amount, any processing fee, and the net amount you'll receive. Click Submit Request. The request goes to your finance admin for approval. Once approved, the money is sent to the bank account in your profile. Double-check that your bank details are correct before submitting." },
      { id: "tracking", text: "After submitting, your request appears in the EWA page with a status. Pending means it's waiting for approval. Approved means the advance has been confirmed and payment is being processed. Disbursed means the money has been sent to your bank account — check your bank. Rejected means it was declined — read the reviewer's comment to understand why. The advance is automatically deducted from your next payslip, so you don't need to repay it manually. Remember: the money goes to the bank account in your profile — if it's wrong, you won't receive the payment." },
      { id: "troubleshoot", text: "If your available balance shows zero, either you're at the start of a new pay cycle or you've already taken the maximum advance. If your request was rejected, check if you have any outstanding advances — some companies limit you to one at a time. If the money was disbursed but you didn't receive it, check your bank details in your profile immediately and contact your finance admin. Always ensure your bank account number is correct before requesting any disbursement." },
      { id: "outro", text: "Earned Wage Access gives you flexibility when you need it. Request only what you need, and remember: it's deducted from your next payslip automatically. Always verify your bank details are correct in your profile before making any request." },
    ],
  },
  "21-TransactionHistory": {
    scenes: [
      { id: "intro", text: "Transaction History. Every payment that moves through KDOps — payroll, expenses, fuel reimbursements, vendor payments — is recorded in the Transaction History. This is your single source of truth for all money movement. Finance users and admins use this to reconcile, audit, and track every naira." },
      { id: "search", text: "Navigate to Finance, then Transactions. You'll see a table of all transactions with columns for date, reference, type, recipient, amount, and status. Use the search bar to find a specific transaction by reference number, recipient name, or amount. Use the filters to narrow by date range, transaction type — like payroll, expense, or vendor payment — and status — completed, pending, or failed. This is especially useful at month-end when you need to reconcile your books." },
      { id: "details", text: "Click on any transaction to see its full details. You'll see the complete breakdown: who initiated it, when it was approved, the payment method, bank details of the recipient, and the full audit trail — every step from creation to completion. For failed transactions, the error message tells you what went wrong — usually an invalid bank account or insufficient funds. You can export transaction data as CSV for your accounting software." },
      { id: "troubleshoot", text: "If a transaction shows Failed, check the error message — the most common causes are incorrect bank details or insufficient account balance. If you can't find a transaction, widen your date filter — it might be from a different period. If you need to reverse a transaction, contact your super admin — reversals require special authorisation." },
      { id: "outro", text: "Transaction History is your financial audit trail. Use it to track every payment, investigate issues, and export data for reconciliation. Every naira is accounted for here." },
    ],
  },
  "22-CardsManagement": {
    scenes: [
      { id: "intro", text: "Virtual Cards. KDOps lets you issue virtual payment cards for your team — for subscriptions, online purchases, or vendor payments. Each card has spending limits and can be frozen instantly. This gives you control over company spending without sharing a single corporate card." },
      { id: "manage", text: "Navigate to Finance, then Cards. You'll see all active virtual cards with the cardholder name, last four digits, spending limit, and amount spent. To create a new card, click Issue New Card. Enter the cardholder's name, set the spending limit, and choose whether it's a single-use card or a recurring card. The card details — number, expiry, and CVV — are shown to the cardholder in their profile. To freeze a card, click the freeze toggle — the card is instantly disabled. Unfreeze it when needed." },
      { id: "controls", text: "Each card has built-in controls. You can set a per-transaction limit so no single purchase exceeds a certain amount. You can restrict card usage to specific merchant categories — for example, only allowing software subscriptions. You can see every transaction made with the card in real time. If a card is compromised or lost, freeze it immediately — one click and it's disabled. Card transactions appear in your Transaction History for full visibility." },
      { id: "troubleshoot", text: "If a card transaction is declined, check the spending limit — it may have been reached. Also check if the merchant category is restricted on that card. If you can't issue new cards, your role may not have finance permissions — check with your admin. If a card shows unexpected charges, freeze it immediately and review the transaction log." },
      { id: "outro", text: "Virtual cards give you control over company spending. Issue cards with limits, monitor in real time, and freeze instantly if needed. Every transaction is tracked in your history." },
    ],
  },
  "23-PaymentSchedule": {
    scenes: [
      { id: "intro", text: "Payment Schedule. Instead of creating payment batches manually every time, you can set up scheduled payments that run automatically. Rent, insurance, recurring vendor payments — set them up once and KDOps handles the rest. Let's walk through how to create and manage payment schedules." },
      { id: "create", text: "Navigate to Finance, then Payment Schedule. Click Create Schedule. Enter the payment details: recipient, amount, frequency — weekly, monthly, or custom — and the start date. For each payment in the schedule, you can set the bank account it pays into. Review the schedule preview to see upcoming payment dates. Click Save Schedule. Each scheduled payment is automatically created as a draft batch on the scheduled date, ready for you to review and approve before it goes out." },
      { id: "manage", text: "The Payment Schedule page shows all active schedules with their next payment date, amount, and recipient. You can pause a schedule to skip the next payment without deleting it. Edit a schedule to change the amount, recipient, or frequency. Delete a schedule to stop it permanently. When a scheduled payment is due, it appears as a draft batch in your Payments page — you still need to review and approve it before money moves. This gives you automation with oversight." },
      { id: "troubleshoot", text: "If a scheduled payment didn't run, check if the schedule is paused. If a draft batch was created but not processed, someone needs to approve it — scheduled payments still require approval. If the recipient's bank details changed, update the schedule — old bank details will cause the payment to fail." },
      { id: "outro", text: "Payment schedules save you time on recurring payments. Set them up once, review when they trigger, and approve before disbursement. No more forgetting to pay the landlord." },
    ],
  },
  "24-PayHubOverview": {
    scenes: [
      { id: "intro", text: "The Pay Hub. This is your unified command centre for everything related to paying people — payroll, earned wage advances, staff loans, and compliance deductions. Instead of jumping between multiple modules, Pay Hub gives you one view of all payment-related activity." },
      { id: "dashboard", text: "Navigate to Finance, then Pay Hub. The dashboard shows key metrics at a glance: total payroll cost this month, pending earned wage requests, active staff loans, and compliance deduction totals. Below the metrics, you see quick links to run payroll, review EWA requests, manage staff loans, and check statutory compliance. Think of Pay Hub as the starting point for any pay-related task — it connects you to all the right modules." },
      { id: "navigation", text: "From Pay Hub, click any section to dive deeper. Click Payroll to manage pay groups and run payroll. Click Earned Wages to review and approve advance requests. Click Staff Loans to manage employee loans and track repayments. Click Compliance to check statutory deduction settings — PAYE, pension, NHF, and NSITF. Everything connects back to Pay Hub, so you can always return here for the big picture." },
      { id: "troubleshoot", text: "If Pay Hub shows no data, payroll hasn't been set up yet — go to Payroll settings to create your first pay group. If you can't access Pay Hub, your role needs finance or payroll permissions. If the numbers look off, check that all pay groups are included and the date range is correct." },
      { id: "outro", text: "Pay Hub connects everything pay-related in one place. Start here when you need to run payroll, review advances, or check compliance. It's your financial operations command centre." },
    ],
  },
  "25-StaffLoans": {
    scenes: [
      { id: "intro", text: "Staff Loans. KDOps lets you create and manage employee loans with automatic payroll deductions. Whether it's a salary advance, emergency loan, or equipment loan, the system tracks everything — disbursement, repayment schedule, and remaining balance. Important: loan disbursements go to the employee's bank account on file, so bank details must be correct." },
      { id: "create", text: "Navigate to Finance, then Staff Loans. Click New Loan. Select the employee from the dropdown. Enter the loan amount, choose the loan type — salary advance, emergency, or equipment. Set the repayment terms: number of months and whether it's a fixed amount per month or a percentage of salary. The system calculates the monthly deduction automatically. Review the repayment schedule preview — it shows exactly how much will be deducted from each payslip. Click Create Loan. The loan amount is disbursed to the employee's bank account, and deductions start from the next payroll run." },
      { id: "tracking", text: "The Staff Loans page shows all active and completed loans. Each loan entry displays the employee name, original amount, amount repaid, remaining balance, and next deduction date. Click on a loan to see the full repayment history — every monthly deduction is logged automatically from payroll. If an employee leaves the company, the outstanding balance is flagged in their final settlement. You can also adjust a loan — extend the repayment period, pause deductions temporarily, or write off the remaining balance with admin approval." },
      { id: "troubleshoot", text: "If the loan disbursement failed, check the employee's bank details in their profile. If deductions aren't appearing on payslips, check that the loan is marked as active and that payroll has been run for that period. If an employee disputes a deduction amount, check the loan terms and repayment schedule — everything is logged." },
      { id: "outro", text: "Staff loans are tracked end to end in KDOps. Create them with clear terms, monitor repayments automatically through payroll, and keep bank details updated for disbursements." },
    ],
  },
};

async function generateAll() {
  const entries = Object.entries(VIDEOS);
  console.log(`Generating voiceover for ${entries.length} videos...\n`);

  for (const [videoName, { scenes }] of entries) {
    const voDir = join(VO_DIR, videoName);
    const pubDir = join(PUB_DIR, videoName);
    if (!existsSync(voDir)) mkdirSync(voDir, { recursive: true });
    if (!existsSync(pubDir)) mkdirSync(pubDir, { recursive: true });

    console.log(`\n── ${videoName} (${scenes.length} scenes) ──`);
    for (const scene of scenes) {
      const sceneDir = join(voDir, scene.id);
      const finalFile = join(voDir, `${scene.id}.mp3`);
      const pubFile = join(pubDir, `${scene.id}.mp3`);
      if (!existsSync(sceneDir)) mkdirSync(sceneDir, { recursive: true });
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        await tts.toFile(sceneDir, scene.text, { rate: RATE, pitch: PITCH });
        const src = join(sceneDir, "audio.mp3");
        if (existsSync(src)) {
          renameSync(src, finalFile);
          copyFileSync(finalFile, pubFile);
          const size = statSync(finalFile).size;
          console.log(`  ✓ ${scene.id}.mp3 (${(size / 1024).toFixed(0)}KB)`);
          try { rmdirSync(sceneDir); } catch {}
        }
      } catch (err) {
        console.error(`  ✗ ${scene.id}: ${err.message}`);
      }
    }
  }

  console.log("\n✅ All batch 2 voiceover audio generated!");
}

generateAll().catch(console.error);
