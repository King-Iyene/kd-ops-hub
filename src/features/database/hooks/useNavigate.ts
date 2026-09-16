import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import { useDatabaseUI } from '../lib/store';
import { uuidToShort, isUuid } from '../lib/shortId';

export function toShort(id: string): string {
  return isUuid(id) ? uuidToShort(id) : id;
}

export function useDatabaseNavigate() {
  const navigate = useRouterNavigate();
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

  const navigateToBase = useCallback(
    (baseId: string | null) => {
      if (baseId) {
        navigate(`/data/${toShort(baseId)}`);
      } else {
        navigate('/data');
      }
    },
    [navigate],
  );

  const navigateToTable = useCallback(
    (tableId: string | null) => {
      if (tableId && activeBaseId) {
        navigate(`/data/${toShort(activeBaseId)}/${toShort(tableId)}`, { replace: true });
      } else if (activeBaseId) {
        navigate(`/data/${toShort(activeBaseId)}`, { replace: true });
      }
    },
    [navigate, activeBaseId],
  );

  const navigateToView = useCallback(
    (viewId: string | null) => {
      if (viewId && activeTableId && activeBaseId) {
        navigate(`/data/${toShort(activeBaseId)}/${toShort(activeTableId)}/${toShort(viewId)}`);
      }
    },
    [navigate, activeBaseId, activeTableId],
  );

  return { navigateToBase, navigateToTable, navigateToView };
}
