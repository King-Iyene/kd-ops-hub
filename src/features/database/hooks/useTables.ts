import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TableMeta, FieldMeta, ViewMeta } from '../types';

function toSnakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 63);
}

export function useTables(baseId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'tables', baseId],
    enabled: !!baseId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('*')
        .eq('base_id', baseId)
        .order('position');
      if (error) throw error;
      return data as TableMeta[];
    },
  });
}

const SYSTEM_FIELDS: Array<{
  name: string;
  pg_column_name: string;
  ui_type: string;
  pg_type: string;
  is_primary: boolean;
  position: number;
}> = [
  { name: 'ID', pg_column_name: 'id', ui_type: 'ID', pg_type: 'UUID', is_primary: false, position: 0 },
  { name: 'Created At', pg_column_name: 'created_at', ui_type: 'CreatedTime', pg_type: 'TIMESTAMPTZ', is_primary: false, position: 1 },
  { name: 'Updated At', pg_column_name: 'updated_at', ui_type: 'LastModifiedTime', pg_type: 'TIMESTAMPTZ', is_primary: false, position: 2 },
  { name: 'Created By', pg_column_name: 'created_by', ui_type: 'CreatedBy', pg_type: 'UUID', is_primary: false, position: 3 },
  { name: 'Order', pg_column_name: 'nc_order', ui_type: 'Number', pg_type: 'NUMERIC', is_primary: false, position: 4 },
];

export function useCreateTable() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      base_id: string;
      name: string;
      icon?: string | null;
      position?: number;
    }) => {
      // 1. Get the base schema_name
      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', input.base_id)
        .single();

      if (baseError) throw baseError;

      const pgTableName = toSnakeCase(input.name);

      // 2. Insert table metadata
      const { data: table, error: tableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .insert({
          base_id: input.base_id,
          name: input.name,
          pg_table_name: pgTableName,
          icon: input.icon ?? null,
          position: input.position ?? 0,
        })
        .select()
        .single();

      if (tableError) throw tableError;

      // 3. Create the actual Postgres table via DDL
      const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: {
          action: 'createTable',
          schemaName: base.schema_name,
          tableName: pgTableName,
        },
      });

      if (ddlError) throw ddlError;

      // 4. Insert system fields
      const systemFieldRows = SYSTEM_FIELDS.map((f) => ({
        table_id: table.id,
        name: f.name,
        pg_column_name: f.pg_column_name,
        ui_type: f.ui_type,
        pg_type: f.pg_type,
        options: {},
        position: f.position,
        width: 150,
        is_primary: f.is_primary,
        is_required: f.pg_column_name === 'id',
        is_unique: f.pg_column_name === 'id',
        is_system: true,
        is_hidden: true,
      }));

      const { data: fields, error: fieldsError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert(systemFieldRows)
        .select();

      if (fieldsError) throw fieldsError;

      // 4b. Create default user fields (like Airtable: Name, Notes, Status, Attachments)
      const defaultUserFields = [
        { name: 'Name', pg_column_name: 'name', ui_type: 'SingleLineText', pg_type: 'TEXT', position: SYSTEM_FIELDS.length, width: 250, options: {}, is_primary: true },
        { name: 'Notes', pg_column_name: 'notes', ui_type: 'LongText', pg_type: 'TEXT', position: SYSTEM_FIELDS.length + 1, width: 200, options: {}, is_primary: false },
        { name: 'Status', pg_column_name: 'status', ui_type: 'SingleSelect', pg_type: 'TEXT', position: SYSTEM_FIELDS.length + 2, width: 150, options: { choices: [
          { title: 'Todo', color: 'gray' },
          { title: 'In Progress', color: 'blue' },
          { title: 'Done', color: 'green' },
        ] }, is_primary: false },
        { name: 'Attachments', pg_column_name: 'attachments', ui_type: 'Attachment', pg_type: 'JSONB', position: SYSTEM_FIELDS.length + 3, width: 180, options: {}, is_primary: false },
      ];

      for (const uf of defaultUserFields) {
        await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'addColumn',
            schemaName: base.schema_name,
            tableName: pgTableName,
            columnName: uf.pg_column_name,
            columnType: uf.pg_type,
          },
        });
      }

      const userFieldRows = defaultUserFields.map((uf) => ({
        table_id: table.id,
        name: uf.name,
        pg_column_name: uf.pg_column_name,
        ui_type: uf.ui_type,
        pg_type: uf.pg_type,
        options: uf.options,
        position: uf.position,
        width: uf.width,
        is_primary: uf.is_primary,
        is_required: false,
        is_unique: false,
        is_system: false,
        is_hidden: false,
      }));

      const { data: userFields } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert(userFieldRows)
        .select();

      const allFields = [...(fields as FieldMeta[]), ...((userFields as FieldMeta[]) ?? [])];

      // Set primary_field_id to the Name field
      const primaryField = (userFields as FieldMeta[])?.find((f) => f.is_primary);
      if (primaryField) {
        await supabase
          .schema('nc_meta')
          .from('tables')
          .update({ primary_field_id: primaryField.id })
          .eq('id', table.id);
      }

      // 4c. Create 3 empty default rows
      for (let i = 0; i < 3; i++) {
        await supabase
          .schema(base.schema_name)
          .from(pgTableName)
          .insert({ nc_order: i + 1 });
      }

      // 5. Create default grid view
      const { error: viewError } = await supabase
        .schema('nc_meta')
        .from('views')
        .insert({
          table_id: table.id,
          name: 'Grid view',
          type: 'grid',
          filters: [],
          sorts: [],
          groups: [],
          field_order: allFields.map((f) => f.id),
          field_visibility: {},
          field_widths: {},
          is_default: true,
          is_locked: false,
          position: 0,
        });

      if (viewError) throw viewError;

      return table as TableMeta;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'tables', variables.base_id] });
      qc.invalidateQueries({ queryKey: ['nc', 'fields'] });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount'] });
    },
  });
}

export function useUpdateTable() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; baseId: string; name?: string; icon?: string | null; position?: number }) => {
      const updates: Record<string, any> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.position !== undefined) updates.position = input.position;

      if (input.name !== undefined) {
        const newPgName = toSnakeCase(input.name);
        updates.pg_table_name = newPgName;

        const { data: oldTable } = await supabase
          .schema('nc_meta')
          .from('tables')
          .select('pg_table_name')
          .eq('id', input.id)
          .single();

        const { data: base } = await supabase
          .schema('nc_meta')
          .from('bases')
          .select('schema_name')
          .eq('id', input.baseId)
          .single();

        if (oldTable && base && oldTable.pg_table_name !== newPgName) {
          await supabase.functions.invoke('ddl-executor', {
            body: {
              action: 'renameTable',
              schemaName: base.schema_name,
              oldName: oldTable.pg_table_name,
              newName: newPgName,
            },
          });
        }
      }

      const { data, error } = await supabase
        .schema('nc_meta')
        .from('tables')
        .update(updates)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data as TableMeta;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'tables', variables.baseId] });
    },
  });
}

export function useDeleteTable() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { tableId: string; baseId: string }) => {
      // Get table and base info
      const { data: table, error: tableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name, base_id')
        .eq('id', input.tableId)
        .single();

      if (tableError) throw tableError;

      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', table.base_id)
        .single();

      if (baseError) throw baseError;

      // Drop the actual table
      const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: {
          action: 'dropTable',
          schemaName: base.schema_name,
          tableName: table.pg_table_name,
        },
      });

      if (ddlError) throw ddlError;

      // Delete views, fields, then table metadata
      await supabase.schema('nc_meta').from('views').delete().eq('table_id', input.tableId);
      await supabase.schema('nc_meta').from('fields').delete().eq('table_id', input.tableId);

      const { error: deleteError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .delete()
        .eq('id', input.tableId);

      if (deleteError) throw deleteError;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'tables', variables.baseId] });
      qc.invalidateQueries({ queryKey: ['nc', 'fields'] });
      qc.invalidateQueries({ queryKey: ['nc', 'views'] });
    },
  });
}

const SYSTEM_UI_TYPES = new Set(['ID', 'CreatedTime', 'LastModifiedTime', 'CreatedBy']);

export function useDuplicateTable() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      base_id: string;
      table_id: string;
      name: string;
    }) => {
      // 1. Read source table's fields
      const { data: sourceFields, error: fieldsError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('*')
        .eq('table_id', input.table_id)
        .order('position');

      if (fieldsError) throw fieldsError;

      // 2. Get the base schema_name
      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', input.base_id)
        .single();

      if (baseError) throw baseError;

      const pgTableName = toSnakeCase(input.name);

      // 3. Insert table metadata
      const { data: table, error: tableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .insert({
          base_id: input.base_id,
          name: input.name,
          pg_table_name: pgTableName,
          icon: null,
          position: 0,
        })
        .select()
        .single();

      if (tableError) throw tableError;

      // 4. Create the actual Postgres table via DDL
      const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: {
          action: 'createTable',
          schemaName: base.schema_name,
          tableName: pgTableName,
        },
      });

      if (ddlError) throw ddlError;

      // 5. Insert system fields (auto-created by createTable DDL)
      const systemFieldRows = SYSTEM_FIELDS.map((f) => ({
        table_id: table.id,
        name: f.name,
        pg_column_name: f.pg_column_name,
        ui_type: f.ui_type,
        pg_type: f.pg_type,
        options: {},
        position: f.position,
        width: 150,
        is_primary: false,
        is_required: f.pg_column_name === 'id',
        is_unique: f.pg_column_name === 'id',
        is_system: true,
        is_hidden: true,
      }));

      const { data: sysFields, error: sysFieldsError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert(systemFieldRows)
        .select();

      if (sysFieldsError) throw sysFieldsError;

      // 6. Copy non-system fields from source
      const userFields = (sourceFields as FieldMeta[]).filter(
        (f) => !f.is_system && !SYSTEM_UI_TYPES.has(f.ui_type),
      );

      let allFields = sysFields as FieldMeta[];

      if (userFields.length > 0) {
        const userFieldRows = userFields.map((f, idx) => ({
          table_id: table.id,
          name: f.name,
          pg_column_name: f.pg_column_name,
          ui_type: f.ui_type,
          pg_type: f.pg_type,
          options: f.options ?? {},
          position: SYSTEM_FIELDS.length + idx,
          width: f.width,
          is_primary: f.is_primary,
          is_required: f.is_required,
          is_unique: f.is_unique,
          is_system: false,
          is_hidden: f.is_hidden,
          description: f.description,
          default_value: f.default_value,
        }));

        // Add columns via DDL for each user field
        for (const field of userFieldRows) {
          const { error: colError } = await supabase.functions.invoke('ddl-executor', {
            body: {
              action: 'addColumn',
              schemaName: base.schema_name,
              tableName: pgTableName,
              columnName: field.pg_column_name,
              columnType: field.pg_type,
            },
          });
          if (colError) throw colError;
        }

        const { data: copiedFields, error: copyError } = await supabase
          .schema('nc_meta')
          .from('fields')
          .insert(userFieldRows)
          .select();

        if (copyError) throw copyError;
        allFields = [...allFields, ...(copiedFields as FieldMeta[])];

        const primaryField = (copiedFields as FieldMeta[]).find((f) => f.is_primary);
        if (primaryField) {
          await supabase
            .schema('nc_meta')
            .from('tables')
            .update({ primary_field_id: primaryField.id })
            .eq('id', table.id);
        }
      }

      // 7. Create default grid view
      const { error: viewError } = await supabase
        .schema('nc_meta')
        .from('views')
        .insert({
          table_id: table.id,
          name: 'Grid view',
          type: 'grid',
          filters: [],
          sorts: [],
          groups: [],
          field_order: allFields.map((f) => f.id),
          field_visibility: {},
          field_widths: {},
          is_default: true,
          is_locked: false,
          position: 0,
        });

      if (viewError) throw viewError;

      return table as TableMeta;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'tables', variables.base_id] });
      qc.invalidateQueries({ queryKey: ['nc', 'fields'] });
    },
  });
}

