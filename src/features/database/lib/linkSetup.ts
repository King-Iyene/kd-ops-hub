/**
 * Setting up a link between two tables, asked in plain words instead of database terms.
 * Two questions: how many records of the other table can one record here link to, and how many records here
 * can one record there be linked from. The two answers decide what is built; this file turns them into the
 * options the link creator already understands, and describes the result in a sentence. No screen code.
 */

export type RelationType = 'one_to_one' | 'one_to_many' | 'many_to_many';

export interface LinkChoice {
  relationType: RelationType;
  /** false limits each cell to a single linked record. */
  allowMultiple: boolean;
}

/**
 * What to build for the two answers.
 * - many / many: any record can link to several, and the other side too (a junction table).
 * - many / one: a record here links to several there, each of those belongs to only one here.
 * - one / one: one each way.
 * - one / many: each cell holds a single record, but many records here may point at the same one there.
 *   That is the same structure as many / many with the cell limited to one, which is what Airtable does.
 */
export function deriveRelation(linksToMany: boolean, linkedFromMany: boolean): LinkChoice {
  if (linksToMany && linkedFromMany) return { relationType: 'many_to_many', allowMultiple: true };
  if (linksToMany && !linkedFromMany) return { relationType: 'one_to_many', allowMultiple: true };
  if (!linksToMany && !linkedFromMany) return { relationType: 'one_to_one', allowMultiple: false };
  return { relationType: 'many_to_many', allowMultiple: false };
}

/** The short name for the combination, shown beside the sentence. */
export function relationLabel(linksToMany: boolean, linkedFromMany: boolean): string {
  if (linksToMany && linkedFromMany) return 'Many to many';
  if (linksToMany) return 'One to many';
  if (linkedFromMany) return 'Many to one';
  return 'One to one';
}

/** "Project" from "Projects" and similar, for sentences that talk about one record. A guess that is only used in wording. */
export function singular(name: string): string {
  const trimmed = name.trim();
  if (/[^aeiou]ies$/i.test(trimmed)) return trimmed.replace(/ies$/i, 'y');
  if (/(ss|us|is)$/i.test(trimmed)) return trimmed;
  if (/(ch|sh|x|z)es$/i.test(trimmed) || /ses$/i.test(trimmed)) return trimmed.replace(/es$/i, '');
  if (/s$/i.test(trimmed)) return trimmed.replace(/s$/i, '');
  return trimmed;
}

/** The result in one sentence a non-technical person can check against what they meant. */
export function describeRelation(thisTable: string, targetTable: string, linksToMany: boolean, linkedFromMany: boolean): string {
  if (!thisTable || !targetTable) return '';
  const here = singular(thisTable);
  const there = singular(targetTable);
  const first = linksToMany ? `Each ${here} can link to many ${targetTable}` : `Each ${here} links to one ${there}`;
  const second = linkedFromMany ? `each ${there} can be linked from many ${thisTable}` : `each ${there} can be linked from only one ${here}`;
  return `${first}, and ${second}.`;
}

/** The default name of the matching field added to the other table: this table's name, as it has always been. */
export function defaultReciprocalName(thisTable: string): string {
  return thisTable.trim();
}

/** The name to use for the matching field: what was typed, or the default when it is empty. */
export function reciprocalNameOrDefault(typed: string, thisTable: string): string {
  return typed.trim() || defaultReciprocalName(thisTable);
}
