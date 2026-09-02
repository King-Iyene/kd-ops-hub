import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta } from '../types';

export interface LinkMeta {
  id: string;
  field_id: string;
  related_table_id: string;
  related_field_id: string | null;
  junction_table_id: string | null;
  type: 'hm' | 'bt' | 'mm';
  created_at: string;
  field_name: string;
  related_table_name: string;
}

export function useLinks(tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'links', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      // Get all fields of type Links for this table
      const { data: fields, error: fieldsError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('id, name')
        .eq('table_id', tableId)
        .eq('ui_type', 'Links');

      if (fieldsError) throw fieldsError;
      if (!fields || fields.length === 0) return [] as LinkMeta[];

      const fieldIds = fields.map((f: { id: string }) => f.id);

      const { data: links, error: linksError } = await supabase
        .schema('nc_meta')
        .from('links')
        .select('*')
        .in('field_id', fieldIds);

      if (linksError) throw linksError;
      if (!links || links.length === 0) return [] as LinkMeta[];

      // Get related table names
      const tableIds = [...new Set(links.map((l: any) => l.related_table_id))];
      const { data: tables, error: tablesError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('id, name')
        .in('id', tableIds);

      if (tablesError) throw tablesError;

      const tableNameMap = new Map((tables ?? []).map((t: any) => [t.id, t.name]));
      const fieldNameMap = new Map(fields.map((f: { id: string; name: string }) => [f.id, f.name]));

      return links.map((l: any) => ({
        id: l.id,
        field_id: l.field_id,
        related_table_id: l.related_table_id,
        related_field_id: l.related_field_id,
        junction_table_id: l.junction_table_id,
        type: l.type,
        created_at: l.created_at,
        field_name: fieldNameMap.get(l.field_id) ?? '',
        related_table_name: tableNameMap.get(l.related_table_id) ?? '',
      })) as LinkMeta[];
    },
  });
}

function toSnakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 63);
}

export function useCreateLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      sourceTableId: string;
      targetTableId: string;
      linkName: string;
      type: 'hm' | 'bt' | 'mm';
      baseId: string;
    }) => {
      const { sourceTableId, targetTableId, linkName, type, baseId } = input;

      // Get target table name for reverse link naming
      const { data: targetTable, error: targetTableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('name, pg_table_name')
        .eq('id', targetTableId)
        .single();
      if (targetTableError) throw targetTableError;

      const { data: sourceTable, error: sourceTableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('name, pg_table_name')
        .eq('id', sourceTableId)
        .single();
      if (sourceTableError) throw sourceTableError;

      // 1. Create the Link field on the source table
      const { data: sourceField, error: sfError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert({
          table_id: sourceTableId,
          name: linkName,
          pg_column_name: '',
          ui_type: 'Links',
          pg_type: '',
          options: { relatedTableId: targetTableId, type },
          position: 999,
          width: 180,
          is_primary: false,
          is_required: false,
          is_unique: false,
          is_system: false,
          is_hidden: false,
        })
        .select()
        .single();
      if (sfError) throw sfError;

      // 2. Create reverse Link field on the target table
      const reverseType = type === 'hm' ? 'bt' : type === 'bt' ? 'hm' : 'mm';
      const reverseName = sourceTable.name;

      const { data: targetField, error: tfError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert({
          table_id: targetTableId,
          name: reverseName,
          pg_column_name: '',
          ui_type: 'Links',
          pg_type: '',
          options: { relatedTableId: sourceTableId, type: reverseType },
          position: 999,
          width: 180,
          is_primary: false,
          is_required: false,
          is_unique: false,
          is_system: false,
          is_hidden: false,
        })
        .select()
        .single();
      if (tfError) throw tfError;

      // Update options with cross-references
      await supabase
        .schema('nc_meta')
        .from('fields')
        .update({ options: { relatedTableId: targetTableId, type, linkFieldId: targetField.id } })
        .eq('id', sourceField.id);

      await supabase
        .schema('nc_meta')
        .from('fields')
        .update({ options: { relatedTableId: sourceTableId, type: reverseType, linkFieldId: sourceField.id } })
        .eq('id', targetField.id);

      // 3. For many-to-many, create a junction table
      let junctionTableId: string | null = null;

      if (type === 'mm') {
        const { data: base, error: baseError } = await supabase
          .schema('nc_meta')
          .from('bases')
          .select('schema_name')
          .eq('id', baseId)
          .single();
        if (baseError) throw baseError;

        const junctionName = `${sourceTable.pg_table_name}_${targetTable.pg_table_name}_mm`;

        // Create junction table metadata
        const { data: junctionTable, error: jtError } = await supabase
          .schema('nc_meta')
          .from('tables')
          .insert({
            base_id: baseId,
            name: `${sourceTable.name}_${targetTable.name}_mm`,
            pg_table_name: junctionName,
            icon: null,
            position: 999,
          })
          .select()
          .single();
        if (jtError) throw jtError;

        junctionTableId = junctionTable.id;

        // Create the actual junction table via DDL
        const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'createTable',
            schemaName: base.schema_name,
            tableName: junctionName,
          },
        });
        if (ddlError) throw ddlError;

        // Add FK columns to junction table
        const { error: ddlFk1 } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'addColumn',
            schemaName: base.schema_name,
            tableName: junctionName,
            columnName: `${sourceTable.pg_table_name}_id`,
            columnType: 'UUID',
          },
        });
        if (ddlFk1) throw ddlFk1;

        const { error: ddlFk2 } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'addColumn',
            schemaName: base.schema_name,
            tableName: junctionName,
            columnName: `${targetTable.pg_table_name}_id`,
            columnType: 'UUID',
          },
        });
        if (ddlFk2) throw ddlFk2;
      } else if (type === 'hm') {
        // Has-many: add FK column on the target table
        const { data: base, error: baseError } = await supabase
          .schema('nc_meta')
          .from('bases')
          .select('schema_name')
          .eq('id', baseId)
          .single();
        if (baseError) throw baseError;

        const fkColumn = `${sourceTable.pg_table_name}_id`;
        const { error: ddlFk } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'addColumn',
            schemaName: base.schema_name,
            tableName: targetTable.pg_table_name,
            columnName: fkColumn,
            columnType: 'UUID',
          },
        });
        if (ddlFk) throw ddlFk;
      } else if (type === 'bt') {
        // Belongs-to: add FK column on the source table
        const { data: base, error: baseError } = await supabase
          .schema('nc_meta')
          .from('bases')
          .select('schema_name')
          .eq('id', baseId)
          .single();
        if (baseError) throw baseError;

        const fkColumn = `${targetTable.pg_table_name}_id`;
        const { error: ddlFk } = await supabase.functions.invoke('ddl-executor', {
          body: {
            action: 'addColumn',
            schemaName: base.schema_name,
            tableName: sourceTable.pg_table_name,
            columnName: fkColumn,
            columnType: 'UUID',
          },
        });
        if (ddlFk) throw ddlFk;
      }

      // 4. Insert link records
      const { error: linkError1 } = await supabase
        .schema('nc_meta')
        .from('links')
        .insert({
          field_id: sourceField.id,
          related_table_id: targetTableId,
          related_field_id: targetField.id,
          junction_table_id: junctionTableId,
          type,
        });
      if (linkError1) throw linkError1;

      const { error: linkError2 } = await supabase
        .schema('nc_meta')
        .from('links')
        .insert({
          field_id: targetField.id,
          related_table_id: sourceTableId,
          related_field_id: sourceField.id,
          junction_table_id: junctionTableId,
          type: reverseType,
        });
      if (linkError2) throw linkError2;

      return { sourceField: sourceField as FieldMeta, targetField: targetField as FieldMeta };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.sourceTableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.targetTableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'links', variables.sourceTableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'links', variables.targetTableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'tables', variables.baseId] });
    },
  });
}

/** Fetch linked record IDs for a given record + link field */
export function useLinkedRecords(params: {
  baseId: string | null | undefined;
  sourceTableId: string | null | undefined;
  fieldId: string | null | undefined;
  recordId: string | null | undefined;
}) {
  const { baseId, sourceTableId, fieldId, recordId } = params;

  return useQuery({
    queryKey: ['nc', 'linked-records', sourceTableId, fieldId, recordId],
    enabled: !!baseId && !!sourceTableId && !!fieldId && !!recordId,
    queryFn: async () => {
      // Get the field to find link metadata
      const { data: field, error: fieldError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('options')
        .eq('id', fieldId)
        .single();
      if (fieldError) throw fieldError;

      const opts = field.options as { relatedTableId?: string; type?: string; linkFieldId?: string };
      if (!opts.relatedTableId || !opts.type) return { records: [] as any[], relatedTableId: '' };

      // Get link record for junction info
      const { data: linkMeta, error: linkMetaError } = await supabase
        .schema('nc_meta')
        .from('links')
        .select('junction_table_id')
        .eq('field_id', fieldId)
        .single();
      if (linkMetaError && linkMetaError.code !== 'PGRST116') throw linkMetaError;

      // Get base schema
      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();
      if (baseError) throw baseError;

      // Get source and target table pg names
      const { data: srcTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', sourceTableId)
        .single();

      const { data: tgtTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', opts.relatedTableId)
        .single();

      if (!srcTable || !tgtTable) return { records: [] as any[], relatedTableId: opts.relatedTableId };

      const schema = base.schema_name;

      if (opts.type === 'hm') {
        // FK is on the target table: target.source_id = record.id
        const fkCol = `${srcTable.pg_table_name}_id`;
        const { data, error } = await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .select('*')
          .eq(fkCol, recordId);
        if (error) throw error;
        return { records: data ?? [], relatedTableId: opts.relatedTableId };
      }

      if (opts.type === 'bt') {
        // FK is on the source table: source.target_id
        const fkCol = `${tgtTable.pg_table_name}_id`;
        const { data: srcRecord } = await supabase
          .schema(schema)
          .from(srcTable.pg_table_name)
          .select(fkCol)
          .eq('id', recordId)
          .single();
        if (!srcRecord || !srcRecord[fkCol]) return { records: [] as any[], relatedTableId: opts.relatedTableId };

        const { data, error } = await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .select('*')
          .eq('id', srcRecord[fkCol]);
        if (error) throw error;
        return { records: data ?? [], relatedTableId: opts.relatedTableId };
      }

      if (opts.type === 'mm' && linkMeta?.junction_table_id) {
        // Junction table
        const { data: jTable } = await supabase
          .schema('nc_meta')
          .from('tables')
          .select('pg_table_name')
          .eq('id', linkMeta.junction_table_id)
          .single();
        if (!jTable) return { records: [] as any[], relatedTableId: opts.relatedTableId };

        const srcFk = `${srcTable.pg_table_name}_id`;
        const tgtFk = `${tgtTable.pg_table_name}_id`;

        const { data: junctions, error: jErr } = await supabase
          .schema(schema)
          .from(jTable.pg_table_name)
          .select(tgtFk)
          .eq(srcFk, recordId);
        if (jErr) throw jErr;

        const targetIds = (junctions ?? []).map((j: any) => j[tgtFk]).filter(Boolean);
        if (targetIds.length === 0) return { records: [] as any[], relatedTableId: opts.relatedTableId };

        const { data, error } = await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .select('*')
          .in('id', targetIds);
        if (error) throw error;
        return { records: data ?? [], relatedTableId: opts.relatedTableId };
      }

      return { records: [] as any[], relatedTableId: opts.relatedTableId };
    },
  });
}
