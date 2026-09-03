import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Database,
  Table2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Download,
  Key,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useDatabaseUI } from '../lib/store';

interface ImportAirtableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: any;
}

interface AirtableTable {
  id: string;
  name: string;
  fields: AirtableField[];
  selected: boolean;
}

type Step = 'token' | 'select' | 'importing' | 'done';

function mapAirtableType(atType: string): { uiType: string; pgType: string } {
  const map: Record<string, { uiType: string; pgType: string }> = {
    singleLineText: { uiType: 'SingleLineText', pgType: 'TEXT' },
    multilineText: { uiType: 'LongText', pgType: 'TEXT' },
    richText: { uiType: 'LongText', pgType: 'TEXT' },
    email: { uiType: 'Email', pgType: 'TEXT' },
    url: { uiType: 'URL', pgType: 'TEXT' },
    phoneNumber: { uiType: 'PhoneNumber', pgType: 'TEXT' },
    number: { uiType: 'Number', pgType: 'NUMERIC' },
    currency: { uiType: 'Currency', pgType: 'NUMERIC' },
    percent: { uiType: 'Percent', pgType: 'NUMERIC' },
    duration: { uiType: 'Duration', pgType: 'INTEGER' },
    rating: { uiType: 'Rating', pgType: 'SMALLINT' },
    checkbox: { uiType: 'Checkbox', pgType: "BOOLEAN DEFAULT false" },
    singleSelect: { uiType: 'SingleSelect', pgType: 'TEXT' },
    multiSelect: { uiType: 'MultiSelect', pgType: 'TEXT[]' },
    date: { uiType: 'Date', pgType: 'DATE' },
    dateTime: { uiType: 'DateTime', pgType: 'TIMESTAMPTZ' },
    createdTime: { uiType: 'CreatedTime', pgType: 'TIMESTAMPTZ' },
    lastModifiedTime: { uiType: 'LastModifiedTime', pgType: 'TIMESTAMPTZ' },
    autoNumber: { uiType: 'AutoNumber', pgType: 'INTEGER' },
    barcode: { uiType: 'SingleLineText', pgType: 'TEXT' },
    multipleAttachments: { uiType: 'Attachment', pgType: 'JSONB' },
    multipleRecordLinks: { uiType: 'Links', pgType: 'JSONB' },
    formula: { uiType: 'Formula', pgType: 'TEXT' },
    rollup: { uiType: 'Rollup', pgType: 'TEXT' },
    lookup: { uiType: 'Lookup', pgType: 'JSONB' },
    count: { uiType: 'Number', pgType: 'INTEGER' },
    createdBy: { uiType: 'CreatedBy', pgType: 'JSONB' },
    lastModifiedBy: { uiType: 'LastModifiedBy', pgType: 'JSONB' },
    button: { uiType: 'SingleLineText', pgType: 'TEXT' },
    externalSyncSource: { uiType: 'SingleLineText', pgType: 'TEXT' },
    ai: { uiType: 'LongText', pgType: 'TEXT' },
    aiText: { uiType: 'LongText', pgType: 'TEXT' },
  };
  return map[atType] ?? { uiType: 'SingleLineText', pgType: 'TEXT' };
}

function toSnakeCase(name: string): string {
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (/^[0-9]/.test(result)) {
    result = 'f_' + result;
  }
  return result.substring(0, 63);
}

const SYSTEM_FIELDS = [
  { name: 'ID', pg_column_name: 'id', ui_type: 'ID', pg_type: 'UUID', is_primary: true, position: 0 },
  { name: 'Created At', pg_column_name: 'created_at', ui_type: 'CreatedTime', pg_type: 'TIMESTAMPTZ', is_primary: false, position: 1 },
  { name: 'Updated At', pg_column_name: 'updated_at', ui_type: 'LastModifiedTime', pg_type: 'TIMESTAMPTZ', is_primary: false, position: 2 },
  { name: 'Created By', pg_column_name: 'created_by', ui_type: 'CreatedBy', pg_type: 'UUID', is_primary: false, position: 3 },
  { name: 'Order', pg_column_name: 'nc_order', ui_type: 'Number', pg_type: 'NUMERIC', is_primary: false, position: 4 },
];

const SYSTEM_UI_TYPES = new Set(['ID', 'CreatedTime', 'LastModifiedTime', 'CreatedBy']);

export function ImportAirtableDialog({ open, onOpenChange }: ImportAirtableDialogProps) {
  const [step, setStep] = useState<Step>('token');
  const [token, setToken] = useState('');
  const [bases, setBases] = useState<AirtableBase[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [tables, setTables] = useState<AirtableTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, tableName: '' });
  const [importedCount, setImportedCount] = useState(0);
  const qc = useQueryClient();
  const { setActiveBase } = useDatabaseUI();

  const reset = () => {
    setStep('token');
    setToken('');
    setBases([]);
    setSelectedBaseId(null);
    setTables([]);
    setLoading(false);
    setError('');
    setProgress({ current: 0, total: 0, tableName: '' });
    setImportedCount(0);
  };

  const fetchBases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('https://api.airtable.com/v0/meta/bases', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid API token. Please check and try again.');
        throw new Error(`Airtable API error: ${res.status}`);
      }
      const data = await res.json();
      setBases(data.bases || []);
      setStep('select');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect to Airtable');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchTables = useCallback(async (baseId: string) => {
    setLoading(true);
    setError('');
    setSelectedBaseId(baseId);
    try {
      const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch tables: ${res.status}`);
      const data = await res.json();
      setTables(
        (data.tables || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          fields: t.fields || [],
          selected: true,
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch tables');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const toggleTable = (tableId: string) => {
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, selected: !t.selected } : t))
    );
  };

  const fetchAllRecords = async (baseId: string, tableId: string): Promise<any[]> => {
    const records: any[] = [];
    let offset: string | undefined;
    do {
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch records: ${res.status}`);
      const data = await res.json();
      records.push(...(data.records || []));
      offset = data.offset;
    } while (offset);
    return records;
  };

  const startImport = useCallback(async () => {
    const selectedTables = tables.filter((t) => t.selected);
    if (selectedTables.length === 0) {
      setError('Please select at least one table');
      return;
    }

    setStep('importing');
    setError('');
    setProgress({ current: 0, total: selectedTables.length, tableName: '' });

    try {
      const baseName = bases.find((b) => b.id === selectedBaseId)?.name ?? 'Imported Base';
      const schemaName = `nc_${toSnakeCase(baseName)}_${Date.now()}`;

      // Ensure workspace exists
      const { data: workspaces } = await supabase
        .schema('nc_meta')
        .from('workspaces')
        .select('id')
        .limit(1);
      let workspaceId = workspaces?.[0]?.id;
      if (!workspaceId) {
        const { data: ws } = await supabase
          .schema('nc_meta')
          .from('workspaces')
          .insert({ name: 'Default Workspace' })
          .select()
          .single();
        workspaceId = ws?.id;
      }

      // Create base
      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .insert({
          workspace_id: workspaceId,
          name: baseName,
          schema_name: schemaName,
          icon: '📦',
          color: '#3366FF',
        })
        .select()
        .single();
      if (baseError) throw baseError;

      // Create schema
      await supabase.functions.invoke('ddl-executor', {
        body: { action: 'createSchema', schemaName },
      });

      // Import each table
      for (let i = 0; i < selectedTables.length; i++) {
        const atTable = selectedTables[i];
        setProgress({ current: i + 1, total: selectedTables.length, tableName: atTable.name });

        const pgTableName = toSnakeCase(atTable.name);

        // Create table metadata
        const { data: table, error: tableError } = await supabase
          .schema('nc_meta')
          .from('tables')
          .insert({
            base_id: base.id,
            name: atTable.name,
            pg_table_name: pgTableName,
            icon: null,
            position: i,
          })
          .select()
          .single();
        if (tableError) throw tableError;

        // Create PG table
        await supabase.functions.invoke('ddl-executor', {
          body: { action: 'createTable', schemaName, tableName: pgTableName },
        });

        // Insert system fields
        const sysRows = SYSTEM_FIELDS.map((f) => ({
          table_id: table.id,
          name: f.name,
          pg_column_name: f.pg_column_name,
          ui_type: f.ui_type,
          pg_type: f.pg_type,
          options: {},
          position: f.position,
          width: 150,
          is_primary: f.is_primary,
          is_required: f.pg_column_name === 'id',
          is_unique: f.pg_column_name === 'id',
          is_system: true,
          is_hidden: f.pg_column_name === 'nc_order',
        }));

        const { data: sysFields, error: sysError } = await supabase
          .schema('nc_meta')
          .from('fields')
          .insert(sysRows)
          .select();
        if (sysError) throw sysError;

        const primaryField = sysFields?.find((f: any) => f.is_primary);
        if (primaryField) {
          await supabase
            .schema('nc_meta')
            .from('tables')
            .update({ primary_field_id: primaryField.id })
            .eq('id', table.id);
        }

        // Map and create user fields from Airtable schema
        const userFields = atTable.fields.filter(
          (f) => !SYSTEM_UI_TYPES.has(mapAirtableType(f.type).uiType)
        );

        // Track used column names to avoid duplicates
        const usedColNames = new Set(SYSTEM_FIELDS.map((f) => f.pg_column_name));

        const fieldRows = userFields.map((f, idx) => {
          const mapped = mapAirtableType(f.type);
          const options: any = {};

          if (f.type === 'singleSelect' && f.options?.choices) {
            options.choices = f.options.choices.map((c: any) => ({
              title: c.name,
              color: c.color ?? 'gray',
            }));
          }
          if (f.type === 'multiSelect' && f.options?.choices) {
            options.choices = f.options.choices.map((c: any) => ({
              title: c.name,
              color: c.color ?? 'gray',
            }));
          }
          if (f.type === 'currency') {
            options.currencyCode = f.options?.symbol ?? 'USD';
          }
          if (f.type === 'rating') {
            options.max = f.options?.max ?? 5;
          }
          if (f.type === 'duration') {
            options.format = f.options?.durationFormat ?? 'h:mm';
          }
          if (f.type === 'formula') {
            options.formula = f.options?.formula ?? '';
          }

          let pgColName = toSnakeCase(f.name) || `field_${idx}`;
          // Deduplicate column names
          if (usedColNames.has(pgColName)) {
            let suffix = 2;
            while (usedColNames.has(`${pgColName}_${suffix}`)) suffix++;
            pgColName = `${pgColName}_${suffix}`;
          }
          usedColNames.add(pgColName);

          return {
            table_id: table.id,
            name: f.name,
            pg_column_name: pgColName,
            ui_type: mapped.uiType,
            pg_type: mapped.pgType,
            options,
            position: SYSTEM_FIELDS.length + idx,
            width: 180,
            is_primary: false,
            is_required: false,
            is_unique: false,
            is_system: false,
            is_hidden: false,
          };
        });

        // Add PG columns
        for (const fr of fieldRows) {
          await supabase.functions.invoke('ddl-executor', {
            body: {
              action: 'addColumn',
              schemaName,
              tableName: pgTableName,
              columnName: fr.pg_column_name,
              columnType: fr.pg_type,
            },
          });
        }

        // Insert field metadata
        const { data: createdFields } = await supabase
          .schema('nc_meta')
          .from('fields')
          .insert(fieldRows)
          .select();

        const allFields = [...(sysFields ?? []), ...(createdFields ?? [])];

        // Create default grid view
        await supabase.schema('nc_meta').from('views').insert({
          table_id: table.id,
          name: 'Grid view',
          type: 'grid',
          filters: [],
          sorts: [],
          groups: [],
          field_order: allFields.map((f: any) => f.id),
          field_visibility: {},
          field_widths: {},
          is_default: true,
          is_locked: false,
          position: 0,
        });

        // Fetch and import records from Airtable
        try {
          const records = await fetchAllRecords(selectedBaseId!, atTable.id);
          if (records.length > 0) {
            // Build a field name → { pg_column_name, pg_type } map
            const fieldMap: Record<string, { col: string; pgType: string }> = {};
            for (const fr of fieldRows) {
              fieldMap[fr.name] = { col: fr.pg_column_name, pgType: fr.pg_type };
            }

            // Insert in batches of 50
            const batchSize = 50;
            for (let b = 0; b < records.length; b += batchSize) {
              const batch = records.slice(b, b + batchSize);
              const rows = batch.map((rec: any, idx: number) => {
                const row: Record<string, any> = { nc_order: b + idx + 1 };
                for (const [fieldName, value] of Object.entries(rec.fields || {})) {
                  const mapping = fieldMap[fieldName];
                  if (mapping) {
                    if (mapping.pgType === 'JSONB' || mapping.pgType === "JSONB DEFAULT '[]'::jsonb") {
                      row[mapping.col] = value;
                    } else if (mapping.pgType === 'TEXT[]') {
                      row[mapping.col] = Array.isArray(value) ? value : [String(value)];
                    } else if (typeof value === 'object' && value !== null) {
                      row[mapping.col] = JSON.stringify(value);
                    } else {
                      row[mapping.col] = value;
                    }
                  }
                }
                return row;
              });

              await supabase.schema(schemaName).from(pgTableName).insert(rows);
            }
          }
        } catch {
          // Records import failure is non-fatal — schema still imported
        }
      }

      setImportedCount(selectedTables.length);
      setActiveBase(base.id);
      qc.invalidateQueries({ queryKey: ['nc'] });
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? 'Import failed');
      setStep('select');
    }
  }, [tables, bases, selectedBaseId, token, qc, setActiveBase]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Download size={18} className="text-[#3366FF]" />
            Import from Airtable
          </DialogTitle>
        </DialogHeader>

        {step === 'token' && (
          <div className="space-y-4 py-2">
            <p className="text-[13px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] leading-relaxed">
              Enter your Airtable Personal Access Token to import your bases. You can create one at{' '}
              <a
                href="https://airtable.com/create/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3366FF] hover:underline inline-flex items-center gap-0.5"
              >
                airtable.com/create/tokens <ExternalLink size={11} />
              </a>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#4A5268] dark:text-[hsl(200,20%,55%)]">
                Personal Access Token
              </Label>
              <div className="relative">
                <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA2AF]" />
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="pat..."
                  className="h-9 pl-9"
                  onKeyDown={(e) => e.key === 'Enter' && token.trim() && fetchBases()}
                />
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-xs text-red-500">
                <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>
        )}

        {step === 'select' && !selectedBaseId && (
          <div className="space-y-3 py-2">
            <p className="text-[13px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
              Select a base to import:
            </p>
            <div className="max-h-[320px] overflow-y-auto space-y-1">
              {bases.map((base) => (
                <button
                  key={base.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] hover:border-[#3366FF] hover:bg-[#F0F3FF] dark:hover:bg-[hsl(220,30%,14%)] transition-all text-left group"
                  onClick={() => fetchTables(base.id)}
                  disabled={loading}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#3366FF]/10 flex items-center justify-center shrink-0">
                    <Database size={16} className="text-[#3366FF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] truncate group-hover:text-[#3366FF]">
                      {base.name}
                    </p>
                    <p className="text-[11px] text-[#9AA2AF]">{base.permissionLevel}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#9AA2AF] group-hover:text-[#3366FF]" />
                </button>
              ))}
            </div>
            {error && (
              <div className="flex items-start gap-2 text-xs text-red-500">
                <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>
        )}

        {step === 'select' && selectedBaseId && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <button
                className="text-xs text-[#3366FF] hover:underline"
                onClick={() => { setSelectedBaseId(null); setTables([]); }}
              >
                &larr; Back to bases
              </button>
              <span className="text-xs text-[#9AA2AF]">
                {bases.find((b) => b.id === selectedBaseId)?.name}
              </span>
            </div>
            <p className="text-[13px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
              Select tables to import ({tables.filter((t) => t.selected).length} of {tables.length} selected):
            </p>
            <div className="max-h-[280px] overflow-y-auto space-y-1">
              {tables.map((table) => (
                <button
                  key={table.id}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left',
                    table.selected
                      ? 'border-[#3366FF] bg-[#F0F3FF] dark:bg-[hsl(220,30%,14%)]'
                      : 'border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] hover:border-[#3366FF]/50'
                  )}
                  onClick={() => toggleTable(table.id)}
                >
                  <div className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                    table.selected
                      ? 'border-[#3366FF] bg-[#3366FF]'
                      : 'border-[#D1D5DB] dark:border-[hsl(200,25%,25%)]'
                  )}>
                    {table.selected && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">
                      {table.name}
                    </p>
                    <p className="text-[11px] text-[#9AA2AF]">
                      {table.fields.length} fields
                    </p>
                  </div>
                  <Table2 size={14} className="text-[#9AA2AF] shrink-0" />
                </button>
              ))}
            </div>
            {error && (
              <div className="flex items-start gap-2 text-xs text-red-500">
                <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center space-y-4">
            <Loader2 size={32} className="mx-auto animate-spin text-[#3366FF]" />
            <div>
              <p className="text-[14px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
                Importing from Airtable...
              </p>
              <p className="text-[12px] text-[#9AA2AF] mt-1">
                Table {progress.current} of {progress.total}: {progress.tableName}
              </p>
            </div>
            <div className="w-full bg-[#E7E7E9] dark:bg-[hsl(200,25%,18%)] rounded-full h-2 max-w-xs mx-auto">
              <div
                className="bg-[#3366FF] h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="text-[14px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">
              Import complete!
            </p>
            <p className="text-[12px] text-[#9AA2AF]">
              Successfully imported {importedCount} table{importedCount !== 1 ? 's' : ''} from Airtable.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'token' && (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#3366FF] hover:bg-[#2952CC]"
                onClick={fetchBases}
                disabled={loading || !token.trim()}
              >
                {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {loading ? 'Connecting...' : 'Connect'}
              </Button>
            </>
          )}
          {step === 'select' && selectedBaseId && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setSelectedBaseId(null); setTables([]); }}>
                Back
              </Button>
              <Button
                size="sm"
                className="bg-[#3366FF] hover:bg-[#2952CC]"
                onClick={startImport}
                disabled={loading || tables.filter((t) => t.selected).length === 0}
              >
                {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Download size={14} className="mr-1" />}
                Import {tables.filter((t) => t.selected).length} table{tables.filter((t) => t.selected).length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button
              size="sm"
              className="bg-[#3366FF] hover:bg-[#2952CC]"
              onClick={() => { reset(); onOpenChange(false); }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
