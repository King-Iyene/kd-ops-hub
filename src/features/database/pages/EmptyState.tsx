import { useState } from 'react';
import { Database, Plus, Table2, Users, Kanban, BarChart3, FileSpreadsheet, CheckSquare, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateBaseDialog, type TemplateConfig } from '../components/CreateBaseDialog';
import { ImportAirtableDialog } from '../components/ImportAirtableDialog';
import { useDatabaseUI } from '../lib/store';

const TEMPLATES: Array<{
  icon: any;
  name: string;
  desc: string;
  color: string;
  config: TemplateConfig;
}> = [
  {
    icon: Kanban,
    name: 'Project Tracker',
    desc: 'Track tasks, assignees, and deadlines',
    color: '#3366FF',
    config: {
      baseName: 'Project Tracker',
      baseIcon: '🎯',
      baseColor: '#3366FF',
      tables: [
        { name: 'Tasks', icon: '📋' },
        { name: 'Milestones', icon: '🏁' },
        { name: 'Team Members', icon: '👥' },
      ],
    },
  },
  {
    icon: Users,
    name: 'CRM',
    desc: 'Manage contacts, deals, and pipeline',
    color: '#0D9488',
    config: {
      baseName: 'CRM',
      baseIcon: '👥',
      baseColor: '#0D9488',
      tables: [
        { name: 'Contacts', icon: '📇' },
        { name: 'Companies', icon: '🏢' },
        { name: 'Deals', icon: '💰' },
        { name: 'Activities', icon: '📞' },
      ],
    },
  },
  {
    icon: BarChart3,
    name: 'Sales Pipeline',
    desc: 'Track leads through your sales funnel',
    color: '#8B5CF6',
    config: {
      baseName: 'Sales Pipeline',
      baseIcon: '📈',
      baseColor: '#8B5CF6',
      tables: [
        { name: 'Leads', icon: '🎣' },
        { name: 'Opportunities', icon: '💎' },
        { name: 'Accounts', icon: '🏦' },
      ],
    },
  },
  {
    icon: FileSpreadsheet,
    name: 'Content Calendar',
    desc: 'Plan and schedule content across channels',
    color: '#F59E0B',
    config: {
      baseName: 'Content Calendar',
      baseIcon: '📅',
      baseColor: '#F59E0B',
      tables: [
        { name: 'Content', icon: '📝' },
        { name: 'Channels', icon: '📡' },
        { name: 'Campaigns', icon: '🚀' },
      ],
    },
  },
  {
    icon: CheckSquare,
    name: 'Bug Tracker',
    desc: 'Log, prioritize, and resolve issues',
    color: '#EF4444',
    config: {
      baseName: 'Bug Tracker',
      baseIcon: '🐛',
      baseColor: '#EF4444',
      tables: [
        { name: 'Bugs', icon: '🐛' },
        { name: 'Releases', icon: '🏷️' },
        { name: 'Components', icon: '🧩' },
      ],
    },
  },
  {
    icon: Database,
    name: 'Inventory',
    desc: 'Manage products, stock, and suppliers',
    color: '#10B981',
    config: {
      baseName: 'Inventory',
      baseIcon: '📦',
      baseColor: '#10B981',
      tables: [
        { name: 'Products', icon: '📦' },
        { name: 'Suppliers', icon: '🏭' },
        { name: 'Orders', icon: '🛒' },
      ],
    },
  },
];

export function EmptyState() {
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<TemplateConfig | null>(null);
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);

  if (activeBaseId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-[hsl(200,30%,8%)]">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-14 h-14 rounded-xl bg-[#F0F3FF] dark:bg-[hsl(220,30%,14%)] flex items-center justify-center">
            <Table2 size={28} className="text-[#3366FF]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
              No tables yet
            </p>
            <p className="text-[13px] text-[#6A7184] mt-1 leading-relaxed">
              Click the <strong>+</strong> button in the table bar above to create your first table.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-[#F9F9FA] dark:bg-[hsl(200,30%,8%)] p-8">
      <div className="text-center space-y-6 max-w-2xl">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#3366FF]/10 flex items-center justify-center">
          <Database size={32} className="text-[#3366FF]" />
        </div>
        <div>
          <p className="text-lg font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
            Welcome to KDOps Data
          </p>
          <p className="text-[13px] text-[#6A7184] mt-1.5 leading-relaxed">
            Build powerful databases, spreadsheets, and workflows. Select a base from the sidebar or start fresh.
          </p>
        </div>
        <div className="flex items-center gap-3 justify-center">
          <Button
            className="bg-[#3366FF] hover:bg-[#2952CC] text-white gap-1.5"
            onClick={() => {
              setActiveTemplate(null);
              setCreateOpen(true);
            }}
          >
            <Plus size={16} /> Create Base
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => setImportOpen(true)}
          >
            <Download size={16} /> Import from Airtable
          </Button>
        </div>

        <div className="pt-4">
          <p className="text-[12px] font-medium text-[#9AA2AF] uppercase tracking-wider mb-3">
            Start with a template
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                className="flex items-start gap-3 p-3 rounded-lg border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] hover:border-[#3366FF] hover:shadow-sm transition-all text-left group"
                onClick={() => {
                  setActiveTemplate(t.config);
                  setCreateOpen(true);
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: t.color + '15' }}
                >
                  <t.icon size={16} style={{ color: t.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] group-hover:text-[#3366FF]">
                    {t.name}
                  </p>
                  <p className="text-[11px] text-[#9AA2AF] mt-0.5 leading-relaxed">
                    {t.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <CreateBaseDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setActiveTemplate(null);
        }}
        template={activeTemplate}
      />
      <ImportAirtableDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
