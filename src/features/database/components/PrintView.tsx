import { useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FieldMeta, RecordRow } from '../types';

interface PrintViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  tableName: string;
  onClose: () => void;
}

export function PrintView({ fields, records, tableName, onClose }: PrintViewProps) {
  const visibleFields = fields
    .filter((f) => !f.is_hidden && !f.is_system && f.ui_type !== 'ID')
    .sort((a, b) => a.position - b.position);

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const formatValue = (val: unknown): string => {
    if (val == null) return '';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  };

  return (
    <div className="print-view-overlay">
      <style>{`
        .print-view-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: white;
          overflow: auto;
          color: #1a1a1a;
        }
        .print-view-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          border-bottom: 1px solid #E5E5E5;
          background: #F9F9FA;
        }
        .print-view-content {
          padding: 32px 24px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .print-view-header {
          margin-bottom: 24px;
        }
        .print-view-header h1 {
          font-size: 20px;
          font-weight: 600;
          color: #1F2937;
          margin: 0 0 4px 0;
        }
        .print-view-header p {
          font-size: 13px;
          color: #6B7280;
          margin: 0;
        }
        .print-view-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .print-view-table th {
          background: #F3F4F6;
          text-align: left;
          padding: 8px 12px;
          border: 1px solid #D1D5DB;
          font-weight: 600;
          color: #374151;
          white-space: nowrap;
        }
        .print-view-table td {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          color: #374151;
          vertical-align: top;
          max-width: 300px;
          overflow-wrap: break-word;
        }
        .print-view-table tr:nth-child(even) td {
          background: #F9FAFB;
        }
        @media print {
          .print-view-toolbar {
            display: none !important;
          }
          .print-view-overlay {
            position: static;
          }
          .print-view-content {
            padding: 0;
            max-width: none;
          }
          .print-view-table {
            font-size: 10px;
          }
          .print-view-table th {
            padding: 4px 6px;
          }
          .print-view-table td {
            padding: 3px 6px;
          }
        }
      `}</style>

      <div className="print-view-toolbar">
        <span className="text-sm font-medium text-[#374151] dark:text-[hsl(200,25%,88%)]">Print Preview</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => window.print()}
          >
            <Printer size={13} /> Print
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      <div className="print-view-content">
        <div className="print-view-header">
          <h1>{tableName}</h1>
          <p>{records.length} record{records.length !== 1 ? 's' : ''} &middot; {dateStr}</p>
        </div>

        <table className="print-view-table">
          <thead>
            <tr>
              {visibleFields.map((f) => (
                <th key={f.id}>{f.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                {visibleFields.map((f) => (
                  <td key={f.id}>{formatValue(r[f.pg_column_name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
