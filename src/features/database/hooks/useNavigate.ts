import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import { useDatabaseUI } from '../lib/store';
import { useBases } from './useBases';
import { useTables } from './useTables';
import { useViews } from './useViews';

function findSlug(items: Array<{ id: string; slug?: string | null }> | undefined, id: string): string {
  const item = items?.find((i) => i.id === id);
  return item?.slug ?? id;
}

export function useDatabaseNavigate() {
  const navigate = useRouterNavigate();
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);
  const { data: bases } = useBases();
  const { data: tables } = useTables(activeBaseId);
  const { data: views } = useViews(activeTableId);

  const navigateToBase = useCallback(
    (baseId: string | null) => {
      if (baseId) {
        navigate(`/data/${findSlug(bases, baseId)}`);
      } else {
        navigate('/data');
      }
    },
    [navigate, bases],
  );

  const navigateToTable = useCallback(
    (tableId: string | null) => {
      if (tableId && activeBaseId) {
        const baseSlug = findSlug(bases, activeBaseId);
        const tableSlug = findSlug(tables, tableId);
        navigate(`/data/${baseSlug}/${tableSlug}`);
      } else if (activeBaseId) {
        navigate(`/data/${findSlug(bases, activeBaseId)}`);
      }
    },
    [navigate, activeBaseId, bases, tables],
  );

  const navigateToView = useCallback(
    (viewId: string | null) => {
      if (viewId && activeTableId && activeBaseId) {
        const baseSlug = findSlug(bases, activeBaseId);
        const tableSlug = findSlug(tables, activeTableId);
        const viewSlug = findSlug(views, viewId);
        navigate(`/data/${baseSlug}/${tableSlug}/${viewSlug}`);
      }
    },
    [navigate, activeBaseId, activeTableId, bases, tables, views],
  );

  return { navigateToBase, navigateToTable, navigateToView };
}
