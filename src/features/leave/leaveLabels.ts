import type { LeaveStatus } from './types';

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Not approved', cancelled: 'Cancelled',
};
