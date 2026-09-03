import {
  Type, Hash, DollarSign, Calendar, CheckSquare, List, Link2,
  Paperclip, Mail, Phone, Globe, Clock, User, FileText, Star,
  Percent, Braces, Barcode, Users, MousePointerClick, LucideIcon,
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
  SingleSelect: List,
  MultiSelect: List,
  Checkbox: CheckSquare,
  Links: Link2,
  Lookup: Link2,
  Rollup: Hash,
  Formula: Braces,
  Attachment: Paperclip,
  ID: Hash,
  AutoNumber: Hash,
  CreatedBy: User,
  LastModifiedBy: User,
  JSON: Braces,
  Barcode: Barcode,
  User: Users,
  Button: MousePointerClick,
};

export function getFieldTypeIcon(uiType: UIType): LucideIcon {
  return iconMap[uiType] || Type;
}
