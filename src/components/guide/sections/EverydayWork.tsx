// Everyday Work — the modules almost everyone at the company touches on a
// normal day, regardless of role: clocking in, tasks, leave, timesheets,
// documents, messaging, the AI assistant, and the knowledge base behind it.
import { CalendarCheck2 } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function EverydayWorkSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={CalendarCheck2}
        title="Everyday Work"
        blurb="These are the modules you'll open more or less every working day, no matter what your role is — clocking in, managing your tasks, requesting leave, logging hours, finding files, talking to colleagues, and asking the AI assistant a question instead of hunting through a policy document. Everything below is available to every role; a couple of features inside them are restricted, and those are called out inline."
      />

      <ModuleCard title="Clocking In & Attendance" route="/attendance" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Attendance is a simple clock-in / clock-out pair, done once per shift. When you clock in and when you clock out, KDOps
          captures your location as a single map pin at that moment — it is <strong>not</strong> continuous location tracking, it
          only records where you were at the two instants you tapped the button. That pin exists so that if a clock-in looks late
          or a clock-out looks early, there's an objective record to check rather than a manager's word against yours. Some roles
          (typically field staff and drivers) are also required to take a quick selfie at clock-in, which is matched against your
          profile photo so shifts can't be clocked in on someone else's behalf.
        </p>
        <StepList
          steps={[
            'Open Attendance and tap Clock In at the start of your shift — grant location (and camera, if your role requires a selfie) when prompted.',
            'Your clock-in time, location pin, and (if applicable) selfie are saved immediately; the page now shows you as "Clocked In" with a running timer.',
            'At the end of your shift, come back and tap Clock Out — your location is captured again at that moment.',
            'Your day\'s record shows total hours worked and is added to your personal attendance history for the month.',
          ]}
        />
        <Callout tone="warn">
          Clocking in after your shift's start time does not block you — it simply marks that day's status as <strong>Late</strong>
          automatically. There's no way to backdate or edit a clock-in, and you can only clock in once per day, so if you forget
          to clock in on time, clock in as soon as you remember rather than waiting.
        </Callout>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Admins and managers see a month-view of the whole team with running counts of Present, Late, Absent, and On Leave days
          per person, and can export any month's attendance to CSV for payroll or reporting.
        </p>
      </ModuleCard>

      <ModuleCard title="Tasks" route="/tasks" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tasks is a full project-management workspace built into KDOps — think ClickUp or Asana, not a basic to-do list. Work is
          organized in a hierarchy: <strong>Spaces</strong> (a team or department) contain <strong>Folders</strong>, which contain
          <strong> Lists</strong>, which contain <strong>Tasks</strong>, which can have their own <strong>Subtasks</strong>. Every
          task carries a type — Task, Bug, Feature, or Milestone — plus an assignee, a due date, and a priority, and opens into a
          full detail view with a description, a subtask/checklist breakdown, a comment thread, and time-tracking against that
          specific task. You can view a list's work as a Kanban-style <strong>board</strong> (drag cards between status columns)
          or as a dense <strong>table/list</strong> view for scanning many tasks at once, and save either as a personal or shared
          view for later. Tasks can declare dependencies on each other — "blocks" and "blocked by" — so it's visible when one
          person's work is waiting on someone else's. Recurring tasks regenerate automatically on their schedule, custom fields
          let a team track list-specific data KDOps doesn't model out of the box, task templates let you stamp out the same
          checklist every time (e.g. a new-hire onboarding task), and some lists can expose a public submission form so people
          outside the workspace (or outside the company) can file a task without logging in.
        </p>
        <StepList
          steps={[
            'Open Tasks, navigate to the right Space → Folder → List, and click New Task.',
            'Give it a title, pick a task type (Task, Bug, Feature, or Milestone), and set an assignee, due date, and priority.',
            'Save it — it appears immediately on the board and in the table view for that list.',
            'Open the task to add a longer description, break it into subtasks or a checklist, attach files, or start tracking time against it.',
            'As work progresses, drag the card between status columns on the board (or change its status from the table), and comment to keep a record of decisions.',
          ]}
        />
        <Callout tone="tip">
          Typing <strong>@</strong> followed by someone's name in a task comment sends them a notification and links straight to
          that comment — it's the fastest way to pull a colleague into a task without leaving KDOps to message them separately.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Leave Requests" route="/leave" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Request time off by leave type — annual, sick, compassionate, and whatever other types your company has configured —
          and see your remaining balance for that type update live as you request and as requests get approved. Every request
          shows its current approval status (Pending, Approved, Rejected) so you're never guessing whether you're covered for a
          date, and a team leave calendar lets you check who else is already off before you request the same week.
        </p>
        <StepList
          steps={[
            'Open Leave and click Request Leave.',
            'Choose the leave type, start date, and end date — your remaining balance for that type is shown next to the form as you fill it in.',
            'Add a reason if your leave type requires one, then submit.',
            'Track the request\'s status on your Leave page; you\'ll be notified when it\'s approved or rejected.',
            'Once approved, the days are deducted from your balance and the leave appears on the shared team calendar.',
          ]}
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Leave policies themselves — how each leave type accrues, whether unused days carry over into the next year, and how
          many — are configured centrally by HR/Admin, not per employee. Once set, they're enforced automatically: you simply
          can't submit a request that would take you below zero remaining balance for that type.
        </p>
      </ModuleCard>

      <ModuleCard title="Timesheets" route="/timesheets" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Timesheets is where you log hours worked, typically on a weekly basis. If any of your work is billable to a client
          project, split your logged hours between billable and non-billable so client billing reflects only chargeable time.
          Your manager reviews and approves your timesheet before it feeds into payroll processing or client invoicing — an
          unapproved timesheet doesn't count toward either.
        </p>
      </ModuleCard>

      <ModuleCard title="Documents" route="/documents" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Documents is the shared file library for the whole company — organized into folders you can color-code for quick
          scanning, with drag-and-drop upload and a bulk-upload mode that shows a progress bar as multiple files go up at once.
          Switch between grid and list view depending on whether you want thumbnails or a dense scan. A document isn't limited
          to living in one folder in isolation — you can link it to an entity (a client, an employee, a vehicle, a project) so it
          also shows up directly on that entity's own profile page. Documents with an expiry date (licenses, certificates,
          contracts, insurance) get an amber warning starting 30 days before they lapse, so renewals don't get missed. Every
          document tracks when it was last accessed and how many times, files are organized across 17 document categories, and
          any file can be flagged as a reusable template.
        </p>
        <StepList
          steps={[
            'Open Documents and choose (or create) the folder the file belongs in.',
            'Drag files in, or click Upload and select one or several — a progress bar tracks a bulk upload.',
            'Set the document\'s category, and an expiry date if it has one.',
            'Optionally link it to a client, employee, vehicle, or project so it also appears on that entity\'s profile.',
            'Switch to grid or list view depending on whether you\'re browsing visually or scanning a long folder.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Communications & Messages" route="/communications · /messages" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          These are two different tools that sound similar. <strong>Messages</strong> is for day-to-day conversation — 1:1 direct
          messages and group chats, available to everyone, the same way you'd message a colleague on any chat app. <strong>
          Communications</strong> is a broadcast tool for reaching the whole team or a specific department at once, over email,
          SMS, or WhatsApp (sent via Termii) — because a broadcast to everyone is a much bigger action than a private message,
          Communications is restricted to Finance, Admin, and Super Admin only. If you need to reach one colleague or a small
          group, use Messages; if you're not in one of those three roles, you won't see the option to send a company-wide
          broadcast, and that's by design.
        </p>
      </ModuleCard>

      <ModuleCard title="The AI Assistant" route="/assistant" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Assistant is a chatbot trained on the company's own Knowledge Base articles and, where relevant, live data from
          your own KDOps account — things like your current leave balance or your approval limits — rather than a generic
          scripted FAQ bot. Because it reads real platform data, its answers are specific to you and to the moment you ask, not a
          static help page. You could ask it things like:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>"How many annual leave days do I have left?"</li>
          <li>"What's the process for submitting a compassionate leave request?"</li>
          <li>"What's my approval limit for expenses?"</li>
        </ul>
      </ModuleCard>

      <ModuleCard title="Knowledge Base" route="/knowledge" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Knowledge Base is the company's internal, searchable wiki — SOPs, how-tos, and policy explainers written and
          maintained by the team itself, not a vendor manual. It's worth searching before asking a colleague a process question,
          and it's also the source material the AI Assistant draws its answers from, so keeping an article accurate here makes
          the Assistant's answers accurate too.
        </p>
      </ModuleCard>
    </div>
  );
}
