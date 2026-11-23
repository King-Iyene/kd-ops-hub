import { Label } from '@/components/ui/label';
import { ATTACHMENT_KINDS, MAX_FILE_MB, type AttachmentKind, type AttachmentSettings } from '../lib/attachmentRules';

interface AttachmentOptionsPanelProps {
  value: AttachmentSettings;
  onChange: (next: AttachmentSettings) => void;
}

const FIELD_CLASS =
  'w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#2D7FF9]/30 focus:border-[#2D7FF9]';
const LABEL_CLASS = 'text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]';

/** Limits for an attachment field: how many files, how big, which kinds. */
export function AttachmentOptionsPanel({ value, onChange }: AttachmentOptionsPanelProps) {
  const toggle = (kind: AttachmentKind) =>
    onChange({
      ...value,
      allowedTypes: value.allowedTypes.includes(kind)
        ? value.allowedTypes.filter((k) => k !== kind)
        : [...value.allowedTypes, kind],
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={LABEL_CLASS}>Most files in a cell</Label>
          <input value={value.maxCount} inputMode="numeric" onChange={(e) => onChange({ ...value, maxCount: e.target.value })} placeholder="No limit" className={FIELD_CLASS} />
        </div>
        <div className="space-y-1.5">
          <Label className={LABEL_CLASS}>Largest file (MB, up to {MAX_FILE_MB})</Label>
          <input value={value.maxSizeMB} inputMode="decimal" onChange={(e) => onChange({ ...value, maxSizeMB: e.target.value })} placeholder={`${MAX_FILE_MB}`} className={FIELD_CLASS} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className={LABEL_CLASS}>Allowed kinds <span className="text-[#9AA2AF]">(none ticked means any)</span></Label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {ATTACHMENT_KINDS.map((k) => (
            <label key={k.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-[#2D7FF9]"
                checked={value.allowedTypes.includes(k.value)}
                onChange={() => toggle(k.value)}
              />
              <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">{k.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
