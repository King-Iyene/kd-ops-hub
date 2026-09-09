#!/usr/bin/env node
/**
 * Generate Batch 3 of KDOps walkthrough videos (Videos 26-37).
 * Creates all Remotion composition files, scene components, and voiceover scripts.
 *
 * Usage: node generate-batch3.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const SRC = join(import.meta.dirname, "src");

// ─── VIDEO DEFINITIONS ───────────────────────────────────────────────
// Each video: { id, folder, title, subtitle, icon, url, scenes[] }
// Each scene: { id, sceneId, name, title, breadcrumb[], content (JSX data), voiceover }
// The generator creates IntroScene, content scenes, TroubleshootScene, OutroScene

const VIDEOS = [
  {
    num: 26,
    folder: "RecruitmentPipeline",
    compId: "RecruitmentPipeline",
    title: "Recruitment Pipeline",
    subtitle: "Open positions, manage applicants, and extend offers",
    icon: "🎯",
    url: "ops.kdsquares.com/recruitment",
    scenes: [
      {
        id: "intro",
        voiceover: "Recruitment Pipeline. This module helps you manage hiring from start to finish — posting job openings, tracking applicants through stages, and extending offers. You'll find it in the sidebar under People and HR, then Talent, then Recruitment. Let's walk through the entire process step by step.",
      },
      {
        id: "opening",
        name: "CreateOpening",
        scenePrefix: "RP",
        title: "Creating a Job Opening",
        breadcrumb: ["People & HR", "Talent", "Recruitment"],
        voiceover: "To create a new job opening, navigate to People and HR in the sidebar, then click Talent, then Recruitment. Click the New Opening button at the top right. A form appears with several fields. Enter the Job Title — be specific, like Senior Frontend Developer. Select the Department from the dropdown. Choose the Employment Type: Full-time, Part-time, or Contract. Set the Salary Range by entering a minimum and maximum amount. In the Requirements section, list the qualifications, skills, and experience needed. You can also add a job description with full details about the role. When you're ready, set the Posting Status to Published to make it visible, or leave it as Draft to finalize later. Click Save Opening when done.",
        items: [
          { label: "Job Title", value: "Enter the position name", icon: "📝" },
          { label: "Department", value: "Select the hiring department", icon: "🏢" },
          { label: "Employment Type", value: "Full-time, Part-time, Contract", icon: "📋" },
          { label: "Salary Range", value: "Set min and max compensation", icon: "💰" },
          { label: "Requirements", value: "List qualifications and skills", icon: "✅" },
          { label: "Posting Status", value: "Draft, Published, or Closed", icon: "📢" },
        ],
      },
      {
        id: "candidates",
        name: "ManageCandidates",
        scenePrefix: "RP",
        title: "Managing Candidates",
        breadcrumb: ["People & HR", "Talent", "Recruitment", "Pipeline"],
        voiceover: "Once applications start coming in, you manage them through a pipeline view. Click on any job opening to see its candidates. The pipeline has stages: Applied, Screening, Interview, Offer, Hired, and Rejected. Each candidate card shows their name, application date, and current stage. To move a candidate forward, click on their card and select Move to Next Stage, or drag their card to the next column. You can add notes to each candidate — interview feedback, screening results, or any observations. Click on a candidate's name to see their full profile, uploaded resume, and all notes from your team.",
        items: [
          { label: "Applied", desc: "New applications received", icon: "📩", color: "#8BAAB8" },
          { label: "Screening", desc: "Resume review in progress", icon: "🔍", color: "#f59e0b" },
          { label: "Interview", desc: "Scheduled for interview", icon: "🗓️", color: "#006994" },
          { label: "Offer", desc: "Ready for offer letter", icon: "📄", color: "#22c55e" },
          { label: "Hired", desc: "Offer accepted, onboarding next", icon: "✅", color: "#00ECFF" },
          { label: "Rejected", desc: "Did not proceed", icon: "❌", color: "#ef4444" },
        ],
      },
      {
        id: "offer",
        name: "ExtendOffer",
        scenePrefix: "RP",
        title: "Extending an Offer",
        breadcrumb: ["People & HR", "Talent", "Recruitment", "Offer"],
        voiceover: "When a candidate reaches the Offer stage, it's time to extend a formal offer. Click on the candidate card in the Offer column, then click Extend Offer. The system pre-fills the position details from the job opening. Enter the offered salary, proposed start date, and any additional terms like probation period or benefits. You can generate an offer letter directly from KDOps using a template, or upload your own PDF. Review everything carefully, then click Send Offer. The candidate receives the offer via email. Track whether they accept or decline right in the pipeline — their status updates automatically.",
        items: [
          { label: "Candidate", value: "Select from Offer stage", icon: "👤" },
          { label: "Position", value: "Auto-filled from opening", icon: "📋" },
          { label: "Salary", value: "Enter the offered compensation", icon: "💰" },
          { label: "Start Date", value: "Proposed joining date", icon: "📅" },
          { label: "Offer Letter", value: "Generate or upload PDF", icon: "📄" },
          { label: "Send Offer", value: "Email to candidate", icon: "📧" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If you can't see the Recruitment module, your role may not have talent management access — ask your admin to check your permissions under People and HR settings. If candidates aren't showing in the pipeline, make sure the job opening status is Published — Draft openings don't accept applications. If the offer letter template looks wrong, check with your admin — they configure letter templates in Settings. If a candidate's email bounced, verify the email address on their profile and resend manually.",
      },
      {
        id: "outro",
        voiceover: "You now know how to manage the full recruitment pipeline in KDOps — from posting a job to extending an offer. Keep your pipeline updated, add notes after every interview, and track every candidate through to a decision. Check the Platform Guide for more walkthrough videos on related topics like Onboarding.",
      },
    ],
  },
  {
    num: 27,
    folder: "OnboardingOffboarding",
    compId: "OnboardingOffboarding",
    title: "Onboarding & Offboarding",
    subtitle: "Checklists for new hires joining and employees exiting",
    icon: "📋",
    url: "ops.kdsquares.com/onboarding",
    scenes: [
      {
        id: "intro",
        voiceover: "Onboarding and Offboarding. This module manages the checklists that ensure nothing is missed when a new hire joins or an employee leaves. You'll find it in the sidebar under People and HR, then Talent, then Onboarding. Every step — from issuing a laptop to collecting an ID card — is tracked here. Let's walk through how to set up and use these checklists.",
      },
      {
        id: "joining",
        name: "JoiningChecklist",
        scenePrefix: "OO",
        title: "New Hire Joining Checklist",
        breadcrumb: ["People & HR", "Talent", "Onboarding"],
        voiceover: "To set up a joining checklist, navigate to People and HR, then Talent, then Onboarding. Click the Joining Checklists tab. You'll see existing templates or you can create a new one by clicking New Checklist. Each checklist has a series of tasks: sending the welcome email with login credentials, setting up IT equipment like a laptop and email account, collecting bank details for payroll, issuing an ID card, scheduling an orientation meeting, and getting policy sign-offs. For each task, you assign a responsible person — HR for the welcome email, IT for equipment, finance for bank details. When a new hire is added to the system, the checklist is automatically assigned to them. Each responsible person gets notified of their tasks.",
        items: [
          { label: "Welcome Email", desc: "Send login credentials and handbook", icon: "📧" },
          { label: "IT Setup", desc: "Laptop, email account, software access", icon: "💻" },
          { label: "Bank Details", desc: "Collect for payroll setup", icon: "🏦" },
          { label: "ID Card", desc: "Issue employee identification", icon: "🪪" },
          { label: "Orientation", desc: "Schedule team introduction meeting", icon: "🤝" },
          { label: "Policy Sign-off", desc: "Acknowledge company policies", icon: "📝" },
        ],
      },
      {
        id: "exit",
        name: "ExitChecklist",
        scenePrefix: "OO",
        title: "Employee Exit Checklist",
        breadcrumb: ["People & HR", "Talent", "Offboarding"],
        voiceover: "For employees leaving the company, click the Exit Checklists tab. Create or use an existing exit template. Exit tasks typically include: uploading and acknowledging the resignation letter, scheduling knowledge transfer sessions, collecting company assets like laptops, ID cards, and keys, revoking system access to all accounts, calculating the final settlement including remaining salary, unused leave, and any outstanding loan deductions, and scheduling an exit interview. Assign each task to the right department. When an employee's exit is initiated in the system, the checklist activates automatically. Track every step to ensure a clean and compliant offboarding.",
        items: [
          { label: "Resignation Letter", desc: "Upload and acknowledge", icon: "📄" },
          { label: "Knowledge Transfer", desc: "Document handover tasks", icon: "📚" },
          { label: "Asset Return", desc: "Collect laptop, ID card, keys", icon: "🔑" },
          { label: "Access Revocation", desc: "Disable all system accounts", icon: "🔒" },
          { label: "Final Settlement", desc: "Calculate remaining pay and deductions", icon: "💰" },
          { label: "Exit Interview", desc: "Schedule feedback session", icon: "🗣️" },
        ],
      },
      {
        id: "progress",
        name: "TrackProgress",
        scenePrefix: "OO",
        title: "Tracking Checklist Progress",
        breadcrumb: ["People & HR", "Talent", "Onboarding", "Progress"],
        voiceover: "To track progress on any checklist, go to the Onboarding page and click on an employee's name. You'll see their full checklist with each task's status: In Progress, Completed, or Overdue. The progress bar at the top shows the overall completion percentage. Overdue tasks are highlighted in red so you can follow up immediately. Click on any task to see who's responsible and add a note or update the status. Managers and HR admins can see a dashboard view showing all active onboarding and offboarding processes across the company, with filters for department and status.",
        items: [
          { label: "In Progress", desc: "Tasks being worked on", icon: "🔄", color: "#f59e0b" },
          { label: "Completed", desc: "Tasks finished", icon: "✅", color: "#22c55e" },
          { label: "Overdue", desc: "Past deadline, needs attention", icon: "⚠️", color: "#ef4444" },
          { label: "Overall Progress", desc: "Percentage complete", icon: "📊", color: "#00ECFF" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If a new hire doesn't have a checklist assigned, make sure their onboarding was initiated in the employee record — checklists don't auto-assign until the process is started. If tasks are assigned to the wrong person, edit the checklist template to update the responsible roles. If the exit checklist is missing the final settlement calculation, check that finance has completed the payroll for that period. If you can't access the Onboarding module, ask your admin to verify your role permissions.",
      },
      {
        id: "outro",
        voiceover: "Onboarding and offboarding checklists keep your processes clean and compliant. Every task is tracked, every responsible person is notified, and nothing falls through the cracks. Review the Platform Guide for more on managing employees and related HR modules.",
      },
    ],
  },
  {
    num: 28,
    folder: "DisciplinaryProcess",
    compId: "DisciplinaryProcess",
    title: "Disciplinary Process",
    subtitle: "Create records, response threads, acknowledgement, and expungement",
    icon: "⚖️",
    url: "ops.kdsquares.com/disciplinary",
    scenes: [
      {
        id: "intro",
        voiceover: "Disciplinary Process. This module handles formal disciplinary actions — issuing records, allowing employee responses, tracking acknowledgements, and managing expungements. You'll find it in the sidebar under People and HR, then Compliance, then Disciplinary. Everything is documented and timestamped for a fair and transparent process. Let's walk through each step.",
      },
      {
        id: "create",
        name: "CreateRecord",
        scenePrefix: "DP",
        title: "Creating a Disciplinary Record",
        breadcrumb: ["People & HR", "Compliance", "Disciplinary"],
        voiceover: "To create a disciplinary record, navigate to People and HR, then Compliance, then Disciplinary. Click New Record. Select the employee from the dropdown. Choose the category: Verbal Warning, Written Warning, Suspension, or Termination. Enter the incident date — when the issue occurred. Write a detailed description of the incident, including specific actions and any policy violations. Attach any supporting evidence — emails, screenshots, witness statements. If there were witnesses, add their names. Review everything carefully before submitting — this becomes a formal record. Click Create Record to submit. The employee is automatically notified and given the opportunity to respond.",
        items: [
          { label: "Employee", value: "Select the staff member", icon: "👤" },
          { label: "Category", value: "Warning, Suspension, or Termination", icon: "📋" },
          { label: "Incident Date", value: "When the incident occurred", icon: "📅" },
          { label: "Description", value: "Detailed account of the issue", icon: "📝" },
          { label: "Evidence", value: "Attach supporting documents", icon: "📎" },
          { label: "Witnesses", value: "Name any witnesses", icon: "👥" },
        ],
      },
      {
        id: "response",
        name: "ResponseThread",
        scenePrefix: "DP",
        title: "Employee Response Thread",
        breadcrumb: ["People & HR", "Compliance", "Disciplinary", "Response"],
        voiceover: "After a disciplinary record is created, the employee receives a notification with a link to view the record and submit a response. The response window is configurable — typically 3 to 7 days. The employee can write their side of the story and attach any supporting documents. Their response is attached to the same record, creating a full thread. As an HR admin, you can review the employee's response by clicking on the record and scrolling to the Response section. Based on the response, you can update the decision — escalate, downgrade, or maintain the original action. All changes are timestamped and logged.",
        items: [
          { label: "Notification", desc: "Employee receives alert to respond", icon: "🔔" },
          { label: "Response Window", desc: "Set days allowed for reply", icon: "⏰" },
          { label: "Employee Reply", desc: "Written response attached to record", icon: "💬" },
          { label: "HR Review", desc: "Review response and update decision", icon: "👁️" },
        ],
      },
      {
        id: "acknowledge",
        name: "AcknowledgeExpunge",
        scenePrefix: "DP",
        title: "Acknowledgement & Expungement",
        breadcrumb: ["People & HR", "Compliance", "Disciplinary", "Actions"],
        voiceover: "Once the process is complete, the employee is asked to acknowledge the record — confirming they have read and understood the disciplinary action. Click the Acknowledge button on their record page. If the employee disagrees, they can file a formal appeal through the same interface. For expungement — removing a record after a clean period — an HR admin clicks the Expunge button on an eligible record. Expungement requires admin approval and is logged in the audit trail. Even after expungement, the audit trail retains that a record existed and was removed, maintaining compliance. Every action — creation, response, acknowledgement, appeal, and expungement — is permanently logged with timestamps.",
        items: [
          { label: "Acknowledge", desc: "Employee confirms they've read the record", icon: "✅" },
          { label: "Appeal", desc: "Employee can formally appeal the decision", icon: "📤" },
          { label: "Expunge", desc: "Remove record after review period", icon: "🗑️" },
          { label: "Audit Trail", desc: "Every action is logged permanently", icon: "📝" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If an employee says they didn't receive the notification, check their email address in their profile and verify the notification settings. If the response window has expired but the employee hasn't replied, you can extend it by editing the record settings. If you need to expunge a record but the button is greyed out, the review period may not have elapsed — check the minimum period in your company's disciplinary policy settings. If you can't access the Disciplinary module, your role needs HR compliance permissions.",
      },
      {
        id: "outro",
        voiceover: "The Disciplinary Process module ensures fair, documented, and transparent handling of all disciplinary matters. Every step is logged, every response is recorded, and every decision has an audit trail. Check the Platform Guide for related modules like Grievance Management.",
      },
    ],
  },
  {
    num: 29,
    folder: "HRLettersModule",
    compId: "HRLettersModule",
    title: "HR Letters",
    subtitle: "Generate formal letters with templates and e-signatures",
    icon: "✉️",
    url: "ops.kdsquares.com/hr-letters",
    scenes: [
      {
        id: "intro",
        voiceover: "HR Letters. This module lets you generate formal letters for employees — offer letters, confirmation letters, promotion letters, and more — using pre-built templates. You can also collect e-signatures directly within KDOps. Find it in the sidebar under People and HR, then Documents, then HR Letters. Let's see how it works.",
      },
      {
        id: "create",
        name: "CreateLetter",
        scenePrefix: "HL",
        title: "Creating a Letter",
        breadcrumb: ["People & HR", "Documents", "HR Letters"],
        voiceover: "To create a letter, navigate to People and HR, then Documents, then HR Letters. Click New Letter. First, select a template from the dropdown — options include Offer Letter, Confirmation Letter, Promotion Letter, Warning Letter, and Termination Letter. Next, select the employee who will receive the letter. The system auto-fills their details like name, department, role, and employee ID. Set the effective date — when the letter's action takes effect. Fill in any custom fields the template requires, such as new salary, new role title, or probation end date. Click Preview to see the final letter with all details filled in. Review it carefully for accuracy before proceeding.",
        items: [
          { label: "Template", value: "Select from available letter types", icon: "📄" },
          { label: "Employee", value: "Choose the recipient", icon: "👤" },
          { label: "Effective Date", value: "When the letter takes effect", icon: "📅" },
          { label: "Custom Fields", value: "Fill in template variables", icon: "✏️" },
          { label: "Preview", value: "Review before sending", icon: "👁️" },
        ],
      },
      {
        id: "signature",
        name: "ESignature",
        scenePrefix: "HL",
        title: "E-Signature Collection",
        breadcrumb: ["People & HR", "Documents", "HR Letters", "Signature"],
        voiceover: "After previewing the letter, click Send for Signature. The employee receives an email with a secure link to view and sign the letter digitally. They click the link, review the letter, and add their e-signature — either by typing their name or drawing a signature. Once the employee signs, the letter moves to the countersign stage. The designated HR admin or manager receives a notification to add their own signature. After both signatures are collected, the fully signed letter is stored in the employee's document folder. You can download the signed PDF at any time from the HR Letters page or the employee's profile.",
        items: [
          { label: "Send for Signature", desc: "Email link to employee", icon: "📧" },
          { label: "Employee Signs", desc: "Digital signature on the letter", icon: "✍️" },
          { label: "Countersign", desc: "HR or manager signs after employee", icon: "👤" },
          { label: "Signed Copy", desc: "Download the completed letter", icon: "📥" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If a letter template is missing fields, contact your admin — they manage templates in Settings under HR Letters. If the employee says they didn't receive the signature email, check their email address and look in the Pending Signatures tab for the letter's status. If the e-signature link has expired, you can resend it from the letter's detail page by clicking Resend Signature Request. If you can't find a signed letter, check the employee's profile under Documents — all signed letters are stored there automatically.",
      },
      {
        id: "outro",
        voiceover: "HR Letters makes formal communication easy and traceable. Generate letters from templates, collect e-signatures digitally, and store everything in the employee's record. No more chasing paper signatures. Check the Platform Guide for more HR modules.",
      },
    ],
  },
  {
    num: 30,
    folder: "GrievanceManagement",
    compId: "GrievanceManagement",
    title: "Grievance Management",
    subtitle: "File grievances, submit anonymously, and track resolution",
    icon: "📣",
    url: "ops.kdsquares.com/grievances",
    scenes: [
      {
        id: "intro",
        voiceover: "Grievance Management. This module provides a safe and structured way for employees to raise concerns, complaints, or grievances. Submissions can be anonymous if needed. HR tracks every grievance through to resolution. Find it in the sidebar under People and HR, then Compliance, then Grievances. Let's walk through the process.",
      },
      {
        id: "file",
        name: "FileGrievance",
        scenePrefix: "GM",
        title: "Filing a Grievance",
        breadcrumb: ["People & HR", "Compliance", "Grievances"],
        voiceover: "To file a grievance, navigate to People and HR, then Compliance, then Grievances. Click New Grievance. Select a category from the dropdown: Harassment, Discrimination, Policy Violation, Workplace Safety, or Other. Write a detailed description of the issue — include dates, people involved, and specific incidents. Attach any supporting evidence like emails, photos, or documents. If you want to remain anonymous, toggle the Anonymous Submission switch — your identity will be hidden from everyone except the designated grievance officer. Set the priority level: Low, Medium, High, or Critical. Click Submit Grievance. Your submission is immediately logged and the grievance officer is notified.",
        items: [
          { label: "Category", value: "Harassment, Discrimination, Policy, Other", icon: "📋" },
          { label: "Description", value: "Detailed account of the issue", icon: "📝" },
          { label: "Evidence", value: "Attach supporting files", icon: "📎" },
          { label: "Anonymous", value: "Toggle to hide your identity", icon: "🕶️" },
          { label: "Priority", value: "Low, Medium, High, Critical", icon: "🔴" },
        ],
      },
      {
        id: "resolution",
        name: "TrackResolution",
        scenePrefix: "GM",
        title: "Tracking Resolution",
        breadcrumb: ["People & HR", "Compliance", "Grievances", "Resolution"],
        voiceover: "After filing, you can track your grievance's progress on the Grievances page. Each grievance moves through stages: Submitted, Under Review, Action Taken, and Resolved. Click on your grievance to see updates from the grievance officer — they may add notes about the investigation progress or request additional information from you. When action is taken, you'll see what steps were implemented. Once resolved, the outcome is documented and the case is closed. For anonymous submissions, communication happens through the system without revealing your identity. HR admins see a dashboard of all grievances with filters for category, status, and priority.",
        items: [
          { label: "Submitted", desc: "Grievance received and logged", icon: "📩", color: "#8BAAB8" },
          { label: "Under Review", desc: "Grievance officer investigating", icon: "🔍", color: "#f59e0b" },
          { label: "Action Taken", desc: "Resolution steps implemented", icon: "⚙️", color: "#006994" },
          { label: "Resolved", desc: "Case closed with outcome", icon: "✅", color: "#22c55e" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If you filed anonymously but your identity was revealed, contact your admin immediately — this is a system configuration issue. If your grievance has been in Under Review for too long, use the system to send a follow-up message to the grievance officer. If you can't see the Grievances module, your role may not have access — but all employees should be able to file grievances, so ask your admin to check. If the Anonymous toggle is not available, your company may not have enabled anonymous submissions in the module settings.",
      },
      {
        id: "outro",
        voiceover: "Grievance Management provides a safe channel for raising concerns. File with confidence, track the resolution, and know that every submission is logged and handled. Anonymous or not, your voice matters. Check the Platform Guide for related compliance modules.",
      },
    ],
  },
  {
    num: 31,
    folder: "SuccessionPlanning",
    compId: "SuccessionPlanning",
    title: "Succession Planning",
    subtitle: "Identify key roles and assign potential successors",
    icon: "🏆",
    url: "ops.kdsquares.com/succession",
    scenes: [
      {
        id: "intro",
        voiceover: "Succession Planning. This module helps leadership identify critical roles in the organisation and map potential successors for each one. It's a strategic tool for business continuity. Find it in the sidebar under People and HR, then Talent, then Succession Planning. Let's walk through how to set it up.",
      },
      {
        id: "roles",
        name: "IdentifyRoles",
        scenePrefix: "SP",
        title: "Identifying Key Roles",
        breadcrumb: ["People & HR", "Talent", "Succession"],
        voiceover: "To start succession planning, navigate to People and HR, then Talent, then Succession Planning. Click Add Key Role. Enter the role title — this should be a specific position like Chief Financial Officer or Head of Engineering. Select the current holder from the employee dropdown. Choose the department. Set the Risk Level — this indicates the business impact if this role suddenly becomes vacant: Low, Medium, High, or Critical. Set the expected timeline for potential transition — whether this is planned for the near term or is a long-term contingency. Click Save. The role now appears on your succession planning board, ready for candidate assignment.",
        items: [
          { label: "Role Title", value: "Name of the critical position", icon: "👔" },
          { label: "Current Holder", value: "Who currently fills this role", icon: "👤" },
          { label: "Department", value: "Which department the role belongs to", icon: "🏢" },
          { label: "Risk Level", value: "Impact if role becomes vacant", icon: "⚠️" },
          { label: "Timeline", value: "Expected transition window", icon: "📅" },
        ],
      },
      {
        id: "candidates",
        name: "AssignCandidates",
        scenePrefix: "SP",
        title: "Assigning Successor Candidates",
        breadcrumb: ["People & HR", "Talent", "Succession", "Candidates"],
        voiceover: "Click on any key role to open its detail view, then click Add Candidate. Select an employee who could potentially fill this role in the future. Set their Readiness Level: Ready Now means they could step in immediately, 1-2 Years means they need some development, and 3+ Years means they're a long-term prospect. For each candidate, create a Development Plan — list the skills, certifications, or training they need to be ready. Add notes with leadership observations and feedback from performance reviews. You can assign multiple candidates to a single role, creating a ranked succession bench. Review and update succession plans quarterly to keep them relevant.",
        items: [
          { label: "Candidate Name", value: "Select potential successor", icon: "👤" },
          { label: "Readiness", value: "Ready Now, 1-2 Years, 3+ Years", icon: "📊" },
          { label: "Development Plan", value: "Skills and training needed", icon: "📚" },
          { label: "Notes", value: "Leadership observations and feedback", icon: "💬" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If you can't see the Succession Planning module, this is typically restricted to senior management and HR leadership — ask your admin about access. If a candidate's readiness level seems wrong, review their recent performance reviews and training completions before updating. If a key role's current holder has left the company, update the role immediately — the system will flag it as vacant and highlight the top succession candidate.",
      },
      {
        id: "outro",
        voiceover: "Succession Planning protects your organisation's future. Identify critical roles, develop talent pipelines, and ensure business continuity. Review your succession plans regularly and update development paths. Check the Platform Guide for more on talent management.",
      },
    ],
  },
  {
    num: 32,
    folder: "GoalsSetting",
    compId: "GoalsSetting",
    title: "Goals & OKRs",
    subtitle: "Create goals, track progress, and link to tasks",
    icon: "🎯",
    url: "ops.kdsquares.com/goals",
    scenes: [
      {
        id: "intro",
        voiceover: "Goals and OKRs. This module lets managers and employees create goals, set key results, track progress over time, and link goals directly to tasks in KDOps. Find it in the sidebar under Workspace, then Productivity, then Goals. Whether it's quarterly OKRs or annual objectives, everything is tracked here. Let's walk through the full process.",
      },
      {
        id: "create",
        name: "CreateGoal",
        scenePrefix: "GS",
        title: "Creating a Goal",
        breadcrumb: ["Workspace", "Productivity", "Goals"],
        voiceover: "To create a goal, navigate to Workspace in the sidebar, then Productivity, then Goals. Click New Goal. Enter a clear, measurable goal title — for example, Increase monthly revenue by 20 percent. Assign an owner — this is the person responsible for achieving the goal. Select the time period: Q1, Q2, Q3, Q4, Annual, or set a custom date range. Add Key Results — these are the measurable outcomes that indicate progress. You can add up to 5 key results per goal, each with a target value and unit of measurement. Link existing tasks from the Tasks module to this goal so work is directly connected to outcomes. Set the visibility: Personal for private goals, Team for department-level, or Company-wide for organisation goals. Click Create Goal.",
        items: [
          { label: "Goal Title", value: "Clear, measurable objective", icon: "🎯" },
          { label: "Owner", value: "Who is responsible", icon: "👤" },
          { label: "Time Period", value: "Q1, Q2, Annual, Custom", icon: "📅" },
          { label: "Key Results", value: "Measurable outcomes (up to 5)", icon: "📊" },
          { label: "Linked Tasks", value: "Connect to existing tasks", icon: "🔗" },
          { label: "Visibility", value: "Personal, Team, or Company-wide", icon: "👁️" },
        ],
      },
      {
        id: "progress",
        name: "TrackProgress",
        scenePrefix: "GS",
        title: "Tracking Progress",
        breadcrumb: ["Workspace", "Productivity", "Goals", "Progress"],
        voiceover: "On the Goals page, you see all goals with their progress bars and status indicators. Click on any goal to see its details. Each key result has its own progress tracker — click Update to enter the current value. The overall goal progress is calculated automatically from its key results. Add regular check-in notes to document progress, blockers, or changes in approach. The system assigns a status: On Track if progress matches the timeline, At Risk if you're slightly behind, and Behind if significant progress is needed. Managers can view their team's goals in a dashboard view, filtered by department, status, or time period. Linked tasks automatically update goal progress when they're completed.",
        items: [
          { label: "Progress Bar", desc: "Visual completion percentage", icon: "📊", color: "#22c55e" },
          { label: "Key Result Updates", desc: "Update each KR individually", icon: "🔄", color: "#006994" },
          { label: "Check-ins", desc: "Regular progress notes", icon: "💬", color: "#f59e0b" },
          { label: "Status", desc: "On Track, At Risk, Behind", icon: "🚦", color: "#00ECFF" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If you can't create goals, check that your role has access to the Workspace productivity modules. If linked tasks aren't updating goal progress, make sure the link was created correctly — click on the goal and verify the Linked Tasks section shows the right tasks. If the progress percentage looks wrong, check each key result's target value and current value — the calculation is based on these numbers. If you can't see team goals, your visibility settings may be set to Personal only.",
      },
      {
        id: "outro",
        voiceover: "Goals and OKRs keep everyone aligned and accountable. Create clear objectives, track progress with key results, and link everything to your daily tasks. Review goals regularly and update your check-ins. See the Platform Guide for more on the Workspace productivity tools.",
      },
    ],
  },
  {
    num: 33,
    folder: "PerformanceReviews",
    compId: "PerformanceReviews",
    title: "Performance Reviews",
    subtitle: "Review cycles, competency ratings, and acknowledgement",
    icon: "⭐",
    url: "ops.kdsquares.com/performance",
    scenes: [
      {
        id: "intro",
        voiceover: "Performance Reviews. This module manages the entire review cycle — setting up review periods, rating employee competencies, collecting feedback, and getting acknowledgements. Find it in the sidebar under People and HR, then Talent, then Performance Reviews. Let's walk through each step of running a review cycle.",
      },
      {
        id: "cycle",
        name: "CreateCycle",
        scenePrefix: "PR",
        title: "Creating a Review Cycle",
        breadcrumb: ["People & HR", "Talent", "Performance"],
        voiceover: "To create a review cycle, navigate to People and HR, then Talent, then Performance Reviews. Click New Review Cycle. Enter a cycle name like Q3 2026 Performance Review. Set the review period — the start and end dates that this review covers. Select participants — you can include entire departments or pick individual employees. Choose the competencies to rate — these are the skills and behaviours you want to evaluate, like Communication, Technical Skills, Leadership, and Teamwork. Assign reviewers — typically each employee's direct manager. Set the deadline for when all reviews must be submitted. Click Create Cycle. All participants and reviewers are notified automatically.",
        items: [
          { label: "Cycle Name", value: "e.g. Q3 2026 Performance Review", icon: "📋" },
          { label: "Review Period", value: "Start and end dates", icon: "📅" },
          { label: "Participants", value: "Select departments or individuals", icon: "👥" },
          { label: "Competencies", value: "Choose rating criteria", icon: "📊" },
          { label: "Reviewers", value: "Assign managers as reviewers", icon: "👤" },
          { label: "Deadline", value: "When all reviews must be completed", icon: "⏰" },
        ],
      },
      {
        id: "rate",
        name: "RateCompetencies",
        scenePrefix: "PR",
        title: "Rating Competencies",
        breadcrumb: ["People & HR", "Talent", "Performance", "Review"],
        voiceover: "As a reviewer, navigate to Performance Reviews and click on the active cycle. You'll see your list of employees to review. Click on an employee's name to start their review. For each competency, select a rating on the scale — typically 1 for Needs Improvement through 5 for Exceptional. Add specific comments for each competency — explain why you gave that rating with concrete examples. The Goals Review section shows the employee's goals and their completion status, helping you assess their achievement. Write an Overall Rating summary that captures the employee's total performance. Finally, list Development Areas — specific skills or behaviours to improve in the next period. Click Save Draft to continue later, or Submit Review when complete.",
        items: [
          { label: "Competency", desc: "Skill or behaviour being evaluated", icon: "📊" },
          { label: "Rating Scale", desc: "1-5 or custom scale", icon: "⭐" },
          { label: "Comments", desc: "Specific feedback for each area", icon: "💬" },
          { label: "Goals Review", desc: "Assess linked goal achievement", icon: "🎯" },
          { label: "Overall Rating", desc: "Summary assessment", icon: "📈" },
          { label: "Development Areas", desc: "Recommended improvements", icon: "📚" },
        ],
      },
      {
        id: "acknowledge",
        name: "AcknowledgeReview",
        scenePrefix: "PR",
        title: "Review Acknowledgement",
        breadcrumb: ["People & HR", "Talent", "Performance", "Acknowledge"],
        voiceover: "After a reviewer submits a review, the employee receives a notification. They can view the full review — all competency ratings, comments, overall assessment, and development areas. The employee can add their own comments — agreeing with feedback, providing context, or raising concerns. Once they've read everything, they click Acknowledge to confirm the review has been received and understood. This creates a timestamped record of acknowledgement. HR admins can track which reviews are pending acknowledgement on the cycle dashboard. If an employee doesn't acknowledge within the deadline, the system flags it for HR follow-up.",
        items: [
          { label: "Employee Notification", desc: "Review available to read", icon: "🔔" },
          { label: "Read Review", desc: "Employee views all feedback", icon: "📖" },
          { label: "Employee Comments", desc: "Optional response to feedback", icon: "💬" },
          { label: "Acknowledge", desc: "Confirm review has been read", icon: "✅" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If reviewers can't see their employees in the review cycle, check that the participants were correctly assigned — managers must be listed as reviewers for their direct reports. If the competency list is wrong, the cycle creator can edit it before reviews are submitted. If an employee disputes their rating, they can add comments during the acknowledgement step — these become part of the permanent record. If the review cycle deadline has passed and some reviews are incomplete, the admin can extend the deadline from the cycle settings.",
      },
      {
        id: "outro",
        voiceover: "Performance Reviews in KDOps create a structured, transparent evaluation process. Set up cycles, rate competencies with evidence, and collect acknowledgements — all documented and timestamped. Review the Platform Guide for more talent management tools like Goals and Succession Planning.",
      },
    ],
  },
  {
    num: 34,
    folder: "SurveysModule",
    compId: "SurveysModule",
    title: "Surveys",
    subtitle: "Create surveys, collect anonymous responses, and view results",
    icon: "📊",
    url: "ops.kdsquares.com/surveys",
    scenes: [
      {
        id: "intro",
        voiceover: "Surveys. This module lets you create custom surveys, distribute them to employees, collect responses — including anonymous ones — and analyse the results. Find it in the sidebar under People and HR, then Engagement, then Surveys. Perfect for employee satisfaction, pulse checks, and feedback collection. Let's walk through the process.",
      },
      {
        id: "create",
        name: "CreateSurvey",
        scenePrefix: "SV",
        title: "Creating a Survey",
        breadcrumb: ["People & HR", "Engagement", "Surveys"],
        voiceover: "To create a survey, navigate to People and HR, then Engagement, then Surveys. Click New Survey. Enter a clear survey title like Q3 Employee Satisfaction Survey. Add questions using the question builder — choose from Multiple Choice, Rating Scale (1-5 or 1-10), Text Response, or Yes/No. For each question, you can mark it as required or optional. Select the target audience: All Employees, a specific department, or employees in a particular role. Toggle Anonymous Responses if you want respondents' identities hidden — this encourages honest feedback. Set a deadline for when responses are due. Click Preview to see how the survey will look, then click Publish to send it out. All participants receive a notification with a link to the survey.",
        items: [
          { label: "Survey Title", value: "Name your survey clearly", icon: "📝" },
          { label: "Questions", value: "Add multiple choice, rating, or text", icon: "❓" },
          { label: "Target Audience", value: "All employees, department, or role", icon: "👥" },
          { label: "Anonymous", value: "Toggle for anonymous responses", icon: "🕶️" },
          { label: "Deadline", value: "When responses are due", icon: "📅" },
          { label: "Publish", value: "Send to participants", icon: "📤" },
        ],
      },
      {
        id: "respond",
        name: "RespondToSurvey",
        scenePrefix: "SV",
        title: "Responding to a Survey",
        breadcrumb: ["People & HR", "Engagement", "Surveys", "Respond"],
        voiceover: "When you receive a survey notification, click the link to open the survey. You'll see each question with its response options. For multiple choice, select one or more options. For rating scales, click the number that best represents your answer. For text responses, type your answer in the text box. Required questions are marked with a red asterisk — you must answer these before submitting. Once you've completed all questions, click Submit Survey. You'll see a confirmation message. If the survey is anonymous, your name is not attached to your responses. You can only submit once — make sure your answers are final before clicking Submit.",
        items: [
          { label: "Notification", desc: "Receive survey link via email or in-app", icon: "🔔" },
          { label: "Answer Questions", desc: "Complete all required fields", icon: "✏️" },
          { label: "Submit", desc: "Send your responses", icon: "📤" },
          { label: "Confirmation", desc: "Receive submission confirmation", icon: "✅" },
        ],
      },
      {
        id: "results",
        name: "ViewResults",
        scenePrefix: "SV",
        title: "Viewing Survey Results",
        breadcrumb: ["People & HR", "Engagement", "Surveys", "Results"],
        voiceover: "To view results, navigate to Surveys and click on the survey name. The Results tab shows a summary dashboard. At the top, you see the response rate — how many people responded out of the total audience. Each question has a visual breakdown: pie charts for multiple choice, bar charts for ratings, and a list of text responses. For anonymous surveys, text responses are shown without names. You can filter results by department or role to see patterns across groups. Click Export to download the full results as a CSV file for further analysis, or as a PDF report for sharing with leadership. Use these insights to identify trends, address concerns, and improve employee engagement.",
        items: [
          { label: "Response Rate", desc: "Percentage of participants who responded", icon: "📊" },
          { label: "Summary Charts", desc: "Visual breakdown of each question", icon: "📈" },
          { label: "Individual Responses", desc: "Read text answers (anonymous if set)", icon: "📝" },
          { label: "Export", desc: "Download results as CSV or PDF", icon: "📥" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If employees say they didn't receive the survey, check that they're in the target audience and that their notification settings are enabled. If the response rate is low, send a reminder from the survey page by clicking Send Reminder — participants who haven't responded will get another notification. If you need to edit a question after publishing, you can only do so if no responses have been submitted yet. If anonymous results are needed but the toggle wasn't set, you'll need to create a new survey — anonymity can't be added after responses are collected.",
      },
      {
        id: "outro",
        voiceover: "Surveys give you direct insight into what your team thinks. Create targeted surveys, protect anonymity when needed, and act on the results. Regular pulse surveys keep you connected to employee sentiment. Check the Platform Guide for more engagement tools.",
      },
    ],
  },
  {
    num: 35,
    folder: "BenefitsEnrollment",
    compId: "BenefitsEnrollment",
    title: "Benefits Enrollment",
    subtitle: "Enroll employees in HMO, pension, and other benefits",
    icon: "🏥",
    url: "ops.kdsquares.com/benefits",
    scenes: [
      {
        id: "intro",
        voiceover: "Benefits Enrollment. This module manages employee benefits — HMO health plans, pension contributions, life insurance, and other company benefits. HR admins enroll employees and track their benefit status. Find it in the sidebar under People and HR, then Compensation, then Benefits. Let's walk through the enrollment process.",
      },
      {
        id: "enroll",
        name: "EnrollBenefit",
        scenePrefix: "BE",
        title: "Enrolling in a Benefit",
        breadcrumb: ["People & HR", "Compensation", "Benefits"],
        voiceover: "To enroll an employee in a benefit, navigate to People and HR, then Compensation, then Benefits. Click New Enrollment. Select the employee from the dropdown. Choose the benefit type: HMO Health Plan, Pension, Life Insurance, Gym Membership, or any custom benefit your company offers. Select the specific plan or tier — for HMO this might be Basic, Standard, or Premium. Choose the coverage level: Employee Only or Employee plus Family. Set the effective date — when coverage begins. Select the provider — the insurance company, pension fund administrator, or benefit provider. Review the enrollment summary including any employee contribution amounts. Click Enroll to confirm. The employee is notified of their new benefit enrollment.",
        items: [
          { label: "Employee", value: "Select the staff member", icon: "👤" },
          { label: "Benefit Type", value: "HMO, Pension, Life Insurance, etc.", icon: "📋" },
          { label: "Plan", value: "Choose the specific plan or tier", icon: "📊" },
          { label: "Coverage", value: "Employee only, Employee + Family", icon: "👨‍👩‍👧" },
          { label: "Effective Date", value: "When coverage begins", icon: "📅" },
          { label: "Provider", value: "Insurance or pension provider", icon: "🏢" },
        ],
      },
      {
        id: "track",
        name: "TrackEnrollments",
        scenePrefix: "BE",
        title: "Tracking Enrollments",
        breadcrumb: ["People & HR", "Compensation", "Benefits", "Dashboard"],
        voiceover: "The Benefits dashboard shows all enrollments across the company. Active Plans shows employees with confirmed, running benefits. Pending shows enrollments waiting for provider confirmation. Expiring Soon highlights benefits approaching their renewal date so you can act before coverage lapses. The Total Cost summary shows the company's overall benefit spend, broken down by benefit type. Click on any employee to see their full benefit profile — all enrolled plans, coverage details, and contribution amounts. You can also filter by benefit type, department, or status. Use the export function to generate reports for finance or management review.",
        items: [
          { label: "Active Plans", desc: "Currently enrolled benefits", icon: "✅", color: "#22c55e" },
          { label: "Pending", desc: "Awaiting provider confirmation", icon: "⏳", color: "#f59e0b" },
          { label: "Expiring Soon", desc: "Benefits nearing renewal date", icon: "⚠️", color: "#ef4444" },
          { label: "Total Cost", desc: "Company benefit spend summary", icon: "💰", color: "#006994" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If an enrollment shows as Pending for too long, contact the benefit provider to confirm they received the enrollment request. If an employee's HMO card hasn't arrived, check the provider's processing timeline and follow up directly. If benefit costs in payroll don't match, verify the contribution amounts in the enrollment details match the payroll settings. If you can't access the Benefits module, your role needs HR compensation permissions — ask your admin.",
      },
      {
        id: "outro",
        voiceover: "Benefits Enrollment keeps all your employee benefits organized and trackable. Enroll quickly, monitor status, and never miss a renewal. Your employees' wellbeing starts with proper benefit management. Check the Platform Guide for more compensation and HR modules.",
      },
    ],
  },
  {
    num: 36,
    folder: "ClientsManagement",
    compId: "ClientsManagement",
    title: "Clients Management",
    subtitle: "Add clients, manage profiles, and link to projects and invoices",
    icon: "🤝",
    url: "ops.kdsquares.com/clients",
    scenes: [
      {
        id: "intro",
        voiceover: "Clients Management. This module is your central directory for all company clients. Add client details, link them to projects and invoices, and keep a complete relationship history. Find it in the sidebar under CRM, then Clients. Let's walk through adding and managing clients.",
      },
      {
        id: "add",
        name: "AddClient",
        scenePrefix: "CLM",
        title: "Adding a New Client",
        breadcrumb: ["CRM", "Clients"],
        voiceover: "To add a new client, navigate to CRM in the sidebar, then click Clients. Click the Add Client button at the top right. Fill in the company name — this should be the client's official registered business name. Enter the primary contact person's name, their email address, and phone number. Select the industry from the dropdown — options include Technology, Finance, Healthcare, Manufacturing, and more. Enter the registered office address. You can also add notes about the client relationship — how you met, contract terms, or special requirements. Click Save Client when done. The client now appears in your client directory and can be linked to projects and invoices.",
        items: [
          { label: "Company Name", value: "Client's registered business name", icon: "🏢" },
          { label: "Contact Person", value: "Primary point of contact", icon: "👤" },
          { label: "Email", value: "Business email address", icon: "📧" },
          { label: "Phone", value: "Contact phone number", icon: "📱" },
          { label: "Industry", value: "Client's business sector", icon: "🏭" },
          { label: "Address", value: "Registered office address", icon: "📍" },
        ],
      },
      {
        id: "profile",
        name: "ClientProfile",
        scenePrefix: "CLM",
        title: "Client Profile & Linked Records",
        breadcrumb: ["CRM", "Clients", "Profile"],
        voiceover: "Click on any client name to open their full profile. The Overview tab shows all contact details and relationship notes. The Projects tab lists all active and completed projects linked to this client — you can create a new project directly from here. The Invoices tab shows every invoice issued to this client with amounts and payment status — paid, pending, or overdue. The Communications tab logs email and meeting history. The Documents tab stores contracts, proposals, and any files related to this client. The Revenue section shows total billing history and payment patterns. This gives you a complete 360-degree view of every client relationship. Use it before every client meeting to be fully prepared.",
        items: [
          { label: "Overview", desc: "Contact details and relationship notes", icon: "📋" },
          { label: "Projects", desc: "Active and past projects for this client", icon: "📁" },
          { label: "Invoices", desc: "All invoices issued to this client", icon: "🧾" },
          { label: "Communications", desc: "Email and meeting history", icon: "📧" },
          { label: "Documents", desc: "Contracts, proposals, and files", icon: "📄" },
          { label: "Revenue", desc: "Total billing and payment history", icon: "💰" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If you can't see the Clients module, your role needs CRM access — ask your admin. If a client's invoices aren't showing on their profile, make sure the invoices were linked to the correct client when created — you can edit an invoice to change the client association. If duplicate client entries exist, contact your admin to merge them — duplicates can cause confusion in reporting. If you need to delete a client, note that clients with linked invoices or projects cannot be deleted, only archived.",
      },
      {
        id: "outro",
        voiceover: "Clients Management gives you a complete view of every client relationship. Keep profiles updated, link all projects and invoices, and use the history to strengthen client engagement. Check the Platform Guide for the Invoicing walkthrough next.",
      },
    ],
  },
  {
    num: 37,
    folder: "InvoicingClients",
    compId: "InvoicingClients",
    title: "Invoicing Clients",
    subtitle: "Create invoices, handle VAT, and track payment status",
    icon: "🧾",
    url: "ops.kdsquares.com/invoices",
    scenes: [
      {
        id: "intro",
        voiceover: "Invoicing Clients. This module lets you create professional invoices, apply VAT and discounts, send them to clients, and track payment status. Find it in the sidebar under CRM, then Invoices. Whether you're billing for services, products, or project milestones, everything is managed here. Let's walk through the full invoicing process.",
      },
      {
        id: "create",
        name: "CreateInvoice",
        scenePrefix: "IC",
        title: "Creating an Invoice",
        breadcrumb: ["CRM", "Invoices"],
        voiceover: "To create an invoice, navigate to CRM in the sidebar, then click Invoices. Click New Invoice. Select the client from your client directory — their details auto-fill. The invoice number is generated automatically, but you can customise it if your company uses a specific format. Add line items — each line has a description, quantity, unit price, and total. For example: Website Development, quantity 1, unit price 500,000 naira. Add as many line items as needed. The system calculates the subtotal automatically. Apply VAT — the default rate is 7.5 percent, which you can adjust. Add a discount if applicable — either a percentage or a flat amount. Set the due date — when payment is expected. Review the total including VAT and discounts. Click Save as Draft to review later, or Send Invoice to email it directly to the client.",
        items: [
          { label: "Client", value: "Select from your client directory", icon: "🤝" },
          { label: "Invoice Number", value: "Auto-generated or custom", icon: "🔢" },
          { label: "Line Items", value: "Add services, products, or fees", icon: "📋" },
          { label: "VAT", value: "Apply VAT rate (7.5% default)", icon: "📊" },
          { label: "Discount", value: "Optional percentage or flat discount", icon: "💸" },
          { label: "Due Date", value: "Payment deadline", icon: "📅" },
        ],
      },
      {
        id: "payments",
        name: "TrackPayments",
        scenePrefix: "IC",
        title: "Tracking Payment Status",
        breadcrumb: ["CRM", "Invoices", "Payments"],
        voiceover: "The Invoices page shows all invoices with their status. Draft means the invoice hasn't been sent yet. Sent means the client has received it and payment is pending. Paid means the full amount has been received. Overdue means the due date has passed without payment — these are highlighted in red for immediate follow-up. Partial means some payment was received but the balance is outstanding. To record a payment, click on the invoice and click Record Payment. Enter the amount received, the payment date, and the payment method — bank transfer, card, or cash. For partial payments, the system tracks the remaining balance automatically. You can send payment reminders directly from the invoice page by clicking Send Reminder. The client receives an email with the outstanding amount and due date.",
        items: [
          { label: "Draft", desc: "Not yet sent to client", icon: "📝", color: "#8BAAB8" },
          { label: "Sent", desc: "Invoice delivered, awaiting payment", icon: "📧", color: "#f59e0b" },
          { label: "Paid", desc: "Payment received in full", icon: "✅", color: "#22c55e" },
          { label: "Overdue", desc: "Past due date, follow up needed", icon: "🔴", color: "#ef4444" },
          { label: "Partial", desc: "Partial payment received", icon: "💰", color: "#006994" },
        ],
      },
      {
        id: "troubleshoot",
        voiceover: "If the VAT calculation looks wrong, check the VAT rate in your company's invoice settings — it should be set to 7.5 percent for Nigerian businesses. If a client says they didn't receive the invoice, check the email address on their client profile and resend from the invoice detail page. If you need to edit a sent invoice, you can create a credit note to adjust it rather than modifying the original — this maintains a proper audit trail. If payment was recorded against the wrong invoice, contact your finance admin to reverse and reapply it correctly.",
      },
      {
        id: "outro",
        voiceover: "Invoicing in KDOps is clean and professional. Create detailed invoices, apply VAT correctly, track every payment, and follow up on overdue amounts. Keep your cash flow healthy with timely invoicing. Check the Platform Guide for more CRM and finance modules.",
      },
    ],
  },
];

// ─── GENERATOR ───────────────────────────────────────────────────────

function generateTheme(folder) {
  const dir = join(SRC, folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "theme.ts"), `export { COLORS } from "../WelcomeToKDOps/theme";\n`);
}

function generateIntroScene(folder, video) {
  const prefix = video.compId.replace(/[a-z]/g, "").slice(0, 3) || video.compId.slice(0, 2).toUpperCase();
  const code = `import {
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

export const ${prefix}IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: \`radial-gradient(ellipse at 50% 40%, \${COLORS.bgLight} 0%, \${COLORS.bg} 70%)\`,
        display: "flex",
        flexDirection: "column" as const,
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: \`linear-gradient(90deg, \${COLORS.accent}, \${COLORS.accentBright}, \${COLORS.gold})\` }} />
      <Interactive.Div name="Badge" style={{ fontSize: 14, fontFamily: monoFamily, color: COLORS.accentBright, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 24, opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        KDOps Platform Guide
      </Interactive.Div>
      <Interactive.Div name="Icon" style={{ width: 90, height: 90, borderRadius: 20, background: \`linear-gradient(135deg, \${COLORS.accent}, \${COLORS.accentBright})\`, display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 32, scale: interpolate(frame, [0.2 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 200 }) }) }}>
        <span style={{ fontSize: 44 }}>${video.icon}</span>
      </Interactive.Div>
      <Interactive.Div name="Title" style={{ fontSize: 60, fontWeight: 700, color: COLORS.white, textAlign: "center" as const, opacity: interpolate(frame, [0.4 * fps, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        ${video.title}
      </Interactive.Div>
      <Interactive.Div name="Subtitle" style={{ fontSize: 24, color: COLORS.textMuted, textAlign: "center" as const, marginTop: 16, maxWidth: 650, lineHeight: 1.6, opacity: interpolate(frame, [0.7 * fps, 1.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        ${video.subtitle}
      </Interactive.Div>
      <Interactive.Div name="Tag" style={{ position: "absolute", bottom: 50, fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted, opacity: interpolate(frame, [1.2 * fps, 1.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        ${video.url}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
`;
  writeFileSync(join(SRC, folder, `${prefix}IntroScene.tsx`), code);
  return `${prefix}IntroScene`;
}

function generateContentScene(folder, video, scene) {
  const prefix = scene.scenePrefix || video.compId.slice(0, 2).toUpperCase();
  const compName = `${prefix}${scene.name}Scene`;
  const items = scene.items || [];
  const breadcrumb = scene.breadcrumb || [];

  const code = `import {
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

const ITEMS = ${JSON.stringify(items, null, 2)};

export const ${compName}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "40px 60px" }}>
      {/* Breadcrumb */}
      <Interactive.Div name="Breadcrumb" style={{ fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted, marginBottom: 10, opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        ${breadcrumb.map((b, i) => i < breadcrumb.length - 1
          ? `<span style={{ color: COLORS.accentBright }}>${b}</span><span style={{ margin: "0 8px" }}>{"›"}</span>`
          : `<span style={{ color: COLORS.white }}>${b}</span>`
        ).join("\n        ")}
      </Interactive.Div>

      {/* Title */}
      <Interactive.Div name="Title" style={{ fontSize: 36, fontWeight: 700, color: COLORS.white, marginBottom: 24, opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        ${scene.title}
      </Interactive.Div>

      {/* Items grid */}
      <div style={{ display: "grid", gridTemplateColumns: ${items.length > 4 ? '"1fr 1fr 1fr"' : items.length > 2 ? '"1fr 1fr"' : '"1fr"'}, gap: 16 }}>
        {ITEMS.map((item, i) => {
          const delay = 0.5 + i * 0.3;
          return (
            <Interactive.Div
              key={item.label}
              name={\`Item-\${i}\`}
              style={{
                background: COLORS.surface,
                border: \`1px solid \${COLORS.border}\`,
                borderRadius: 14,
                padding: "20px 24px",
                opacity: interpolate(frame, [delay * fps, (delay + 0.4) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                transform: \`translateY(\${interpolate(frame, [delay * fps, (delay + 0.4) * fps], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)\`,
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
`;
  writeFileSync(join(SRC, folder, `${compName}.tsx`), code);
  return compName;
}

function generateTroubleshootScene(folder, prefix) {
  const compName = `${prefix}TroubleshootScene`;
  const code = `import {
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

export const ${compName}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tips = [
    { icon: "❓", text: "Check your role and permissions if a module is missing" },
    { icon: "🏦", text: "Verify bank details before any disbursement request" },
    { icon: "🔄", text: "Refresh the page if data isn't loading" },
    { icon: "👤", text: "Contact your admin for access or permission issues" },
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily, padding: "40px 60px" }}>
      <Interactive.Div name="Title" style={{ fontSize: 36, fontWeight: 700, color: COLORS.white, marginBottom: 8, opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Troubleshooting
      </Interactive.Div>
      <Interactive.Div name="Subtitle" style={{ fontSize: 16, color: COLORS.textMuted, marginBottom: 32, opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Common issues and how to fix them
      </Interactive.Div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {tips.map((tip, i) => (
          <Interactive.Div key={i} name={\`Tip-\${i}\`} style={{
            background: COLORS.surface,
            border: \`1px solid \${COLORS.border}\`,
            borderRadius: 12,
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: interpolate(frame, [(0.4 + i * 0.4) * fps, (0.8 + i * 0.4) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}>
            <span style={{ fontSize: 28 }}>{tip.icon}</span>
            <span style={{ fontSize: 16, color: COLORS.text, lineHeight: 1.5 }}>{tip.text}</span>
          </Interactive.Div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
`;
  writeFileSync(join(SRC, folder, `${compName}.tsx`), code);
  return compName;
}

function generateOutroScene(folder, prefix, nextVideo) {
  const compName = `${prefix}OutroScene`;
  const code = `import {
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

export const ${compName}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      background: \`radial-gradient(ellipse at 50% 40%, \${COLORS.bgLight} 0%, \${COLORS.bg} 70%)\`,
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "center",
      alignItems: "center",
      fontFamily,
    }}>
      <Interactive.Div name="Check" style={{ fontSize: 64, marginBottom: 24, scale: interpolate(frame, [0, 0.5 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 200 }) }) }}>
        ✅
      </Interactive.Div>
      <Interactive.Div name="Title" style={{ fontSize: 42, fontWeight: 700, color: COLORS.white, textAlign: "center" as const, opacity: interpolate(frame, [0.3 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        You're all set!
      </Interactive.Div>
      <Interactive.Div name="Subtitle" style={{ fontSize: 20, color: COLORS.textMuted, textAlign: "center" as const, marginTop: 16, maxWidth: 500, lineHeight: 1.6, opacity: interpolate(frame, [0.6 * fps, 1.0 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        ${nextVideo ? `Next up: ${nextVideo}` : "Explore more videos in the Platform Guide"}
      </Interactive.Div>
      <Interactive.Div name="Badge" style={{ position: "absolute", bottom: 50, fontSize: 14, fontFamily: monoFamily, color: COLORS.textMuted, opacity: interpolate(frame, [1.0 * fps, 1.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        KDOps Platform Guide
      </Interactive.Div>
    </AbsoluteFill>
  );
};
`;
  writeFileSync(join(SRC, folder, `${compName}.tsx`), code);
  return compName;
}

function generateComposition(folder, video, sceneComponents) {
  const prefix = video.compId.replace(/[a-z]/g, "").slice(0, 3) || video.compId.slice(0, 2).toUpperCase();
  const importLines = sceneComponents.map(c =>
    `import { ${c} } from "./${c}";`
  ).join("\n");

  const scenes = video.scenes;
  const voFolder = `${String(video.num).padStart(2, "0")}-${video.compId}`;

  // Default scene durations (will be adjusted by fix-timings later)
  const defaultDurs = scenes.map(s => {
    if (s.id === "intro") return 10;
    if (s.id === "outro") return 10;
    if (s.id === "troubleshoot") return 15;
    return 20;
  });

  const voSegments = [];
  let cumFrame = 0;
  for (let i = 0; i < scenes.length; i++) {
    const dur = defaultDurs[i];
    voSegments.push({
      startFrame: cumFrame,
      durationFrames: dur * 30,
      file: `voiceover/${voFolder}/${scenes[i].id}.mp3`,
    });
    if (i < scenes.length - 1) cumFrame += dur * 30 - 15;
  }

  const sceneNames = scenes.map((s, i) => {
    if (s.id === "intro") return "Intro";
    if (s.id === "outro") return "Outro";
    if (s.id === "troubleshoot") return "Troubleshooting";
    return s.name || s.id;
  });

  const code = `import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig, AbsoluteFill } from "remotion";
${importLines}
import { VoiceoverTrack } from "../shared/VoiceoverTrack";

const voSegments = ${JSON.stringify(voSegments, null, 4).replace(/"startFrame"/g, "startFrame").replace(/"durationFrames"/g, "durationFrames").replace(/"file"/g, "file")};

export const ${video.compId}: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
    <TransitionSeries>
${scenes.map((s, i) => {
  const dur = defaultDurs[i];
  const comp = sceneComponents[i];
  const name = sceneNames[i];
  const transition = i < scenes.length - 1 ? `
      <TransitionSeries.Transition
        presentation={${i % 2 === 0 ? 'fade()' : 'slide({ direction: "from-right" })'}}
        timing={linearTiming({ durationInFrames: Math.round(0.5 * fps) })}
      />` : "";
  return `      <TransitionSeries.Sequence durationInFrames={${dur} * fps} name="${name}">
        <${comp} />
      </TransitionSeries.Sequence>${transition}`;
}).join("\n\n")}
    </TransitionSeries>
  <VoiceoverTrack segments={voSegments} />
  </AbsoluteFill>
  );
};
`;
  writeFileSync(join(SRC, folder, `${video.compId}.tsx`), code);
}

// ─── MAIN ────────────────────────────────────────────────────────────

console.log(`Generating batch 3: ${VIDEOS.length} new video compositions...\n`);

const rootImports = [];
const rootComps = [];

for (let vi = 0; vi < VIDEOS.length; vi++) {
  const video = VIDEOS[vi];
  const { folder, compId, scenes } = video;
  const prefix = compId.replace(/[a-z]/g, "").slice(0, 3) || compId.slice(0, 2).toUpperCase();
  const nextTitle = vi < VIDEOS.length - 1 ? VIDEOS[vi + 1].title : null;

  console.log(`── ${folder} (${scenes.length} scenes) ──`);

  // Generate theme
  generateTheme(folder);

  // Generate scenes
  const sceneComponents = [];
  for (const scene of scenes) {
    if (scene.id === "intro") {
      const name = generateIntroScene(folder, video);
      sceneComponents.push(name);
    } else if (scene.id === "troubleshoot") {
      const name = generateTroubleshootScene(folder, prefix);
      sceneComponents.push(name);
    } else if (scene.id === "outro") {
      const name = generateOutroScene(folder, prefix, nextTitle);
      sceneComponents.push(name);
    } else {
      const name = generateContentScene(folder, video, scene);
      sceneComponents.push(name);
    }
    console.log(`  ✓ ${scene.id}`);
  }

  // Generate main composition
  generateComposition(folder, video, sceneComponents);
  console.log(`  ✓ ${compId}.tsx (main)`);

  // Calculate total frames
  const durs = scenes.map(s => {
    if (s.id === "intro") return 10;
    if (s.id === "outro") return 10;
    if (s.id === "troubleshoot") return 15;
    return 20;
  });
  const totalFrames = durs.reduce((sum, d) => sum + d * 30, 0) - (scenes.length - 1) * 15;

  // Collect for Root.tsx update
  rootImports.push(`import { ${compId} } from "./${folder}/${compId}";`);
  sceneComponents.forEach(sc => {
    rootImports.push(`import { ${sc} } from "./${folder}/${sc}";`);
  });

  const varName = `V${video.num}_FRAMES`;
  rootComps.push({ varName, totalFrames, compId, folder, scenes: scenes.map((s, i) => ({ name: s.id === "intro" ? "Intro" : s.id === "outro" ? "Outro" : s.id === "troubleshoot" ? "Troubleshooting" : (s.name || s.id), dur: durs[i], comp: sceneComponents[i] })) });
}

// Output Root.tsx additions
console.log("\n\n=== ADD TO Root.tsx imports ===\n");
console.log(rootImports.join("\n"));
console.log("\n=== ADD frame constants ===\n");
rootComps.forEach(r => console.log(`const ${r.varName} = ${r.totalFrames};`));
console.log("\n=== ADD Composition blocks ===\n");
rootComps.forEach(r => {
  console.log(`      {/* === Video ${r.compId} === */}
      <Composition
        id="${r.compId}"
        component={${r.compId}}
        durationInFrames={${r.varName}}
        fps={FPS}
        width={1920}
        height={1080}
      />
`);
});

console.log("\n✅ All batch 3 compositions generated!");
