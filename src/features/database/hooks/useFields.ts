import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta, UIType } from '../types';
import { VIRTUAL_TYPES, UI_TYPE_TO_PG_TYPE } from '../types';

function toSnakeCase(name: string): string {
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (/^[0-9]/.test(result)) {
    result = 'f_' + result;
  }
  return result.substring(0, 63);
}

export function useFields(tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'fields', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('*')
        .eq('table_id', tableId)
        .order('position');
      if (error) throw error;
      return data as FieldMeta[];
    },
  });
}

async function getTableContext(tableId: string) {
  const { data: table, error: tableError } = await supabase
    .schema('nc_meta')
    .from('tables')
    .select('pg_table_name, base_id')
    .eq('id', tableId)
    .single();
  if (tableError) throw tableError;

  const { data: base, error: baseError } = await supabase
    .schema('nc_meta')
    .from('bases')
    .select('schema_name')
    .eq('id', table.base_id)
    .single();
  if (baseError) throw baseError;

  return { pgTableName: table.pg_table_name, schemaName: base.schema_name };
}

export function useCreateField() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      table_id: string;
      name: string;
      ui_type: UIType;
      options?: Record<string, any>;
      position?: number;
      width?: number;
      is_required?: boolean;
      is_unique?: boolean;
      default_value?: string | null;
      description?: string | null;
    }) => {
      const isVirtual = VIRTUAL_TYPES.includes(input.ui_type);
      const pgColumnName = toSnakeCase(input.name);
      const pgType = UI_TYPE_TO_PG_TYPE[input.ui_type] ?? 'TEXT';

      // Insert field metadata
      const { data: field, error: insertError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert({
          table_id: input.table_id,
          name: input.name,
          pg_column_name: isVirtual ? '' : pgColumnName,
          ui_type: input.ui_type,
          pg_type: isVirtual ? '' : pgType,
          options: input.options ?? {},
          position: input.position ?? 999,
          width: input.width ?? 180,
          is_primary: false,
          is_required: input.is_required ?? false,
          is_unique: input.is_unique ?? false,
          is_system: false,
          is_hidden: false,
          description: input.description ?? null,
          default_value: input.default_value ?? null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // For non-virtual types, add the actual column
      if (!isVirtual) {
        const ctx = await getTableContext(input.table_id);

        const { data: ddlData, error: ddlError } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'addColumn',
            schemaName: ctx.schemaName,
            tableName: ctx.pgTableName,
            columnName: pgColumnName,
            columnType: pgType,
            isRequired: input.is_required ?? false,
            isUnique: input.is_unique ?? false,
          },
        });

        if (ddlError) {
          // Rollback: delete the metadata row since the DDL failed
          await supabase.schema('nc_meta').from('fields').delete().eq('id', field.id);

          // Extract the real error message from the edge function response
          let message = ddlError.message || 'Failed to create column';
          if (ddlError.context && typeof ddlError.context === 'object') {
            try {
              const body = typeof ddlError.context === 'string'
                ? JSON.parse(ddlError.context)
                : ddlError.context;
              if (body?.error) message = body.error;
            } catch { /* keep original message */ }
          }
          if (ddlData && typeof ddlData === 'object' && ddlData.error) {
            message = ddlData.error;
          }
          throw new Error(message);
        }

        // Also check the response body for non-success
        if (ddlData && typeof ddlData === 'object' && ddlData.success === false) {
          await supabase.schema('nc_meta').from('fields').delete().eq('id', field.id);
          throw new Error(ddlData.error || 'DDL execution failed');
        }
      }

      return field as FieldMeta;
    },
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: ['nc', 'fields', variables.table_id] });
      const prev = qc.getQueryData(['nc', 'fields', variables.table_id]);
      const optimistic: Partial<FieldMeta> = {
        id: `temp-${Date.now()}`,
        table_id: variables.table_id,
        name: variables.name,
        pg_column_name: toSnakeCase(variables.name),
        ui_type: variables.ui_type,
        pg_type: UI_TYPE_TO_PG_TYPE[variables.ui_type] ?? 'TEXT',
        options: variables.options ?? {},
        position: variables.position ?? 999,
        width: variables.width ?? 180,
        is_primary: false,
        is_required: false,
        is_unique: false,
        is_system: false,
        is_hidden: false,
      };
      qc.setQueryData(['nc', 'fields', variables.table_id], (old: FieldMeta[] | undefined) =>
        [...(old ?? []), optimistic as FieldMeta],
      );
      return { prev };
    },
    onError: (_err, variables, context) => {
      if (context?.prev) {
        qc.setQueryData(['nc', 'fields', variables.table_id], context.prev);
      }
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
    },
  });
}

export function useUpdateField() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      table_id: string;
      updates: Partial<Pick<FieldMeta, 'name' | 'options' | 'width' | 'is_hidden' | 'is_required' | 'is_unique' | 'description' | 'default_value' | 'position'>>;
    }) => {
      // Check if constraint flags are changing -- if so, we need DDL
      const constraintChanging =
        input.updates.is_required !== undefined || input.updates.is_unique !== undefined;

      let currentField: FieldMeta | null = null;
      if (constraintChanging) {
        const { data: f, error: fErr } = await supabase
          .schema('nc_meta')
          .from('fields')
          .select('*')
          .eq('id', input.id)
          .single();
        if (fErr) throw fErr;
        currentField = f as FieldMeta;
      }

      // Update metadata first
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('fields')
        .update(input.updates)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;

      // Apply DDL constraint changes for non-virtual fields
      if (constraintChanging && currentField && !VIRTUAL_TYPES.includes(currentField.ui_type) && currentField.pg_column_name) {
        const ctx = await getTableContext(input.table_id);

        const isRequiredChanged =
          input.updates.is_required !== undefined &&
          input.updates.is_required !== currentField.is_required;
        const isUniqueChanged =
          input.updates.is_unique !== undefined &&
          input.updates.is_unique !== currentField.is_unique;

        if (isRequiredChanged || isUniqueChanged) {
          const { data: ddlData, error: ddlError } = await supabase.functions.invoke('ddl-executor', {
            body: {
              action: 'alterColumnConstraints',
              schemaName: ctx.schemaName,
              tableName: ctx.pgTableName,
              columnName: currentField.pg_column_name,
              ...(isRequiredChanged ? { setNotNull: input.updates.is_required } : {}),
              ...(isUniqueChanged ? { setUnique: input.updates.is_unique } : {}),
            },
          });

          if (ddlError) {
            // Rollback metadata
            await supabase
              .schema('nc_meta')
              .from('fields')
              .update({
                is_required: currentField.is_required,
                is_unique: currentField.is_unique,
              })
              .eq('id', input.id);
            let message = ddlError.message || 'Failed to alter constraints';
            if (ddlData && typeof ddlData === 'object' && ddlData.error) {
              message = ddlData.error;
            }
            throw new Error(message);
          }
          if (ddlData && typeof ddlData === 'object' && ddlData.success === false) {
            await supabase
              .schema('nc_meta')
              .from('fields')
              .update({
                is_required: currentField.is_required,
                is_unique: currentField.is_unique,
              })
              .eq('id', input.id);
            throw new Error(ddlData.error || 'DDL execution failed');
          }
        }
      }

      return data as FieldMeta;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
    },
  });
}

export function useDeleteField() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; table_id: string }) => {
      const { data: field, error: fieldError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('pg_column_name, ui_type')
        .eq('id', input.id)
        .single();

      if (fieldError) throw fieldError;

      const isVirtual = VIRTUAL_TYPES.includes(field.ui_type as UIType);

      if (!isVirtual && field.pg_column_name) {
        const ctx = await getTableContext(input.table_id);

        const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'dropColumnAndMeta',
            schemaName: ctx.schemaName,
            tableName: ctx.pgTableName,
            columnName: field.pg_column_name,
            fieldId: input.id,
          },
        });

        if (ddlError) throw ddlError;
      } else {
        // Virtual field (Formula, Lookup, Rollup, Links, etc.) — route
        // through ddl-executor to bypass RLS (uses service role key).
        const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'deleteVirtualFieldMeta',
            fieldId: input.id,
          },
        });

        if (ddlError) throw ddlError;
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
    },
  });
}

export function useDuplicateField() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { table_id: string; source_field_id: string }) => {
      // Read the source field
      const { data: source, error: sourceError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('*')
        .eq('id', input.source_field_id)
        .single();

      if (sourceError) throw sourceError;

      const isVirtual = VIRTUAL_TYPES.includes(source.ui_type as UIType);
      const newName = `${source.name} (copy)`;
      const pgColumnName = isVirtual ? '' : toSnakeCase(newName);

      // Insert the duplicated field metadata
      const { data: field, error: insertError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert({
          table_id: input.table_id,
          name: newName,
          pg_column_name: pgColumnName,
          ui_type: source.ui_type,
          pg_type: source.pg_type,
          options: source.options ?? {},
          position: (source.position ?? 999) + 1,
          width: source.width ?? 180,
          is_primary: false,
          is_required: source.is_required ?? false,
          is_unique: false,
          is_system: false,
          is_hidden: false,
          description: source.description ?? null,
          default_value: source.default_value ?? null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // For non-virtual types, add the actual column
      if (!isVirtual && pgColumnName) {
        const ctx = await getTableContext(input.table_id);

        const { data: ddlData, error: ddlError } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'addColumn',
            schemaName: ctx.schemaName,
            tableName: ctx.pgTableName,
            columnName: pgColumnName,
            columnType: source.pg_type,
          },
        });

        if (ddlError) {
          await supabase.schema('nc_meta').from('fields').delete().eq('id', field.id);
          let message = ddlError.message || 'Failed to create column';
          if (ddlData && typeof ddlData === 'object' && ddlData.error) {
            message = ddlData.error;
          }
          throw new Error(message);
        }
        if (ddlData && typeof ddlData === 'object' && ddlData.success === false) {
          await supabase.schema('nc_meta').from('fields').delete().eq('id', field.id);
          throw new Error(ddlData.error || 'DDL execution failed');
        }
      }

      return field as FieldMeta;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
    },
  });
}

export function useChangeFieldType() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      table_id: string;
      newUiType: UIType;
    }) => {
      const isNewVirtual = VIRTUAL_TYPES.includes(input.newUiType);
      const newPgType = UI_TYPE_TO_PG_TYPE[input.newUiType] ?? 'TEXT';

      // Strip any DEFAULT clause from the pg type for ALTER purposes
      // (e.g. "BOOLEAN DEFAULT false" -> "BOOLEAN")
      const rawPgType = newPgType.split(/\s+DEFAULT\s+/i)[0].trim();

      // Fetch the current field
      const { data: field, error: fieldError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('*')
        .eq('id', input.id)
        .single();
      if (fieldError) throw fieldError;

      const oldUiType = field.ui_type as UIType;
      const isOldVirtual = VIRTUAL_TYPES.includes(oldUiType);

      // Cannot convert virtual <-> non-virtual
      if (isOldVirtual || isNewVirtual) {
        throw new Error('Cannot convert virtual field types.');
      }

      // Save the old metadata for rollback
      const oldMeta = {
        ui_type: field.ui_type,
        pg_type: field.pg_type,
        pg_column_name: field.pg_column_name,
        options: field.options,
      };

      // Update field metadata first
      const { error: updateError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .update({
          ui_type: input.newUiType,
          pg_type: newPgType,
        })
        .eq('id', input.id);

      if (updateError) throw updateError;

      // Execute the DDL to change the column type
      const ctx = await getTableContext(input.table_id);

      const { data: ddlData, error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: {
          action: 'alterColumnType',
          schemaName: ctx.schemaName,
          tableName: ctx.pgTableName,
          columnName: field.pg_column_name,
          newType: rawPgType,
        },
      });

      // Check for DDL failure and rollback metadata
      const ddlFailed =
        ddlError || (ddlData && typeof ddlData === 'object' && ddlData.success === false);

      if (ddlFailed) {
        // Rollback metadata
        await supabase
          .schema('nc_meta')
          .from('fields')
          .update(oldMeta)
          .eq('id', input.id);

        let message = 'Failed to change column type';
        if (ddlError?.message) message = ddlError.message;
        if (ddlData && typeof ddlData === 'object' && ddlData.error) {
          message = ddlData.error;
        }
        throw new Error(message);
      }

      return {
        field: { ...field, ui_type: input.newUiType, pg_type: newPgType } as FieldMeta,
        nulledRows: ddlData?.nulledRows ?? 0,
      };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
      // Also invalidate row data since types changed
      qc.invalidateQueries({ queryKey: ['nc', 'rows'] });
    },
  });
}

export function useReorderFields() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { table_id: string; fieldIds: string[] }) => {
      const updates = input.fieldIds.map((id, i) => ({
        id,
        table_id: input.table_id,
        position: i,
      }));

      for (const u of updates) {
        const { error } = await supabase
          .schema('nc_meta')
          .from('fields')
          .update({ position: u.position })
          .eq('id', u.id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
    },
  });
}
