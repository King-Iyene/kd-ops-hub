import { RefTable, RefSection } from '@/components/guide/shared';
import { FileWarning, FolderOpen, Database, Archive } from 'lucide-react';

export function TechFilesSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Files & Data Retention</h2>
      <RefSection icon={FileWarning} title="File upload rules">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Maximum file size',           b: '10 MB per file (5 MB for company logo)' },
            { a: 'Image compression',           b: 'On by default — receipts / photos resize to 1600 px JPEG @ 82%' },
            { a: 'Compression skipped for',     b: 'PDFs, GIFs, SVGs, files smaller than 200 KB' },
            { a: 'Blocked extensions',          b: '.exe .bat .cmd .sh .ps1 .jar .msi .app .dmg .html .js .ts .php .py .rb' },
            { a: 'Documents bucket',            b: 'Private — preview uses short-lived signed URLs' },
            { a: 'Receipts bucket',             b: 'Private — same signed-URL pattern' },
            { a: 'Documents auto-delete',       b: 'NEVER — HR / legal docs survive any retention policy' },
          ]}
        />
      </RefSection>

      <RefSection icon={FolderOpen} title="Document Management">
        <RefTable
          cols={['Feature', 'Detail']}
          rows={[
            { a: 'Folder system',            b: 'Create folders with custom colours and icons. Breadcrumb navigation. Folders can be linked to entities (client/employee/vehicle/project).' },
            { a: 'Entity linking',           b: 'Tag documents to: client (Building2), employee (Users), vehicle (Car), project (Briefcase). Filter by entity type in toolbar.' },
            { a: 'Drag & drop upload',       b: 'Drop files anywhere on the page — auto-opens upload form with file pre-attached.' },
            { a: 'Bulk upload',              b: 'Select multiple files at once. Progress bar tracks completion. Each file creates a separate document record.' },
            { a: 'Grid + list view',         b: 'Toggle between card grid and table list view. Preference persists during session.' },
            { a: 'Dashboard stats',          b: 'Cards showing: total documents, expiring soon (30 days), expired, linked to entities, total folders.' },
            { a: 'Document categories',      b: 'contract · agreement · receipt · invoice · id_document · policy · report · proposal · letter · certificate · license · insurance · tax · hr · onboarding · template · other' },
            { a: 'Template flag',            b: 'Mark documents as templates for reuse. Template badge displayed on cards.' },
            { a: 'Access tracking',          b: 'Every download updates last_accessed_at timestamp and increments access_count.' },
            { a: 'Document detail dialog',   b: 'Full metadata view: title, description, category, entity link, tags, file size, upload date, expiry, version, access count.' },
            { a: 'Version tracking',         b: 'version INT (default 1) + parent_document_id FK for document lineage.' },
            { a: 'Upload roles',             b: 'admin · finance · operations · super_admin (expanded from admin-only)' },
            { a: 'Folder RLS',               b: 'All authenticated can read. admin/finance/operations can create. admin/creator can update. admin can delete.' },
          ]}
        />
      </RefSection>

      <RefSection icon={Database} title="What really happens when you click 'Delete'">
        <RefTable
          cols={['What you delete', 'What actually happens']}
          rows={[
            { a: 'Expense',           b: 'Hidden from every screen, but kept in the database with a "deleted on" timestamp. An admin can restore it from the Supabase dashboard.' },
            { a: 'Document',          b: 'Hidden everywhere and the actual file is removed from storage (frees space). The database record stays so the audit log still references it.' },
            { a: 'Budget',            b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
            { a: 'Leave request',     b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
            { a: 'Fuel request',      b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
            { a: 'Contractor',        b: 'Sensitive personal info (name, email, phone, BVN, bank details) is anonymised. The row stays so historical payments still balance.' },
            { a: 'Trip log',          b: 'Permanently removed (no financial value tied to it).' },
            { a: 'Task or Goal',      b: 'Permanently removed.' },
          ]}
        />
      </RefSection>

      <RefSection icon={Archive} title="Data retention policies">
        <RefTable
          cols={['Data type', 'Current behaviour', 'Recommended setting']}
          rows={[
            { a: 'Audit logs',            b: 'Configurable in Data Retention tab', c: '3 years (FIRS requirement)' },
            { a: 'Notifications (read)',  b: 'Configurable',                       c: '90 days' },
            { a: 'Receipts & files',      b: 'Configurable (archive-only mode)',   c: '2 years archive, never hard-delete' },
            { a: 'Documents (HR/legal)',  b: 'NEVER auto-deleted (locked)',         c: 'Keep 7 years post-employment' },
            { a: 'Archive recovery',      b: '90-day window after archiving',      c: 'Restore via Supabase before expiry' },
            { a: 'First-run delay',       b: '7 days from enabling retention',     c: 'Cancellation window' },
          ]}
        />
      </RefSection>
    </>
  );
}
