import { useMemo } from 'react';
import { useTheme } from 'next-themes';

const LIGHT = {
  bg: '#FFFFFF',
  headerBg: '#F9F9FA',
  border: '#E7E7E9',
  text: '#374151',
  muted: '#6A7184',
  hoverRow: '#F9F9FA',
  groupHeaderBg: '#F4F4F5',
  primary: '#3366FF',
  cellEditorBg: '#FFFFFF',
  cellEditorText: '#0F172A',
  selectedRowBg: '#EBF0FF',
};

const DARK = {
  bg: 'hsl(200, 30%, 8%)',
  headerBg: 'hsl(200, 25%, 11%)',
  border: 'hsl(200, 25%, 18%)',
  text: 'hsl(200, 25%, 88%)',
  muted: 'hsl(200, 20%, 60%)',
  hoverRow: 'hsl(220, 40%, 15%)',
  groupHeaderBg: 'hsl(200, 25%, 13%)',
  primary: '#3366FF',
  cellEditorBg: 'hsl(200, 30%, 10%)',
  cellEditorText: 'hsl(200, 25%, 92%)',
  selectedRowBg: 'hsl(220, 50%, 18%)',
};

export type GridColorTokens = typeof LIGHT;

export function useGridColors(): GridColorTokens {
  const { resolvedTheme } = useTheme();
  return useMemo(() => (resolvedTheme === 'dark' ? DARK : LIGHT), [resolvedTheme]);
}
