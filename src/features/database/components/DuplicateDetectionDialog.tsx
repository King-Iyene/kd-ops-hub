import React, { useState, useMemo, useCallback } from 'react';
import { X, Copy, Trash2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Loader2, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FieldMeta } from '../types';

interface DuplicateDetectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: Record<string, any>[];
  fields: FieldMeta[];
  onScrollToRow?: (recordId: string) => void;
}

type DuplicateGroup = {
  key: string;
  matchField: string;
  matchValue: string;
  similarity: number;
  rows: Record<string, any>[];
};

function normalize(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > 200 || b.length > 200) {
    return a === b ? 0 : Math.max(a.length, b.length);
  }
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function isTextLike(uiType?: string): boolean {
  if (!uiType) return false;
  const t = uiType.toLowerCase();
  return t.includes('text') || t === 'email' || t.includes('phone') || t === 'url' || t === 'singleselect';
}

export function DuplicateDetectionDialog({ open, onOpenChange, records, fields, onScrollToRow }: DuplicateDetectionDialogProps) {
  const [threshold, setThreshold] = useState(0.85);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const textFields = useMemo(() =>
    fields.filter(f => isTextLike(f.ui_type) && !f.pg_column_name?.startsWith('nc_')),
    [fields]
  );

  const primaryField = useMemo(() =>
    fields.find(f => f.is_primary) ?? fields[0],
    [fields]
  );

  const toggleField = useCallback((id: string) => {
    setSelectedFields(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setScanned(false);
  }, []);

  const runScan = useCallback(() => {
    setScanning(true);
    setScanned(false);

    requestAnimationFrame(() => {
      const fieldsToCheck = selectedFields.length > 0
        ? fields.filter(f => selectedFields.includes(f.id))
        : textFields;

      if (fieldsToCheck.length === 0 || records.length === 0) {
        setGroups([]);
        setScanning(false);
        setScanned(true);
        return;
      }

      const found: DuplicateGroup[] = [];
      const seen = new Set<string>();

      for (const field of fieldsToCheck) {
        const col = field.pg_column_name ?? field.id;
        const valueMap = new Map<string, Record<string, any>[]>();

        for (const rec of records) {
          const raw = normalize(rec[col]);
          if (!raw || raw.length < 2) continue;

          let matched = false;
          for (const [existingVal, existingRows] of valueMap.entries()) {
            const sim = similarity(raw, existingVal);
            if (sim >= threshold) {
              const groupKey = `${field.id}::${existingVal}`;
              if (!seen.has(`${rec.id}::${groupKey}`)) {
                existingRows.push(rec);
                seen.add(`${rec.id}::${groupKey}`);
              }
              matched = true;
              break;
            }
          }
          if (!matched) {
            valueMap.set(raw, [rec]);
          }
        }

        for (const [val, rows] of valueMap.entries()) {
          if (rows.length >= 2) {
            found.push({
              key: `${field.id}::${val}`,
              matchField: field.name,
              matchValue: val.length > 60 ? val.slice(0, 60) + '…' : val,
              similarity: threshold,
              rows,
            });
          }
        }
      }

      found.sort((a, b) => b.rows.length - a.rows.length);
      setGroups(found);
      setScanning(false);
      setScanned(true);
      if (found.length > 0) {
        setExpandedGroups(new Set([found[0].key]));
      }
    });
  }, [selectedFields, fields, textFields, records, threshold]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (!open) return null;

  const totalDuplicates = groups.reduce((sum, g) => sum + g.rows.length - 1, 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div
        className="bg-white dark:bg-[hsl(200,30%,10%)] rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700/50 w-[600px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <ScanSearch size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Duplicate Detection</h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Find potential duplicate rows by fuzzy text matching</p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700/50">
            <X size={16} className="text-zinc-400" />
          </button>
        </div>

        {/* Config */}
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-700/30 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Match threshold</label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={threshold}
                onChange={e => { setThreshold(+e.target.value); setScanned(false); }}
                className="flex-1 h-1.5 accent-amber-500"
              />
              <span className="text-xs font-mono text-zinc-600 dark:text-zinc-300 w-10 text-right">{Math.round(threshold * 100)}%</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-0.5">Higher = stricter matching (exact duplicates). Lower = catches similar entries.</p>
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Fields to check</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {textFields.map(f => (
                <button
                  key={f.id}
                  onClick={() => toggleField(f.id)}
                  className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                    selectedFields.includes(f.id)
                      ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                      : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-amber-300'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
            {selectedFields.length === 0 && (
              <p className="text-[10px] text-zinc-400 mt-1">All text fields will be checked if none selected</p>
            )}
          </div>

          <Button
            size="sm"
            className="w-full h-8 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white"
            onClick={runScan}
            disabled={scanning}
          >
            {scanning ? (
              <><Loader2 size={14} className="animate-spin mr-1.5" /> Scanning {records.length} records…</>
            ) : (
              <><ScanSearch size={14} className="mr-1.5" /> Scan for duplicates</>
            )}
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {!scanned && !scanning && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ScanSearch size={32} className="text-zinc-300 dark:text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-400">Configure settings above and click scan</p>
            </div>
          )}

          {scanned && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 size={32} className="text-green-400 mb-2" />
              <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">No duplicates found</p>
              <p className="text-[11px] text-zinc-400 mt-1">Try lowering the match threshold to catch more similar entries</p>
            </div>
          )}

          {scanned && groups.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-xs text-zinc-600 dark:text-zinc-300">
                  Found <strong className="text-amber-600 dark:text-amber-400">{totalDuplicates}</strong> potential duplicate{totalDuplicates !== 1 ? 's' : ''} in <strong>{groups.length}</strong> group{groups.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-2">
                {groups.map(group => (
                  <div
                    key={group.key}
                    className="border border-zinc-200 dark:border-zinc-700/50 rounded-lg overflow-hidden"
                  >
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-left"
                      onClick={() => toggleGroup(group.key)}
                    >
                      {expandedGroups.has(group.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{group.matchField}</span>
                        <span className="text-[11px] text-zinc-400 mx-1.5">·</span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">"{group.matchValue}"</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                        {group.rows.length} rows
                      </span>
                    </button>

                    {expandedGroups.has(group.key) && (
                      <div className="border-t border-zinc-100 dark:border-zinc-700/30">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                              <th className="text-left px-3 py-1.5 font-medium text-zinc-500 dark:text-zinc-400 w-8">#</th>
                              <th className="text-left px-3 py-1.5 font-medium text-zinc-500 dark:text-zinc-400">
                                {primaryField?.name ?? 'Record'}
                              </th>
                              <th className="text-left px-3 py-1.5 font-medium text-zinc-500 dark:text-zinc-400">
                                {group.matchField}
                              </th>
                              <th className="w-16" />
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row, ri) => {
                              const primaryCol = primaryField?.pg_column_name ?? 'id';
                              const matchCol = fields.find(f => f.name === group.matchField)?.pg_column_name;
                              return (
                                <tr
                                  key={row.id}
                                  className={`border-t border-zinc-100 dark:border-zinc-700/20 ${ri === 0 ? '' : 'bg-amber-50/50 dark:bg-amber-900/10'}`}
                                >
                                  <td className="px-3 py-1.5 text-zinc-400">{ri + 1}</td>
                                  <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-200 truncate max-w-[180px]">
                                    {String(row[primaryCol] ?? row.id ?? '')}
                                  </td>
                                  <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                                    {matchCol ? String(row[matchCol] ?? '') : ''}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    {onScrollToRow && (
                                      <button
                                        className="text-[10px] text-blue-500 hover:text-blue-600 hover:underline"
                                        onClick={() => onScrollToRow(row.id)}
                                      >
                                        Go to →
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-700/50 flex items-center justify-between">
          <span className="text-[10px] text-zinc-400">
            {records.length} records scanned
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
