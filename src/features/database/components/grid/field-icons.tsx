import {
  Type, Hash, DollarSign, Calendar, CheckSquare,
  Paperclip, Mail, Phone, Globe, Clock, User, FileText, Star,
  Percent, Barcode, Users, MousePointerClick,
  Search, ListOrdered, UserPlus, UserCog, LucideIcon,
  Sigma, CornerRightDown, Tags, CircleDot,
  ListChecks, Braces, TableProperties, Radical,
} from 'lucide-react';
import type { UIType } from '@/features/database/types';

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
  Formula: Radical,
  Attachment: Paperclip,
  ID: Hash,
  AutoNumber: ListOrdered,
  CreatedBy: UserPlus,
  LastModifiedBy: UserCog,
  JSON: Braces,
  Barcode: Barcode,
  User: Users,
  Button: MousePointerClick,
};

export function getFieldTypeIcon(uiType: UIType): LucideIcon {
  return iconMap[uiType] || Type;
}
