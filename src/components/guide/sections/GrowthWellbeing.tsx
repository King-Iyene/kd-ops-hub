// Growth & Wellbeing — the modules that support career growth and company
// culture: goals, performance reviews, training, the handbook, benefits,
// surveys, and referrals. Knowledge Base is documented in its own section.
import { GraduationCap } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function GrowthWellbeingSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={GraduationCap}
        title="Growth & Wellbeing"
        blurb="These are the modules that look after you rather than the money or the fleet — setting goals, getting reviewed fairly, building skills, knowing the rules, keeping your benefits current, having a voice, and getting rewarded for bringing in good people. Most of them are open to everyone; a few are run by managers on your behalf."
      />

      <ModuleCard title="Goals" route="/goals" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Goals is where quarterly objectives live, for yourself or, if you manage people, for your team. Every goal carries a
          visible progress bar so it's obvious at a glance whether it's on track, and the point of the module is to connect the
          tasks you're doing day to day with the bigger thing they're supposed to add up to — a goal that never moves is a signal
          worth raising with your manager, not something to quietly let sit.
        </p>
        <StepList
          steps={[
            'Create a goal and give it a clear, measurable description — "reduce fuel cost per trip by 10%", not "do better on fuel".',
            'Set its scope (individual or team) and the quarter it belongs to.',
            'Update progress as you go so the bar reflects reality, not what it looked like the day you created it.',
            'Mark it complete once it\'s done — completed goals stay visible as a record of what you delivered.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Performance Reviews" route="/performance" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Performance runs structured review cycles — annual, mid-year, quarterly, or probation — and each cycle contains
          individual reviews of one of three kinds: manager review, self-assessment, or peer review. Every review scores the
          same five competencies — Delivery, Communication, Teamwork, Initiative, and Leadership — on a 1–5 scale, and the
          overall rating is simply the average of those five. A review moves through <strong>draft → submitted → acknowledged</strong>,
          and the cycle's progress bar tracks how many of its reviews are submitted so a manager or admin can see at a glance
          who's falling behind; a cycle that misses its deadline is flagged red as overdue. The Field Team doesn't have
          their own page in this module, but they are still reviewed by their manager through it — the review just doesn't
          require them to browse Performance directly.
        </p>
        <StepList
          steps={[
            'When a review opens for you, you\'ll see it flagged on your dashboard even if you can\'t browse the Performance module yourself.',
            'If a self-assessment is part of the review, complete it honestly — rate yourself on the five competencies before your manager sees their own scores.',
            'Wait for your manager to submit their rating; the overall score is the average across the five competencies, not a single number they pick.',
            'Once the review is finalized, acknowledge it — acknowledging records that you\'ve seen and understood the result, not that you agree with every point.',
          ]}
        />
        <Callout tone="tip">
          You'll never need to hunt for an open review — it shows up as a notification on your dashboard the moment your manager
          starts it, whether or not your role has direct access to the Performance page.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Training & Certifications" route="/training" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Training keeps a record of every course and certification completed per employee. Certifications with an expiry
          date — a driver's license class, a safety certificate, a professional qualification — are tracked automatically:
          once the expiry date passes, the record flags <strong>Expired</strong> on its own, and an amber badge appears 30 days out
          to warn that a renewal is coming, so nobody has to keep a spreadsheet of expiry dates on the side. Mandatory
          training (safety and compliance courses the company requires) is flagged separately from optional, elective
          training, so it's clear what's non-negotiable.
        </p>
        <StepList
          steps={[
            'Filter the training list by employee, training type, category, or status to find what you need quickly.',
            'Check the amber "expiring soon" badges regularly — they give you a 30-day window to book a renewal before something lapses.',
            'Export the filtered list to CSV when you need it outside the app — for an audit, a client request, or a compliance check.',
            'Use the cost figures recorded against each course for budget analysis when planning next quarter\'s training spend.',
          ]}
        />
        <Callout tone="warn">
          An expired mandatory certification isn't just a red badge — depending on the role, it can mean someone shouldn't be on
          the road or on site until it's renewed. Don't let the amber badge sit for 30 days before acting on it.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Employee Handbook" route="/handbook" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Handbook is the official policy document — code of conduct, leave policy, disciplinary process, and everything
          else that governs how KDOps runs as a workplace. Some policies require a formal, timestamped acknowledgment rather
          than just being available to read; when one of those is pending for you, a prompt appears on your dashboard until
          you act on it. That prompt isn't a suggestion — a policy flagged for acknowledgment is one leadership needs on
          record that you've actually read, not something to dismiss as optional reading.
        </p>
        <StepList
          steps={[
            'Open the Handbook and read the section relevant to your question — leave, conduct, discipline, whatever it is.',
            'If your dashboard shows a pending acknowledgment, open it, read the policy in full, and acknowledge it.',
            'Come back to the Handbook whenever a policy question comes up — it\'s the source of truth, not what a colleague remembers hearing once.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Benefits" route="/benefits" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Benefits records what each employee is enrolled in — HMO / health insurance, Pension (with the PFA name and the
          employee's RSA PIN), Group Life cover, and any other voluntary benefit the company offers. Each enrollment stores
          the provider, the policy number, the premium amount and how often it's billed (monthly, quarterly, or annually),
          and the enrollment and expiry dates. Whatever frequency a premium is billed at, the module works out its monthly
          equivalent automatically, so cost comparisons across employees and benefit types are apples-to-apples without
          anyone doing the division by hand. An enrollment nearing its expiry date is flagged 30 days out so renewals don't
          get missed.
        </p>
        <StepList
          steps={[
            'Look up an employee\'s enrolled benefits, provider, and policy details when a question comes up about coverage.',
            'Record premium amount and billing frequency accurately — the monthly-equivalent cost depends on getting the frequency right.',
            'Watch the 30-day expiry alerts and get renewals moving before a policy lapses.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Surveys" route="/surveys" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Surveys is how the company runs pulse checks and feedback rounds. Some surveys are marked <strong>anonymous</strong> —
          when a survey carries that flag, your individual responses are not linked back to you anywhere in the system, not
          even for an admin looking at the raw results. That's a real technical guarantee, not just a promise, so it's worth
          answering anonymous surveys honestly rather than guessing at what's safe to say.
        </p>
        <StepList
          steps={[
            "Open a survey when it's assigned to you and answer each question — check whether it's marked anonymous before you start.",
            'Submit your responses; anonymous ones are stripped of any link to your identity at that point.',
            'Use non-anonymous surveys the same way, understanding your name is attached to those responses.',
          ]}
        />
        <Callout tone="tip">
          Anonymous really means anonymous — nobody, including admins, can trace a response on an anonymous survey back to the
          person who gave it. Honest answers there are far more useful to the company than polite ones.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Referrals" route="/referrals" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Referrals lets you put forward someone you know for an open role, and then follow that referral as it moves through
          the actual hiring pipeline stages instead of wondering whether it went anywhere. If the role carries a referral
          bonus, it's tied to the referral record and pays out on a successful hire.
        </p>
        <StepList
          steps={[
            'Pick an open role and submit your referral with the candidate\'s details.',
            'Track the referral as it advances through the hiring pipeline stages.',
            'If the hire goes through and the role carries a referral bonus, it\'s recorded against your referral automatically.',
          ]}
        />
      </ModuleCard>
    </div>
  );
}
