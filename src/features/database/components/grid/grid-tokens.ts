export const GRID_COLORS_LIGHT = {
  bg: '#FFFFFF',
  headerBg: '#F9F9FA',
  border: '#E7E7E9',
  selected: '#3366FF',
  primary: '#3366FF',
  hoverRow: '#F5F7FA',
  text: '#374151',
  headerText: '#6A7184',
  muted: '#9AA2AF',
  groupHeaderBg: '#F4F4F5',
  cellEditorBg: '#FFFFFF',
  cellEditorText: '#0F172A',
  selectedRowBg: '#EBF0FF',
  altRowBg: '#FAFBFC',
} as const;

export const GRID_COLORS_DARK = {
  bg: 'hsl(200, 30%, 8%)',
  headerBg: 'hsl(200, 25%, 11%)',
  border: 'hsl(200, 25%, 18%)',
  selected: '#3366FF',
  primary: '#3366FF',
  hoverRow: 'hsl(220, 40%, 15%)',
  text: 'hsl(200, 25%, 88%)',
  headerText: 'hsl(200, 20%, 65%)',
  muted: 'hsl(200, 15%, 50%)',
  groupHeaderBg: 'hsl(200, 25%, 13%)',
  cellEditorBg: 'hsl(220, 20%, 12%)',
  cellEditorText: 'hsl(210, 20%, 92%)',
  selectedRowBg: 'hsl(220, 40%, 18%)',
  altRowBg: 'hsl(220, 20%, 11%)',
} as const;

export type GridColors = typeof GRID_COLORS_LIGHT;

export const GRID_COLORS = GRID_COLORS_LIGHT;
