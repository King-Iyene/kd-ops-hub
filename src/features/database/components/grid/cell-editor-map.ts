import {
  TextCellEditor,
  LongTextCellEditor,
  NumberCellEditor,
  DecimalCellEditor,
  CurrencyCellEditor,
  DateCellEditor,
  YearCellEditor,
  DateTimeCellEditor,
  TimeCellEditor,
  DurationCellEditor,
  EmailCellEditor,
  URLCellEditor,
  PhoneNumberCellEditor,
  RatingCellEditor,
  SelectCellEditor,
  MultiSelectCellEditor,
  AttachmentCellEditor,
  LinksCellEditor,
  PercentCellEditor,
  UserCellEditor,
  LinkedTasksCellEditor,
} from './cell-editors';

export interface UserValue {
  id?: string;
  email?: string;
  name?: string;
}

/** Normalize a User/People cell value (single object, array, or plain text) to an array. */
export function normalizeUserValue(value: unknown): UserValue[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.filter(Boolean) as UserValue[];
  if (typeof value === 'object') return [value as UserValue];
  return [{ email: String(value), name: String(value) }];
}

export function getCellEditor(uiType: string) {
  switch (uiType) {
    case 'SingleLineText':
      return TextCellEditor;
    case 'LongText':
      return LongTextCellEditor;
    case 'Number':
      return NumberCellEditor;
    case 'Decimal':
      return DecimalCellEditor;
    case 'Percent':
      return PercentCellEditor;
    case 'Currency':
      return CurrencyCellEditor;
    case 'Date':
      return DateCellEditor;
    case 'Year':
      return YearCellEditor;
    case 'DateTime':
      return DateTimeCellEditor;
    case 'Time':
      return TimeCellEditor;
    case 'Duration':
      return DurationCellEditor;
    case 'Email':
      return EmailCellEditor;
    case 'URL':
      return URLCellEditor;
    case 'PhoneNumber':
      return PhoneNumberCellEditor;
    case 'Rating':
      return RatingCellEditor;
    case 'SingleSelect':
      return SelectCellEditor;
    case 'MultiSelect':
      return MultiSelectCellEditor;
    case 'Attachment':
      return AttachmentCellEditor;
    case 'Links':
      return LinksCellEditor;
    case 'Barcode':
      return TextCellEditor;
    case 'JSON':
      return LongTextCellEditor;
    case 'User':
      return UserCellEditor;
    case 'LinkedTasks':
      return LinkedTasksCellEditor;
    case 'Button':
      return null;
    case 'Checkbox':
      return null;
    case 'Formula':
    case 'Lookup':
    case 'Rollup':
    case 'Count':
    case 'AutoNumber':
    case 'ID':
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'CreatedBy':
    case 'LastModifiedBy':
      return null;
    default:
      return TextCellEditor;
  }
}
