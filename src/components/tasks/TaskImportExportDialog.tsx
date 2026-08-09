import { useRef, useState } from 'react';
import { Download, Upload, FileUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Task, ProfileRow, Priority, TaskStatus } from '@/lib/task-types';

interface TaskImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  onUpdate: () => void;
  currentListId?: string | null;
  currentProjectId?: string | null;
}

/* ------------------------------------------------------------------ */
/*  CSV helpers (no external library)                                  */
/* ------------------------------------------------------------------ */

const VALID_STATUSES: TaskStatus[] = ['open', 'in_progress', 'blocked', 'complete'];
const VALID_PRIORITIES: Priority[] = ['critical', 'high', 'normal', 'low'];

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function buildCSVRow(fields: string[]): string {
  return fields.map(escapeCSVField).join(',');
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++; // skip doubled quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current);
        current = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(current);
        current = '';
        if (ch === '\r') i++; // skip \n after \r
        rows.push(row);
        row = [];
      } else if (ch === '\r') {
        row.push(current);
        current = '';
        rows.push(row);
        row = [];
      } else {
        current += ch;
      }
    }
  }
  // last field / row
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Canonical import columns                                           */
/* ------------------------------------------------------------------ */

const IMPORT_COLUMNS = [
  'title',
  'description',
  'status',
  'priority',
  'due_date',
  'start_date',
  'assignee',
  'tags',
  'task_type',
  'time_estimate',
] as const;

type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const COLUMN_LABELS: Record<ImportColumn, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  due_date: 'Due Date',
  start_date: 'Start Date',
  assignee: 'Assignee',
  tags: 'Tags',
  task_type: 'Task Type',
  time_estimate: 'Time Estimate',
};

/** Try to auto-map a header to an import column. */
function autoDetect(header: string): ImportColumn | null {
  const h = header.trim().toLowerCase().replace(/[\s_-]+/g, '_');
  const map: Record<string, ImportColumn> = {
    title: 'title',
    name: 'title',
    task: 'title',
    task_name: 'title',
    description: 'description',
    desc: 'description',
    status: 'status',
    state: 'status',
    priority: 'priority',
    due_date: 'due_date',
    due: 'due_date',
    deadline: 'due_date',
    start_date: 'start_date',
    start: 'start_date',
    assignee: 'assignee',
    assigned_to: 'assignee',
    owner: 'assignee',
    tags: 'tags',
    labels: 'tags',
    task_type: 'task_type',
    type: 'task_type',
    time_estimate: 'time_estimate',
    estimate: 'time_estimate',
    time_estimate_minutes: 'time_estimate',
  };
  return map[h] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TaskImportExportDialog({
  open,
  onOpenChange,
  tasks,
  profiles,
  onUpdate,
  currentListId,
  currentProjectId,
}: TaskImportExportDialogProps) {
  const profile = useAuthStore((s) => s.profile);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ----- Import state ----- */
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<(ImportColumn | null)[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ succeeded: number; failed: number } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  /* ----- Export state ----- */
  const [exporting, setExporting] = useState(false);

  /* ================================================================ */
  /*  EXPORT                                                           */
  /* ================================================================ */

  const handleExport = () => {
    setExporting(true);
    try {
      const headers = [
        'Title', 'Description', 'Status', 'Priority', 'Assignee',
        'Due Date', 'Start Date', 'Tags', 'Task Type',
        'Time Estimate (minutes)', 'Created At',
      ];

      const rows = tasks.map((t) => {
        const assigneeName = t.assignee_id ? (profiles.get(t.assignee_id)?.full_name ?? '') : '';
        return [
          t.title,
          t.description ?? '',
          t.status,
          t.priority,
          assigneeName,
          t.due_date ?? '',
          t.start_date ?? '',
          (t.tags ?? []).join(', '),
          t.task_type,
          t.time_estimate_minutes != null ? String(t.time_estimate_minutes) : '',
          t.created_at,
        ];
      });

      const csv = [buildCSVRow(headers), ...rows.map(buildCSVRow)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Export complete', description: `${tasks.length} task(s) exported.` });
      logAudit('report_exported', `Exported ${tasks.length} tasks to CSV`, profile);
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  /* ================================================================ */
  /*  IMPORT - file parse                                              */
  /* ================================================================ */

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text).filter((r) => r.some((c) => c.trim().length > 0));
      if (rows.length < 2) {
        toast({ title: 'Invalid CSV', description: 'File must have a header row and at least one data row.', variant: 'destructive' });
        return;
      }
      const headers = rows[0];
      const dataRows = rows.slice(1);
      setParsedHeaders(headers);
      setParsedRows(dataRows);

      // Auto-detect column mapping
      const map: (ImportColumn | null)[] = headers.map((h) => autoDetect(h));
      // Deduplicate: first occurrence wins
      const seen = new Set<ImportColumn>();
      for (let i = 0; i < map.length; i++) {
        if (map[i] && seen.has(map[i]!)) {
          map[i] = null;
        } else if (map[i]) {
          seen.add(map[i]!);
        }
      }
      setColumnMap(map);
    };
    reader.readAsText(file);
  };

  const updateColumnMap = (index: number, value: string) => {
    setColumnMap((prev) => {
      const next = [...prev];
      next[index] = value === '__skip__' ? null : (value as ImportColumn);
      return next;
    });
  };

  const resetImport = () => {
    setParsedHeaders([]);
    setParsedRows([]);
    setColumnMap([]);
    setImportResult(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ================================================================ */
  /*  IMPORT - execute                                                 */
  /* ================================================================ */

  const handleImport = async () => {
    if (!parsedRows.length) return;
    setImporting(true);
    setImportResult(null);

    // Build a name-to-id lookup (case-insensitive)
    const nameLookup = new Map<string, string>();
    profiles.forEach((p) => {
      nameLookup.set(p.full_name.toLowerCase(), p.id);
    });

    let succeeded = 0;
    let failed = 0;

    // Determine the max sort_order for positioning new tasks
    const maxSort = tasks.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const record: Record<string, string> = {};
      columnMap.forEach((col, idx) => {
        if (col && idx < row.length) {
          record[col] = row[idx].trim();
        }
      });

      // Title is required
      if (!record.title) {
        failed++;
        continue;
      }

      // Validate & normalise status
      let status: TaskStatus = 'open';
      if (record.status) {
        const s = record.status.toLowerCase().replace(/[\s-]+/g, '_') as TaskStatus;
        if (VALID_STATUSES.includes(s)) status = s;
      }

      // Validate & normalise priority
      let priority: Priority = 'normal';
      if (record.priority) {
        const p = record.priority.toLowerCase() as Priority;
        if (VALID_PRIORITIES.includes(p)) priority = p;
      }

      // Assignee lookup
      let assigneeId: string | null = null;
      if (record.assignee) {
        assigneeId = nameLookup.get(record.assignee.toLowerCase()) ?? null;
      }

      // Tags
      let tags: string[] | null = null;
      if (record.tags) {
        tags = record.tags.split(',').map((t) => t.trim()).filter(Boolean);
        if (tags.length === 0) tags = null;
      }

      // Task type
      let taskType: string = 'task';
      if (record.task_type) {
        const tt = record.task_type.toLowerCase();
        if (['task', 'milestone', 'bug', 'feature'].includes(tt)) taskType = tt;
      }

      // Time estimate
      let timeEstimate: number | null = null;
      if (record.time_estimate) {
        const n = parseInt(record.time_estimate, 10);
        if (!isNaN(n) && n > 0) timeEstimate = n;
      }

      const insertData: Record<string, unknown> = {
        title: record.title,
        description: record.description || null,
        status,
        priority,
        assignee_id: assigneeId,
        due_date: record.due_date || null,
        start_date: record.start_date || null,
        tags,
        task_type: taskType,
        time_estimate_minutes: timeEstimate,
        created_by: profile?.id ?? null,
        sort_order: maxSort + i + 1,
        list_id: currentListId ?? null,
        project_id: currentProjectId ?? null,
      };

      const { error } = await supabase.from('tasks').insert(insertData);
      if (error) {
        failed++;
      } else {
        succeeded++;
      }
    }

    setImportResult({ succeeded, failed });
    setImporting(false);

    if (succeeded > 0) {
      toast({ title: 'Import complete', description: `${succeeded} task(s) imported.` });
      logAudit('task_created', `Imported ${succeeded} tasks from CSV`, profile);
      onUpdate();
    }
    if (failed > 0 && succeeded === 0) {
      toast({ title: 'Import failed', description: `All ${failed} row(s) failed to import.`, variant: 'destructive' });
    }
  };

  /* ================================================================ */
  /*  Column assignments already used (for disabling in dropdown)      */
  /* ================================================================ */

  const usedColumns = new Set(columnMap.filter(Boolean));

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  const previewRows = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4" /> Import / Export Tasks
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="export" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="export" className="flex-1 gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1 gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Import
            </TabsTrigger>
          </TabsList>

          {/* ===================== EXPORT TAB ===================== */}
          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="border rounded-md p-4 bg-muted/30 space-y-3">
              <p className="text-sm text-muted-foreground">
                Export {tasks.length} visible task(s) to a CSV file. The file will include title,
                description, status, priority, assignee name, dates, tags, type, time estimate,
                and created date.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleExport} disabled={exporting || tasks.length === 0} className="gap-1.5">
                <Download className="h-4 w-4" />
                {exporting ? 'Exporting...' : `Export CSV (${tasks.length} tasks)`}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ===================== IMPORT TAB ===================== */}
          <TabsContent value="import" className="space-y-4 mt-4">
            {/* File upload */}
            <div className="border rounded-md p-4 bg-muted/30 space-y-3">
              <label className="text-sm font-medium">Upload CSV file</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
              />
              {fileName && (
                <p className="text-xs text-muted-foreground">
                  Selected: {fileName} ({parsedRows.length} data row(s))
                </p>
              )}
            </div>

            {/* Column mapping */}
            {parsedHeaders.length > 0 && (
              <div className="border rounded-md p-4 space-y-3">
                <label className="text-sm font-medium">Column mapping</label>
                <div className="space-y-2">
                  {parsedHeaders.map((header, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-32 truncate shrink-0" title={header}>
                        {header}
                      </span>
                      <Select
                        value={columnMap[idx] ?? '__skip__'}
                        onValueChange={(v) => updateColumnMap(idx, v)}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">-- Skip --</SelectItem>
                          {IMPORT_COLUMNS.map((col) => (
                            <SelectItem
                              key={col}
                              value={col}
                              disabled={usedColumns.has(col) && columnMap[idx] !== col}
                            >
                              {COLUMN_LABELS[col]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div className="border rounded-md p-4 space-y-2">
                <label className="text-sm font-medium">
                  Preview (first {previewRows.length} row{previewRows.length !== 1 ? 's' : ''})
                </label>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        {parsedHeaders.map((h, i) => (
                          <th
                            key={i}
                            className={cn(
                              'border px-2 py-1 text-left font-medium bg-muted/50',
                              columnMap[i] ? 'text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {columnMap[i] ? COLUMN_LABELS[columnMap[i]!] : h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {parsedHeaders.map((_, ci) => (
                            <td key={ci} className="border px-2 py-1 text-muted-foreground max-w-[200px] truncate">
                              {row[ci] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                importResult.failed > 0 && importResult.succeeded === 0
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-success/10 text-success',
              )}>
                {importResult.failed > 0 && importResult.succeeded === 0 ? (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {importResult.succeeded} succeeded, {importResult.failed} failed
                </span>
              </div>
            )}

            <DialogFooter>
              {parsedHeaders.length > 0 && (
                <Button variant="outline" size="sm" onClick={resetImport}>
                  Clear
                </Button>
              )}
              <Button
                onClick={handleImport}
                disabled={importing || parsedRows.length === 0 || !columnMap.includes('title')}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                {importing ? 'Importing...' : `Import ${parsedRows.length} row(s)`}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
