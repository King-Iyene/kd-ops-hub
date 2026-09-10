import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import GridView from '../components/grid/GridView';
import FormView from '../components/views/FormView';
import type { FieldMeta, RecordRow, ViewMeta } from '../types';

export default function SharedViewPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 500;

  const sharedViewQuery = useQuery({
    queryKey: ['shared_view_public', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .select(
          'id, view_id, table_id, share_token, is_enabled, allow_csv_download, is_password_protected, created_at, view:view_id(*, table:table_id(*, base:base_id(*)))',
        )
        .eq('share_token', token)
        .eq('is_enabled', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sharedView = sharedViewQuery.data;
  const view = sharedView?.view as (ViewMeta & { table: any }) | undefined;
  const table = view?.table as any;
  const base = table?.base as any;

  const needsPassword = !!sharedView?.is_password_protected && !passwordVerified;

  const verifyPassword = useMutation({
    mutationFn: async (candidate: string) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .rpc('verify_shared_view_password', { p_share_token: token, p_password: candidate });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: (isCorrect) => {
      setPasswordVerified(isCorrect);
    },
  });

  const fieldsQuery = useQuery({
    queryKey: ['shared_fields', sharedView?.table_id],
    enabled: !!sharedView?.table_id && !needsPassword,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('*')
        .eq('table_id', sharedView!.table_id)
        .order('position');
      if (error) throw error;
      return data as FieldMeta[];
    },
  });

  const recordsCountQuery = useQuery({
    queryKey: ['shared_records_count', base?.schema_name, table?.pg_table_name],
    enabled: !!base?.schema_name && !!table?.pg_table_name && !needsPassword && view?.type !== 'form',
    queryFn: async () => {
      const { count, error } = await supabase
        .schema(base!.schema_name)
        .from(table!.pg_table_name)
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const recordsQuery = useQuery({
    queryKey: ['shared_records', base?.schema_name, table?.pg_table_name, page],
    enabled: !!base?.schema_name && !!table?.pg_table_name && !needsPassword && view?.type !== 'form',
    queryFn: async () => {
      const { data, error } = await supabase
        .schema(base!.schema_name)
        .from(table!.pg_table_name)
        .select('*')
        .order('nc_order', { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      return data as RecordRow[];
    },
  });

  const addRowMutation = useMutation({
    mutationFn: async (record: Record<string, any>) => {
      if (!base?.schema_name || !table?.pg_table_name) throw new Error('Missing table info');
      const { error } = await supabase
        .schema(base.schema_name)
        .from(table.pg_table_name)
        .insert(record);
      if (error) throw error;
    },
  });

  const fields = fieldsQuery.data ?? [];
  const records = recordsQuery.data ?? [];
  const totalCount = recordsCountQuery.data ?? records.length;

  const visibleFields = useMemo(() => {
    if (!view?.field_order?.length) return fields.filter((f) => !f.is_system && !f.is_hidden);
    const order = view.field_order as string[];
    const hidden = view.field_visibility ?? {};
    return order
      .map((id: string) => fields.find((f) => f.id === id))
      .filter((f): f is FieldMeta => !!f && !hidden[f.id] && !f.is_system && !f.is_hidden);
  }, [fields, view]);

  if (sharedViewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAFAFA] dark:bg-[hsl(200,30%,6%)]">
        <div className="animate-spin h-8 w-8 border-2 border-[#2D7FF9] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sharedView) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAFAFA] dark:bg-[hsl(200,30%,6%)]">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#374151] dark:text-[hsl(200,25%,88%)] mb-2">View not found</h1>
          <p className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]">This shared view may have been disabled or deleted.</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAFAFA] dark:bg-[hsl(200,30%,6%)]">
        <div className="bg-white dark:bg-[hsl(200,30%,8%)] rounded-xl shadow-lg p-8 w-[360px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
          <h2 className="text-lg font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] mb-4">This view is password protected</h2>
          <form onSubmit={(e) => { e.preventDefault(); verifyPassword.mutate(password); }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] mb-3"
            />
            <button
              type="submit"
              disabled={verifyPassword.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: '#2D7FF9' }}
            >
              Submit
            </button>
            {verifyPassword.isSuccess && !verifyPassword.data && (
              <p className="text-destructive text-xs mt-2">Incorrect password</p>
            )}
            {verifyPassword.isError && (
              <p className="text-destructive text-xs mt-2">Something went wrong. Please try again.</p>
            )}
          </form>
        </div>
      </div>
    );
  }

  if (view?.type === 'form') {
    return (
      <div className="h-screen flex flex-col bg-[#F8FAFC] dark:bg-[hsl(220,20%,7%)]">
        <FormView
          fields={fields}
          onAddRow={(record) => addRowMutation.mutate(record)}
          isLoading={addRowMutation.isPending}
          view={view}
          isPublic
          publicToken={token}
          publicPassword={passwordVerified ? password : undefined}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-[hsl(200,30%,6%)]">
      <header className="flex items-center h-11 px-4 bg-white dark:bg-[hsl(200,30%,8%)] border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] shrink-0">
        <span className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
          {view?.name ?? 'Shared View'}
        </span>
      </header>
      <div className="flex-1 overflow-hidden">
        <GridView
          fields={visibleFields}
          records={records}
          totalCount={totalCount}
          isLoading={recordsQuery.isLoading}
          onCellUpdate={() => {}}
          onAddRow={() => {}}
          onAddField={() => {}}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
