import { forwardRef } from 'react';
import {
  Type, Hash, DollarSign, Calendar, CheckSquare,
  Paperclip, Mail, Phone, Globe, Clock, FileText, Star,
  Percent, Barcode, Users, MousePointerClick,
  ListOrdered, UserPlus, UserCog, LucideIcon,
  Sigma, CornerRightDown, Tags, CircleDot,
  ListChecks, Braces, TableProperties, ListTodo,
} from 'lucide-react';
import type { UIType } from '@/features/database/types';

const FormulaFxIcon = forwardRef<SVGSVGElement, any>(
  ({ size = 24, strokeWidth = 2, color, className, ...rest }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M7 4h4a2 2 0 0 1 2 2v0" />
      <path d="M5 10h6" />
      <path d="M9 4v14a2 2 0 0 0 2 2h2" />
      <path d="M15 14l4 6" />
      <path d="M19 14l-4 6" />
    </svg>
  ),
) as unknown as LucideIcon;

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
