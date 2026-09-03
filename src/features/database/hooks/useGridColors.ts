import { useMemo } from 'react';
import { useTheme } from 'next-themes';

const LIGHT = {
  bg: '#FFFFFF',
  headerBg: '#F9F9FA',
  border: '#E7E7E9',
  text: '#1F2937',
  muted: '#6A7184',
  hoverRow: '#F5F7FA',
  groupHeaderBg: '#F4F4F5',
  primary: '#3366FF',
  cellEditorBg: '#FFFFFF',
  cellEditorText: '#0F172A',
  selectedRowBg: '#EBF0FF',
  altRowBg: '#FAFBFC',
};

const DARK = {
  bg: 'hsl(220, 20%, 10%)',
  headerBg: 'hsl(220, 18%, 13%)',
  border: 'hsl(220, 15%, 20%)',
  text: 'hsl(210, 20%, 88%)',
  muted: 'hsl(215, 15%, 55%)',
  hoverRow: 'hsl(220, 20%, 14%)',
  groupHeaderBg: 'hsl(220, 18%, 14%)',
  primary: '#3366FF',
  cellEditorBg: 'hsl(220, 20%, 12%)',
  cellEditorText: 'hsl(210, 20%, 92%)',
  selectedRowBg: 'hsl(220, 40%, 18%)',
  altRowBg: 'hsl(220, 20%, 11%)',
};

export type GridColorTokens = typeof LIGHT;

export function useGridColors(): GridColorTokens {
  const { resolvedTheme } = useTheme();
  return useMemo(() => (resolvedTheme === 'dark' ? DARK : LIGHT), [resolvedTheme]);
}
