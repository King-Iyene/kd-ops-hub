import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import { useDatabaseUI } from '../lib/store';
import { uuidToShort, isUuid } from '../lib/shortId';
import type { IdKind } from '../lib/shortId';

function toShortParam(id: string, kind: IdKind): string {
  return isUuid(id) ? uuidToShort(id, kind) : id;
}

export function useDatabaseNavigate() {
  const navigate = useRouterNavigate();
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);

  const navigateToBase = useCallback(
    (baseId: string | null) => {
      if (baseId) {
        navigate(`/data/${toShortParam(baseId, 'base')}`);
      } else {
        navigate('/data');
      }
    },
    [navigate],
  );

  const navigateToTable = useCallback(
    (tableId: string | null) => {
      if (tableId && activeBaseId) {
        navigate(`/data/${toShortParam(activeBaseId, 'base')}/${toShortParam(tableId, 'table')}`, { replace: true });
      } else if (activeBaseId) {
        navigate(`/data/${toShortParam(activeBaseId, 'base')}`, { replace: true });
      }
    },
    [navigate, activeBaseId],
  );

  const navigateToView = useCallback(
    (viewId: string | null) => {
      if (viewId && activeTableId && activeBaseId) {
        navigate(`/data/${toShortParam(activeBaseId, 'base')}/${toShortParam(activeTableId, 'table')}/${toShortParam(viewId, 'view')}`);
      }
    },
    [navigate, activeBaseId, activeTableId],
  );

  return { navigateToBase, navigateToTable, navigateToView };
}
