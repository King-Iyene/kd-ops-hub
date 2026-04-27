/**
 * Centralised expense categories. Single source of truth for both:
 *   • Expenses page submission form
 *   • Settings page per-category limits
 *
 * When you add or rename a category here, both surfaces pick it up.
 *
 * The `key` is the database value (snake_case, stable). The `label` is what
 * the user sees. Group keeps related items together in dropdowns.
 */

export interface ExpenseCategoryDef {
  key: string;
  label: string;
  group: 'travel' | 'office' | 'utilities' | 'services' | 'fleet' | 'other';
}

export const EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  // Travel & meals
  { key: 'fuel',                  label: 'Fuel (personal/reimbursement)', group: 'travel' },
  { key: 'transport',             label: 'Transport (taxi, bus, ride-share)', group: 'travel' },
  { key: 'mileage',               label: 'Mileage (per-km claim)',         group: 'travel' },
  { key: 'parking_tolls',         label: 'Parking & tolls',                group: 'travel' },
  { key: 'accommodation',         label: 'Accommodation / hotel',          group: 'travel' },
  { key: 'flight',                label: 'Flight / inter-city',            group: 'travel' },
  { key: 'meals',                 label: 'Meals (staff)',                  group: 'travel' },
  { key: 'client_entertainment',  label: 'Client entertainment',           group: 'travel' },
  { key: 'per_diem',              label: 'Per diem',                       group: 'travel' },

  // Office
  { key: 'office_supplies',       label: 'Office supplies',                group: 'office' },
  { key: 'printing',              label: 'Printing & stationery',          group: 'office' },
  { key: 'equipment',             label: 'Equipment / hardware',           group: 'office' },
  { key: 'software',              label: 'Software / subscriptions (one-off)', group: 'office' },

  // Utilities & operations
  { key: 'utilities',             label: 'Utilities (electricity, water)', group: 'utilities' },
  { key: 'diesel_generator',      label: 'Diesel / generator',             group: 'utilities' },
  { key: 'internet_data',         label: 'Internet / data',                group: 'utilities' },
  { key: 'airtime',               label: 'Airtime / phone',                group: 'utilities' },
  { key: 'rent',                  label: 'Rent (one-off / reimbursement)', group: 'utilities' },

  // Fleet & maintenance
  { key: 'repair',                label: 'Vehicle / equipment repair',     group: 'fleet' },
  { key: 'maintenance',           label: 'Maintenance (routine)',          group: 'fleet' },
  { key: 'insurance',             label: 'Insurance (vehicle / asset)',    group: 'fleet' },

  // Professional services
  { key: 'legal_professional',    label: 'Legal / professional fees',      group: 'services' },
  { key: 'accounting_audit',      label: 'Accounting / audit',             group: 'services' },
  { key: 'training',              label: 'Training / conferences',         group: 'services' },
  { key: 'marketing',             label: 'Marketing / advertising',        group: 'services' },
  { key: 'courier',               label: 'Courier / dispatch',             group: 'services' },
  { key: 'bank_charges',          label: 'Bank charges',                   group: 'services' },

  // Catch-all
  { key: 'other',                 label: 'Other',                          group: 'other' },
];

export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key);

export const expenseCategoryLabel = (key: string): string => {
  const found = EXPENSE_CATEGORIES.find((c) => c.key === key);
  if (found) return found.label;
  // Fall back to a humanised version of the key (snake_case → Title Case)
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
