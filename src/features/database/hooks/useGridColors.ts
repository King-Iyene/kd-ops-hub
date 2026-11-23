import { useMemo } from 'react';
import { useTheme } from 'next-themes';

const LIGHT = {
  bg: '#FFFFFF',
  headerBg: '#F5F5F5',
  border: '#E5E5E5',
  borderStrong: '#CCCCCC',
  text: '#111111',
  textSecondary: '#333333',
  muted: '#666666',
  hoverRow: '#F8F8F8',
  groupHeaderBg: '#F5F5F5',
  primary: '#006394',
  cellEditorBg: '#FFFFFF',
  cellEditorText: '#111111',
  selectedRowBg: '#E3F1F8',
  altRowBg: '#FBFBFB',
  systemText: '#999999',
  linkText: '#006394',
  checkboxChecked: '#006394',
  danger: '#DC2626',
  dropdownBg: '#FFFFFF',
  dropdownBorder: '#E5E5E5',
  dropdownHover: '#F5F5F5',
  starFilled: '#FCB400',
  starEmpty: '#D1D5DB',
  avatarBg: '#8B5CF6',
  tealText: '#0D9488',
  highlightBg: '#FEF08A',
  linkPillBg: '#D5EAF4',
  linkPillText: '#00537F',
  frozenShadow: '4px 0 8px rgba(0,0,0,0.08)',
};

const DARK = {
  bg: 'hsl(220, 20%, 10%)',
  headerBg: 'hsl(220, 18%, 13%)',
  border: 'hsl(220, 15%, 25%)',
  borderStrong: 'hsl(220, 15%, 32%)',
  text: 'hsl(210, 20%, 88%)',
  textSecondary: 'hsl(210, 18%, 78%)',
  muted: 'hsl(215, 12%, 50%)',
  hoverRow: 'hsl(220, 20%, 14%)',
  groupHeaderBg: 'hsl(220, 18%, 14%)',
  primary: '#38A6D9',
  cellEditorBg: 'hsl(220, 20%, 12%)',
  cellEditorText: 'hsl(210, 20%, 92%)',
  selectedRowBg: 'hsl(200, 40%, 16%)',
  altRowBg: 'hsl(220, 20%, 11%)',
  systemText: 'hsl(215, 12%, 48%)',
  linkText: '#7CC6EA',
  checkboxChecked: '#2B8DBF',
  danger: '#EF4444',
  dropdownBg: 'hsl(220, 20%, 12%)',
  dropdownBorder: 'hsl(220, 15%, 22%)',
  dropdownHover: 'hsl(220, 20%, 15%)',
  starFilled: '#F59E0B',
  starEmpty: 'hsl(220, 15%, 28%)',
  avatarBg: '#7C3AED',
  tealText: '#2DD4BF',
  highlightBg: 'hsl(45, 80%, 25%)',
  linkPillBg: 'hsl(200, 40%, 20%)',
  linkPillText: '#9AD3EE',
  frozenShadow: '4px 0 8px rgba(0,0,0,0.3)',
};

export type GridColorTokens = typeof LIGHT;

export function useGridColors(): GridColorTokens {
  const { resolvedTheme } = useTheme();
  return useMemo(() => (resolvedTheme === 'dark' ? DARK : LIGHT), [resolvedTheme]);
}
