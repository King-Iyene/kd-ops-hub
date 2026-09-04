import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import { useDatabaseUI } from '../lib/store';

export function useDatabaseNavigate() {
  const navigate = useRouterNavigate();
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);

  const navigateToBase = useCallback(
    (baseId: string | null) => {
      if (baseId) {
        navigate(`/data/${baseId}`);
      } else {
        navigate('/data');
      }
    },
    [navigate],
  );

  const navigateToTable = useCallback(
    (tableId: string | null) => {
      if (tableId && activeBaseId) {
        navigate(`/data/${activeBaseId}/${tableId}`);
      } else if (activeBaseId) {
        navigate(`/data/${activeBaseId}`);
      }
    },
    [navigate, activeBaseId],
  );

  return { navigateToBase, navigateToTable };
}
