import { forwardRef } from 'react';
import {
  Type, Hash, DollarSign, Calendar, CheckSquare,
  Paperclip, Mail, Phone, Globe, Clock, User, FileText, Star,
  Percent, Barcode, Users, MousePointerClick,
  Search, ListOrdered, UserPlus, UserCog, LucideIcon,
  Sigma, CornerRightDown, Tags, CircleDot,
  ListChecks, Braces, TableProperties, ListTodo,
} from 'lucide-react';
import type { UIType } from '@/features/database/types';

const FormulaFxIcon = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 7c0-2.2 1.8-4 4-4h2" />
    <path d="M5 7h7" />
    <path d="M8 7v10c0 2.2 1.8 4 4 4" />
    <path d="M15 21l4-7" />
    <path d="M19 21l-4-7" />
  </svg>
)) as unknown as LucideIcon;

const iconMap: Record<UIType, LucideIcon> = {
  SingleLineText: Type,
  LongText: FileText,
  Email: Mail,
  PhoneNumber: Phone,
  URL: Globe,
  Number: Hash,
  Decimal: Hash,
  Currency: DollarSign,
  Percent: Percent,
  Duration: Clock,
  Rating: Star,
  Date: Calendar,
  DateTime: Calendar,
  Year: Calendar,
  Time: Clock,
  CreatedTime: Clock,
  LastModifiedTime: Clock,
  SingleSelect: CircleDot,
  MultiSelect: Tags,
  Checkbox: CheckSquare,
  Links: TableProperties,
  Lookup: CornerRightDown,
  Rollup: Sigma,
  Count: ListChecks,
  Formula: FormulaFxIcon,
  Attachment: Paperclip,
  ID: Hash,
  AutoNumber: ListOrdered,
  CreatedBy: UserPlus,
  LastModifiedBy: UserCog,
  JSON: Braces,
  Barcode: Barcode,
  User: Users,
  Button: MousePointerClick,
  LinkedTasks: ListTodo,
};

export function getFieldTypeIcon(uiType: UIType): LucideIcon {
  return iconMap[uiType] || Type;
}
