import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Base, TableMeta, FieldMeta, ViewMeta } from '../types';

export function useDuplicateBase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sourceBaseId: string) => {
      // 1. Fetch the source base
      const { data: sourceBase, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('*')
        .eq('id', sourceBaseId)
        .single();

      if (baseError) throw baseError;
      const src = sourceBase as Base;

      // 2. Create a new base with "(copy)" suffix
      const newName = `${src.name} (copy)`;
      const schemaName = `nc_${newName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 63)}_${Date.now()}`;

      const { data: newBase, error: insertError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .insert({
          workspace_id: src.workspace_id,
          name: newName,
          schema_name: schemaName,
          icon: src.icon,
          color: src.color,
          position: src.position + 1,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 3. Create the Postgres schema
      const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: { action: 'createSchema', schemaName },
      });

      if (ddlError) throw ddlError;

      const { error: exposeError } = await supabase.functions.invoke('ddl-executor', {
        body: { action: 'exposeSchema', schemaName },
      });

      if (exposeError) throw exposeError;

      // 4. Fetch all tables from the source base
      const { data: sourceTables, error: tablesError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('*')
        .eq('base_id', sourceBaseId)
        .order('position');

      if (tablesError) throw tablesError;

      // 5. Duplicate each table (metadata, DDL, fields, views)
      for (const srcTable of (sourceTables as TableMeta[]) ?? []) {
        const pgTableName = `${srcTable.pg_table_name}_${Date.now()}`;

        // Insert table metadata
        const { data: newTable, error: tblErr } = await supabase
          .schema('nc_meta')
          .from('tables')
          .insert({
            base_id: (newBase as Base).id,
            name: srcTable.name,
            pg_table_name: pgTableName,
            icon: srcTable.icon,
            position: srcTable.position,
          })
          .select()
          .single();

        if (tblErr) throw tblErr;

        // Create the Postgres table
        await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'createTable',
            schemaName,
            tableName: pgTableName,
          },
        });

        // Fetch and duplicate fields
        const { data: srcFields } = await supabase
          .schema('nc_meta')
          .from('fields')
          .select('*')
          .eq('table_id', srcTable.id)
          .order('position');

        if (srcFields && srcFields.length > 0) {
          const fieldRows = (srcFields as FieldMeta[]).map((f) => ({
            table_id: (newTable as TableMeta).id,
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
            .insert(fieldRows)
            .select();

          // Set primary_field_id
          const primaryField = (newFields as FieldMeta[] | null)?.find((f) => f.is_primary);
          if (primaryField) {
            await supabase
              .schema('nc_meta')
              .from('tables')
              .update({ primary_field_id: primaryField.id })
              .eq('id', (newTable as TableMeta).id);
          }

          // Add non-system columns via DDL
          for (const f of srcFields as FieldMeta[]) {
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
        }

        // Fetch and duplicate views
        const { data: srcViews } = await supabase
          .schema('nc_meta')
          .from('views')
          .select('*')
          .eq('table_id', srcTable.id)
          .order('position');

        if (srcViews && srcViews.length > 0) {
          const viewRows = (srcViews as ViewMeta[]).map((v) => ({
            table_id: (newTable as TableMeta).id,
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

          await supabase
            .schema('nc_meta')
            .from('views')
            .insert(viewRows);
        }
      }

      return newBase as Base;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nc', 'bases'] });
    },
  });
}
