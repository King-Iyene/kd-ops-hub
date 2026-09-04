import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import { useDatabaseUI } from '../lib/store';
import { uuidToShort } from '../lib/shortId';

export function useDatabaseNavigate() {
  const navigate = useRouterNavigate();
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);

  const navigateToBase = useCallback(
    (baseId: string | null) => {
      if (baseId) {
        navigate(`/data/${uuidToShort(baseId)}`);
      } else {
        navigate('/data');
      }
    },
    [navigate],
  );

  const navigateToTable = useCallback(
    (tableId: string | null) => {
      if (tableId && activeBaseId) {
        navigate(`/data/${uuidToShort(activeBaseId)}/${uuidToShort(tableId)}`);
      } else if (activeBaseId) {
        navigate(`/data/${uuidToShort(activeBaseId)}`);
      }
    },
    [navigate, activeBaseId],
  );

  return { navigateToBase, navigateToTable };
}
