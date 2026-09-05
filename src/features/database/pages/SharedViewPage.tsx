import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import GridView from '../components/grid/GridView';
import type { FieldMeta, RecordRow } from '../types';

export default function SharedViewPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [enteredPassword, setEnteredPassword] = useState<string | null>(null);

  const sharedViewQuery = useQuery({
    queryKey: ['shared_view_public', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .select('*, view:view_id(*, table:table_id(*, base:base_id(*)))')
        .eq('share_token', token)
        .eq('is_enabled', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sharedView = sharedViewQuery.data;
  const view = sharedView?.view as any;
  const table = view?.table as any;
  const base = table?.base as any;

  const needsPassword = sharedView?.password && enteredPassword !== sharedView.password;

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

  const recordsQuery = useQuery({
    queryKey: ['shared_records', base?.schema_name, table?.pg_table_name],
    enabled: !!base?.schema_name && !!table?.pg_table_name && !needsPassword,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema(base!.schema_name)
        .from(table!.pg_table_name)
        .select('*')
        .order('nc_order', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data as RecordRow[];
    },
  });

  const fields = fieldsQuery.data ?? [];
  const records = recordsQuery.data ?? [];

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
          <form onSubmit={(e) => { e.preventDefault(); setEnteredPassword(password); }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] mb-3"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: '#2D7FF9' }}
            >
              Submit
            </button>
            {enteredPassword !== null && <p className="text-red-500 text-xs mt-2">Incorrect password</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-[hsl(200,30%,6%)]">
      <header className="flex items-center h-11 px-4 bg-white dark:bg-[hsl(200,30%,8%)] border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] shrink-0">
        <span className="text-[14px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
          {view?.name ?? 'Shared View'}
        </span>
      </header>
      <div className="flex-1 overflow-hidden">
        <GridView
          fields={visibleFields}
          records={records}
          totalCount={records.length}
          isLoading={recordsQuery.isLoading}
          onCellUpdate={() => {}}
          onAddRow={() => {}}
        />
      </div>
    </div>
  );
}
