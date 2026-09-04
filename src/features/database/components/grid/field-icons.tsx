import {
  Type, Hash, DollarSign, Calendar, CheckSquare, List, Link2,
  Paperclip, Mail, Phone, Globe, Clock, User, FileText, Star,
  Percent, Braces, Barcode, Users, MousePointerClick, ChevronDown,
  Search, ListOrdered, UserPlus, UserCog, LucideIcon,
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
  SingleSelect: ChevronDown,
  MultiSelect: List,
  Checkbox: CheckSquare,
  Links: Link2,
  Lookup: Search,
  Rollup: Hash,
  Count: Hash,
  Formula: Braces,
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
