export const GRID_COLORS_LIGHT = {
  bg: '#FFFFFF',
  headerBg: '#F5F5F5',
  border: '#E5E5E5',
  selected: '#2D7FF9',
  primary: '#2D7FF9',
  hoverRow: '#F8F8F8',
  text: '#333333',
  headerText: '#333333',
  muted: '#999999',
  groupHeaderBg: '#F4F4F5',
  cellEditorBg: '#FFFFFF',
  cellEditorText: '#0F172A',
  selectedRowBg: '#EBF0FF',
  altRowBg: '#FAFBFC',
} as const;

export const GRID_COLORS_DARK = {
  bg: 'hsl(220, 20%, 8%)',
  headerBg: 'hsl(220, 20%, 11%)',
  border: 'hsl(220, 20%, 18%)',
  selected: '#2D7FF9',
  primary: '#2D7FF9',
  hoverRow: 'hsl(220, 40%, 15%)',
  text: 'hsl(220, 20%, 88%)',
  headerText: 'hsl(220, 15%, 65%)',
  muted: 'hsl(220, 15%, 50%)',
  groupHeaderBg: 'hsl(220, 20%, 13%)',
  cellEditorBg: 'hsl(220, 20%, 12%)',
  cellEditorText: 'hsl(220, 20%, 92%)',
  selectedRowBg: 'hsl(220, 40%, 18%)',
  altRowBg: 'hsl(220, 20%, 11%)',
} as const;

export type GridColors = typeof GRID_COLORS_LIGHT;

export const GRID_COLORS = GRID_COLORS_LIGHT;
