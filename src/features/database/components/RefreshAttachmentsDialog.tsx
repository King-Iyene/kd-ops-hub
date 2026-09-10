import { useState, useRef, useCallback } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Key } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useBases } from '../hooks/useBases';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string | null;
}

interface StaleInfo {
  schemaName: string;
  tableName: string;
  pgTableName: string;
  fieldName: string;
  pgCol: string;
  staleCount: number;
}

type Phase = 'token' | 'scanning' | 'ready' | 'refreshing' | 'done';

const AIRTABLE_API = 'https://api.airtable.com/v0';

async function fetchAirtableBases(token: string) {
  const res = await fetch('https://api.airtable.com/v0/meta/bases', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Invalid token or API error');
  const json = await res.json();
  return json.bases as Array<{ id: string; name: string }>;
}

async function fetchAirtableTables(token: string, baseId: string) {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.tables as Array<{ id: string; name: string; fields: Array<{ id: string; name: string; type: string }> }>;
}

async function fetchAirtableRecords(token: string, baseId: string, tableId: string, recordIds: string[]) {
  const results: Record<string, any> = {};
  // Fetch in batches using filterByFormula with RECORD_ID()
  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);
    const formula = `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
    const url = `${AIRTABLE_API}/${baseId}/${tableId}?filterByFormula=${encodeURIComponent(formula)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    const json = await res.json();
    for (const rec of json.records || []) {
      results[rec.id] = rec;
    }
    // Rate limit: 5 req/sec
    if (i + 10 < recordIds.length) await new Promise((r) => setTimeout(r, 220));
  }
  return results;
}

export function RefreshAttachmentsDialog({ open, onOpenChange, baseId }: Props) {
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<Phase>('token');
  const [staleFields, setStaleFields] = useState<StaleInfo[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, fixed: 0, failed: 0 });
  const abortRef = useRef(false);
  const { toast } = useToast();
  const { data: bases } = useBases();

  const reset = useCallback(() => {
    setPhase('token');
    setStaleFields([]);
    setProgress({ current: 0, total: 0, fixed: 0, failed: 0 });
    abortRef.current = false;
  }, []);

  const handleClose = useCallback(
    (v: boolean) => {
      if (!v) {
        abortRef.current = true;
        reset();
      }
      onOpenChange(v);
    },
    [onOpenChange, reset],
  );

  const currentBase = bases?.find((b: any) => b.id === baseId);

  const scanForStale = useCallback(async () => {
    if (!baseId || !currentBase) return;
    setPhase('scanning');

    // Get all attachment fields for the current base
    const { data: fields } = await supabase
      .schema('nc_meta')
      .from('fields')
      .select('id, name, pg_column_name, table_id, ui_type')
      .eq('ui_type', 'Attachment');

    if (!fields?.length) {
      setPhase('ready');
      return;
    }

    // Get tables for this base
    const { data: tables } = await supabase
      .schema('nc_meta')
      .from('tables')
      .select('id, name, pg_table_name, base_id, schema_name:bases!inner(schema_name)')
      .eq('base_id', baseId);

    if (!tables?.length) {
      setPhase('ready');
      return;
    }

    const tableMap = new Map(tables.map((t: any) => [t.id, t]));
    const stale: StaleInfo[] = [];

    for (const field of fields) {
      const table = tableMap.get(field.table_id);
      if (!table) continue;

      const schemaName = (table as any).schema_name?.schema_name || (table as any).schema_name;
      if (!schemaName) continue;

      // Count records with airtableusercontent.com URLs
      const { count } = await supabase.rpc('exec_sql_count', {
        q: `SELECT count(*) FROM "${schemaName}"."${table.pg_table_name}" WHERE "${field.pg_column_name}"::text LIKE '%airtableusercontent.com%'`,
      });

      // Fallback: query directly
      if (count === null || count === undefined) {
        const { data: rows } = await supabase
          .from(`${table.pg_table_name}`)
          .select('id', { count: 'exact', head: true });
        // Just check a sample
        const { data: sample } = await supabase
          .schema(schemaName)
          .from(table.pg_table_name)
          .select(`id, ${field.pg_column_name}`)
          .not(field.pg_column_name, 'is', null)
          .limit(1);

        if (sample?.length && JSON.stringify(sample[0][field.pg_column_name]).includes('airtableusercontent.com')) {
          // Get full count
          const { data: allRows } = await supabase
            .schema(schemaName)
            .from(table.pg_table_name)
            .select(`id`)
            .not(field.pg_column_name, 'is', null);

          stale.push({
            schemaName,
            tableName: table.name,
            pgTableName: table.pg_table_name,
            fieldName: field.name,
            pgCol: field.pg_column_name,
            staleCount: allRows?.length || 0,
          });
        }
        continue;
      }

      if (count > 0) {
        stale.push({
          schemaName,
          tableName: table.name,
          pgTableName: table.pg_table_name,
          fieldName: field.name,
          pgCol: field.pg_column_name,
          staleCount: count,
        });
      }
    }

    setStaleFields(stale);
    setPhase('ready');
  }, [baseId, currentBase]);

  const refreshAttachments = useCallback(async () => {
    if (!token || staleFields.length === 0 || !currentBase) return;
    setPhase('refreshing');
    abortRef.current = false;

    const totalRecords = staleFields.reduce((a, b) => a + b.staleCount, 0);
    setProgress({ current: 0, total: totalRecords, fixed: 0, failed: 0 });

    // Find matching Airtable base by name
    let atBases: Array<{ id: string; name: string }>;
    try {
      atBases = await fetchAirtableBases(token);
    } catch {
      toast({ title: 'Invalid Airtable token', variant: 'destructive' });
      setPhase('ready');
      return;
    }

    const atBase = atBases.find((b) => b.name.trim() === currentBase.name.trim());
    if (!atBase) {
      toast({
        title: 'No matching Airtable base found',
        description: `Could not find "${currentBase.name}" in your Airtable account`,
        variant: 'destructive',
      });
      setPhase('ready');
      return;
    }

    // Get Airtable tables
    const atTables = await fetchAirtableTables(token, atBase.id);

    let globalFixed = 0;
    let globalFailed = 0;
    let globalCurrent = 0;

    for (const staleField of staleFields) {
      if (abortRef.current) break;

      // Match Airtable table by name
      const atTable = atTables.find((t) => t.name === staleField.tableName);
      if (!atTable) {
        globalFailed += staleField.staleCount;
        globalCurrent += staleField.staleCount;
        setProgress({ current: globalCurrent, total: totalRecords, fixed: globalFixed, failed: globalFailed });
        continue;
      }

      // Fetch KDOps records with stale URLs
      const { data: staleRows } = await supabase
        .schema(staleField.schemaName)
        .from(staleField.pgTableName)
        .select(`id, airtable_id, ${staleField.pgCol}`)
        .not(staleField.pgCol, 'is', null);

      if (!staleRows?.length) continue;

      // Filter to those with Airtable URLs
      const rowsToFix = staleRows.filter(
        (r: any) => r.airtable_id && JSON.stringify(r[staleField.pgCol]).includes('airtableusercontent.com'),
      );

      // Fetch fresh records from Airtable
      const airtableIds = rowsToFix.map((r: any) => r.airtable_id);
      const freshRecords = await fetchAirtableRecords(token, atBase.id, atTable.id, airtableIds);

      // Process each record
      for (const row of rowsToFix) {
        if (abortRef.current) break;
        globalCurrent++;

        const freshRec = freshRecords[row.airtable_id];
        if (!freshRec) {
          globalFailed++;
          setProgress({ current: globalCurrent, total: totalRecords, fixed: globalFixed, failed: globalFailed });
          continue;
        }

        // Find attachment field value in fresh record
        const freshAttachments = freshRec.fields?.[staleField.fieldName];
        if (!Array.isArray(freshAttachments) || freshAttachments.length === 0) {
          globalFailed++;
          setProgress({ current: globalCurrent, total: totalRecords, fixed: globalFixed, failed: globalFailed });
          continue;
        }

        // Download each attachment and upload to Supabase Storage
        const uploaded: any[] = [];
        let allOk = true;
        for (const att of freshAttachments) {
          try {
            const resp = await fetch(att.url);
            if (!resp.ok) throw new Error('fetch failed');
            const blob = await resp.blob();
            const filename = att.filename || att.name || 'file';
            const ts = Date.now();
            const path = `${currentBase.id}/${atTable.id}/${row.airtable_id}/${ts}_${filename}`;
            const { error: upErr } = await supabase.storage
              .from('attachments')
              .upload(path, blob, { upsert: true, contentType: att.type || blob.type });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
            uploaded.push({
              name: filename,
              url: urlData.publicUrl,
              size: att.size || blob.size,
              type: att.type || blob.type || '',
              uploaded_at: new Date().toISOString(),
            });
          } catch {
            allOk = false;
            uploaded.push({
              name: att.filename || att.name || 'file',
              url: att.url || '',
              size: att.size || 0,
              type: att.type || '',
              uploaded_at: '',
            });
          }
        }

        // Update the record
        const { error: updateErr } = await supabase
          .schema(staleField.schemaName)
          .from(staleField.pgTableName)
          .update({ [staleField.pgCol]: uploaded })
          .eq('id', row.id);

        if (updateErr || !allOk) {
          globalFailed++;
        } else {
          globalFixed++;
        }
        setProgress({ current: globalCurrent, total: totalRecords, fixed: globalFixed, failed: globalFailed });
      }
    }

    setPhase('done');
  }, [token, staleFields, currentBase, toast]);

  const totalStale = staleFields.reduce((a, b) => a + b.staleCount, 0);
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw size={18} className="text-blue-500" />
            Refresh Airtable Attachments
          </DialogTitle>
          <DialogDescription>
            Fix expired Airtable attachment URLs by downloading files and storing them permanently.
          </DialogDescription>
        </DialogHeader>

        {phase === 'token' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="at-token" className="text-xs flex items-center gap-1.5">
                <Key size={12} /> Airtable Personal Access Token
              </Label>
              <Input
                id="at-token"
                type="password"
                placeholder="pat..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="text-2xs text-muted-foreground">
                Create one at{' '}
                <a
                  href="https://airtable.com/create/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
                >
                  airtable.com/create/tokens <ExternalLink size={10} />
                </a>
                . Needs <code className="text-3xs bg-muted px-1 rounded">data.records:read</code> scope.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                disabled={!token.startsWith('pat') || !baseId}
                onClick={scanForStale}
              >
                Scan for Stale Attachments
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <p className="text-sm text-muted-foreground">Scanning tables for expired Airtable URLs...</p>
          </div>
        )}

        {phase === 'ready' && (
          <div className="space-y-4 py-2">
            {staleFields.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">No stale attachments found!</p>
                <p className="text-xs text-muted-foreground">All attachment URLs in this base are up to date.</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Found {totalStale} records with expired URLs
                  </p>
                  <div className="space-y-1">
                    {staleFields.map((sf, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex justify-between">
                        <span>
                          {sf.tableName} → {sf.fieldName}
                        </span>
                        <span className="font-medium">{sf.staleCount} records</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This will fetch fresh URLs from Airtable, download each file, and store it permanently in
                  Supabase Storage. The Airtable URLs will be replaced with permanent links.
                </p>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                {staleFields.length === 0 ? 'Close' : 'Cancel'}
              </Button>
              {staleFields.length > 0 && (
                <Button onClick={refreshAttachments}>
                  <RefreshCw size={14} className="mr-1.5" />
                  Refresh {totalStale} Attachments
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {phase === 'refreshing' && (
          <div className="space-y-4 py-4">
            <Progress value={pct} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {progress.current} / {progress.total} records
              </span>
              <span>{pct}%</span>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-500">Fixed: {progress.fixed}</span>
              {progress.failed > 0 && <span className="text-red-500">Failed: {progress.failed}</span>}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                abortRef.current = true;
              }}
            >
              Stop
            </Button>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium">Refresh complete!</p>
            </div>
            <div className="flex justify-center gap-6 text-sm">
              <span className="text-emerald-600">
                {progress.fixed} fixed
              </span>
              {progress.failed > 0 && (
                <span className="text-red-500">
                  {progress.failed} failed
                </span>
              )}
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Reload the page to see updated attachment previews.
            </p>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
