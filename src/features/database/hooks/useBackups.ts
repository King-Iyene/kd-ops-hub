import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Base, TableMeta, FieldMeta, ViewMeta } from '../types';

export interface Snapshot {
  id: string;
  base_id: string;
  name: string;
  description: string | null;
  metadata: {
    tables: Array<{
      table: TableMeta;
      fields: FieldMeta[];
      views: ViewMeta[];
      rowCount: number;
    }>;
  };
  data: Record<string, Record<string, unknown>[]>;
  created_at: string;
  created_by: string | null;
}

export function useSnapshots(baseId: string | undefined) {
  return useQuery({
    queryKey: ['nc', 'snapshots', baseId],
    enabled: !!baseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('snapshots')
        .select('id, base_id, name, description, created_at, created_by')
        .eq('base_id', baseId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Pick<Snapshot, 'id' | 'base_id' | 'name' | 'description' | 'created_at' | 'created_by'>[];
    },
  });
}

export function useCreateSnapshot() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      baseId,
      name,
      description,
    }: {
      baseId: string;
      name: string;
      description?: string;
    }) => {
      const { data: base, error: baseErr } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('*')
        .eq('id', baseId)
        .single();
      if (baseErr) throw baseErr;

      const { data: tables, error: tblErr } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('*')
        .eq('base_id', baseId)
        .order('position');
      if (tblErr) throw tblErr;

      const metadata: Snapshot['metadata'] = { tables: [] };
      const data: Snapshot['data'] = {};

      for (const table of (tables as TableMeta[]) ?? []) {
        const { data: fields } = await supabase
          .schema('nc_meta')
          .from('fields')
          .select('*')
          .eq('table_id', table.id)
          .order('position');

        const { data: views } = await supabase
          .schema('nc_meta')
          .from('views')
          .select('*')
          .eq('table_id', table.id)
          .order('position');

        const schemaName = (base as Base).schema_name;
        const { data: rows, error: rowErr } = await supabase
          .schema(schemaName)
          .from(table.pg_table_name)
          .select('*')
          .limit(50000);

        const rowData = rowErr ? [] : (rows ?? []);

        metadata.tables.push({
          table,
          fields: (fields ?? []) as FieldMeta[],
          views: (views ?? []) as ViewMeta[],
          rowCount: rowData.length,
        });

        data[table.id] = rowData as Record<string, unknown>[];
      }

      const { data: user } = await supabase.auth.getUser();

      const { data: snapshot, error: snapErr } = await supabase
        .schema('nc_meta')
        .from('snapshots')
        .insert({
          base_id: baseId,
          name,
          description: description || null,
          metadata,
          data,
          created_by: user.user?.id ?? null,
        })
        .select()
        .single();

      if (snapErr) throw snapErr;
      return snapshot as Snapshot;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['nc', 'snapshots', vars.baseId] });
    },
  });
}

export function useRestoreSnapshot() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const { data: snapshot, error: snapErr } = await supabase
        .schema('nc_meta')
        .from('snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (snapErr) throw snapErr;
      const snap = snapshot as Snapshot;

      const { data: base, error: baseErr } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('*')
        .eq('id', snap.base_id)
        .single();
      if (baseErr) throw baseErr;
      const schemaName = (base as Base).schema_name;

      // Delete existing tables in the base
      const { data: existingTables } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('id, pg_table_name')
        .eq('base_id', snap.base_id);

      for (const t of (existingTables ?? []) as { id: string; pg_table_name: string }[]) {
        await supabase.functions.invoke('ddl-executor', {
          body: { action: 'dropTable', schemaName, tableName: t.pg_table_name },
        });
        await supabase.schema('nc_meta').from('fields').delete().eq('table_id', t.id);
        await supabase.schema('nc_meta').from('views').delete().eq('table_id', t.id);
      }
      await supabase.schema('nc_meta').from('tables').delete().eq('base_id', snap.base_id);

      // Recreate tables from snapshot
      for (const entry of snap.metadata.tables) {
        const { table, fields, views } = entry;
        const pgTableName = table.pg_table_name;

        // Create Postgres table
        await supabase.functions.invoke('ddl-executor', {
          body: { action: 'createTable', schemaName, tableName: pgTableName },
        });

        // Insert table metadata
        const { data: newTable, error: tblInsErr } = await supabase
          .schema('nc_meta')
          .from('tables')
          .insert({
            base_id: snap.base_id,
            name: table.name,
            pg_table_name: pgTableName,
            icon: table.icon,
            position: table.position,
            primary_field_id: null,
          })
          .select()
          .single();
        if (tblInsErr) throw tblInsErr;
        const newTableId = (newTable as TableMeta).id;

        // Create DDL columns and field metadata
        const fieldInserts = fields.map((f) => ({
          table_id: newTableId,
          name: f.name,
          pg_column_name: f.pg_column_name,
          ui_type: f.ui_type,
          pg_type: f.pg_type,
          options: f.options,
          position: f.position,
          width: f.width,
          is_primary: f.is_primary,
          is_required: f.is_required,
          is_unique: f.is_unique,
          is_system: f.is_system,
          is_hidden: f.is_hidden,
          description: f.description,
          default_value: f.default_value,
        }));

        const { data: newFields } = await supabase
          .schema('nc_meta')
          .from('fields')
          .insert(fieldInserts)
          .select();

        // Set primary_field_id
        const primary = (newFields as FieldMeta[] | null)?.find((f) => f.is_primary);
        if (primary) {
          await supabase
            .schema('nc_meta')
            .from('tables')
            .update({ primary_field_id: primary.id })
            .eq('id', newTableId);
        }

        // Add columns via DDL
        for (const f of fields) {
          if (!f.is_system && f.pg_type) {
            await supabase.functions.invoke('ddl-executor', {
              body: {
                action: 'addColumn',
                schemaName,
                tableName: pgTableName,
                columnName: f.pg_column_name,
                columnType: f.pg_type,
              },
            });
          }
        }

        // Insert view metadata
        if (views.length > 0) {
          const viewInserts = views.map((v) => ({
            table_id: newTableId,
            name: v.name,
            type: v.type,
            filters: v.filters,
            sorts: v.sorts,
            groups: v.groups,
            field_order: v.field_order,
            field_visibility: v.field_visibility,
            field_widths: v.field_widths,
            is_default: v.is_default,
            is_locked: v.is_locked,
            position: v.position,
          }));
          await supabase.schema('nc_meta').from('views').insert(viewInserts);
        }

        // Restore row data
        const rows = snap.data[table.id] ?? [];
        if (rows.length > 0) {
          const batchSize = 500;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            await supabase.schema(schemaName).from(pgTableName).insert(batch);
          }
        }
      }

      return snap;
    },
    onSuccess: (snap) => {
      qc.invalidateQueries({ queryKey: ['nc', 'bases'] });
      qc.invalidateQueries({ queryKey: ['nc', 'tables', snap.base_id] });
      qc.invalidateQueries({ queryKey: ['nc', 'snapshots', snap.base_id] });
    },
  });
}

export function useDeleteSnapshot() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ snapshotId, baseId }: { snapshotId: string; baseId: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('snapshots')
        .delete()
        .eq('id', snapshotId);
      if (error) throw error;
      return baseId;
    },
    onSuccess: (baseId) => {
      qc.invalidateQueries({ queryKey: ['nc', 'snapshots', baseId] });
    },
  });
}

export function useExportBase() {
  return useMutation({
    mutationFn: async (baseId: string) => {
      const { data: base, error: baseErr } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('*')
        .eq('id', baseId)
        .single();
      if (baseErr) throw baseErr;

      const { data: tables } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('*')
        .eq('base_id', baseId)
        .order('position');

      const exportData: {
        version: number;
        base: Base;
        tables: Array<{
          table: TableMeta;
          fields: FieldMeta[];
          views: ViewMeta[];
          rows: Record<string, unknown>[];
        }>;
        exportedAt: string;
      } = {
        version: 1,
        base: base as Base,
        tables: [],
        exportedAt: new Date().toISOString(),
      };

      for (const table of (tables as TableMeta[]) ?? []) {
        const { data: fields } = await supabase
          .schema('nc_meta')
          .from('fields')
          .select('*')
          .eq('table_id', table.id)
          .order('position');

        const { data: views } = await supabase
          .schema('nc_meta')
          .from('views')
          .select('*')
          .eq('table_id', table.id)
          .order('position');

        const schemaName = (base as Base).schema_name;
        const { data: rows } = await supabase
          .schema(schemaName)
          .from(table.pg_table_name)
          .select('*')
          .limit(50000);

        exportData.tables.push({
          table,
          fields: (fields ?? []) as FieldMeta[],
          views: (views ?? []) as ViewMeta[],
          rows: (rows ?? []) as Record<string, unknown>[],
        });
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(base as Base).name.replace(/[^a-zA-Z0-9]/g, '_')}_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      return exportData;
    },
  });
}
