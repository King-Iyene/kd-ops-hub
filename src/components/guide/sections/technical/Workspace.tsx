import { RefTable, RefSection } from '@/components/guide/shared';
import { FolderKanban, Users, CheckCircle2, BookOpen } from 'lucide-react';

export function TechWorkspaceSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Workspace / Tasks Technical Reference</h2>
      <RefSection icon={FolderKanban} title="Project Tracker">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Status workflow',         b: 'planning → active → on_hold → completed | cancelled' },
            { a: 'Priority levels',         b: 'critical · high · normal · low' },
            { a: 'Date constraint',         b: 'CHECK: end_date must be ≥ start_date when both set' },
            { a: 'Client linking',          b: 'Optional client_id FK to Clients CRM (sets to NULL on client delete)' },
            { a: 'Owner / department',      b: 'Each project has one owner (auth user) and an optional department' },
            { a: 'Milestones',              b: 'Inline list — pending or complete; Enter key adds; sort_order controls display' },
            { a: 'Linked tasks',            b: 'Tasks gain a project_id FK (added by Phase 5 migration); count shown per project' },
            { a: 'Overdue detection',       b: 'Active project past end_date displays an Overdue badge' },
            { a: 'Budget',                  b: 'budget_ngn is a planning figure; actual spend computed from linked expenses (not stored)' },
            { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
          ]}
        />
      </RefSection>

      <RefSection icon={Users} title="Tasks">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Status values',           b: 'open · in_progress · blocked · done' },
            { a: 'Priority levels',         b: 'critical · high · normal · low' },
            { a: 'Project linkage',         b: 'project_id FK added in Phase 5 — tasks can belong to a project (or stay standalone)' },
            { a: 'Assignment',              b: 'One assignee per task; comments thread for collaboration' },
            { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
          ]}
        />
      </RefSection>

      <RefSection icon={CheckCircle2} title="Goals (OKR)">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Goal types',              b: 'company · department · team · individual' },
            { a: 'Status values',           b: 'on_track · at_risk · off_track · completed' },
            { a: 'Progress',                b: '0–100% — entered manually by goal owner' },
            { a: 'Visibility',              b: 'Each user sees their own goals + their department goals + company goals' },
          ]}
        />
      </RefSection>

      <RefSection icon={BookOpen} title="Knowledge Base">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Article statuses',        b: 'draft (only author) · published (all authenticated)' },
            { a: 'Versioning',              b: 'knowledge_article_versions stores every save — full edit history retained' },
            { a: 'Search',                  b: 'In-app filtering by title, body, category, tag' },
          ]}
        />
      </RefSection>
    </>
  );
}
