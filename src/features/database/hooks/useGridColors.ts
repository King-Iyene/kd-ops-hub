import { useMemo } from 'react';
import { useTheme } from 'next-themes';

const LIGHT = {
  bg: '#FFFFFF',
  headerBg: '#F8F8F9',
  border: '#DDDFE3',
  borderStrong: '#C8CCD4',
  text: '#1F2937',
  textSecondary: '#374151',
  muted: '#6B7280',
  hoverRow: '#F3F5F8',
  groupHeaderBg: '#F4F4F5',
  primary: '#2563EB',
  cellEditorBg: '#FFFFFF',
  cellEditorText: '#0F172A',
  selectedRowBg: '#EFF4FF',
  altRowBg: '#FAFBFC',
  systemText: '#9CA3AF',
  linkText: '#2563EB',
  checkboxChecked: '#16A34A',
  danger: '#DC2626',
};

const DARK = {
  bg: 'hsl(220, 20%, 10%)',
  headerBg: 'hsl(220, 18%, 13%)',
  border: 'hsl(220, 15%, 22%)',
  borderStrong: 'hsl(220, 15%, 28%)',
  text: 'hsl(210, 20%, 88%)',
  textSecondary: 'hsl(210, 18%, 78%)',
  muted: 'hsl(215, 12%, 50%)',
  hoverRow: 'hsl(220, 20%, 14%)',
  groupHeaderBg: 'hsl(220, 18%, 14%)',
  primary: '#3B82F6',
  cellEditorBg: 'hsl(220, 20%, 12%)',
  cellEditorText: 'hsl(210, 20%, 92%)',
  selectedRowBg: 'hsl(220, 40%, 16%)',
  altRowBg: 'hsl(220, 20%, 11%)',
  systemText: 'hsl(215, 12%, 48%)',
  linkText: '#60A5FA',
  checkboxChecked: '#22C55E',
  danger: '#EF4444',
};

export type GridColorTokens = typeof LIGHT;

export function useGridColors(): GridColorTokens {
  const { resolvedTheme } = useTheme();
  return useMemo(() => (resolvedTheme === 'dark' ? DARK : LIGHT), [resolvedTheme]);
}
