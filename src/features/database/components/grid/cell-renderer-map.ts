import {
  TextCellRenderer,
  LongTextCellRenderer,
  NumberCellRenderer,
  DecimalCellRenderer,
  CurrencyCellRenderer,
  DateCellRenderer,
  CheckboxCellRenderer,
  SelectCellRenderer,
  MultiSelectCellRenderer,
  AttachmentCellRenderer,
  SystemCellRenderer,
  RatingCellRenderer,
  PercentCellRenderer,
  DurationCellRenderer,
  TimeCellRenderer,
  YearCellRenderer,
  FormulaCellRenderer,
  JsonCellRenderer,
  LinksCellRenderer,
  BarcodeCellRenderer,
  ButtonCellRenderer,
  UserCellRenderer,
  LinkedTasksCellRenderer,
  LastModifiedByCellRenderer,
} from './cell-renderers';
import {
  LookupCellRenderer as SmartLookupCellRenderer,
  RollupCellRenderer as SmartRollupCellRenderer,
} from './LookupRollupCellRenderer';

export interface LinkedTaskValue {
  id?: string;
  title?: string;
}

/** Normalize a Linked Tasks cell value to an array of {id, title}. */
export function normalizeLinkedTasks(value: unknown): LinkedTaskValue[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.filter(Boolean) as LinkedTaskValue[];
  if (typeof value === 'object') return [value as LinkedTaskValue];
  return [{ id: String(value), title: String(value) }];
}

export function getCellRenderer(uiType: string) {
  switch (uiType) {
    case 'SingleLineText':
    case 'Email':
    case 'PhoneNumber':
    case 'URL':
      return TextCellRenderer;
    case 'LongText':
      return LongTextCellRenderer;
    case 'Number':
      return NumberCellRenderer;
    case 'Decimal':
      return DecimalCellRenderer;
    case 'Percent':
      return PercentCellRenderer;
    case 'Currency':
      return CurrencyCellRenderer;
    case 'Date':
    case 'DateTime':
      return DateCellRenderer;
    case 'Year':
      return YearCellRenderer;
    case 'Time':
      return TimeCellRenderer;
    case 'Duration':
      return DurationCellRenderer;
    case 'Checkbox':
      return CheckboxCellRenderer;
    case 'Rating':
      return RatingCellRenderer;
    case 'SingleSelect':
      return SelectCellRenderer;
    case 'MultiSelect':
      return MultiSelectCellRenderer;
    case 'Attachment':
      return AttachmentCellRenderer;
    case 'JSON':
      return JsonCellRenderer;
    case 'Barcode':
      return BarcodeCellRenderer;
    case 'Formula':
      return FormulaCellRenderer;
    case 'Links':
      return LinksCellRenderer;
    case 'Lookup':
      return SmartLookupCellRenderer as any;
    case 'Rollup':
      return SmartRollupCellRenderer as any;
    case 'Count':
      return SmartRollupCellRenderer as any;
    case 'Button':
      return ButtonCellRenderer;
    case 'User':
      return UserCellRenderer;
    case 'LinkedTasks':
      return LinkedTasksCellRenderer;
    case 'LastModifiedBy':
      return LastModifiedByCellRenderer;
    case 'ID':
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'AutoNumber':
    case 'CreatedBy':
      return SystemCellRenderer;
    default:
      return TextCellRenderer;
  }
}
