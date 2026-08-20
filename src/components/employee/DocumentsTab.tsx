import { FileText, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import SignedDocumentsList from '@/components/hr/SignedDocumentsList';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FilePreviewTrigger } from '@/components/FilePreview';

interface Props {
  employeeId: string | undefined;
  documents: any[];
  canManage: boolean;
  onOpenUploadDialog: () => void;
  onDeleteDocument: (doc: any) => void;
}

export default function DocumentsTab({ employeeId, documents, canManage, onOpenUploadDialog, onDeleteDocument }: Props) {
  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Signed HR documents</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Every offer letter, contract or policy acknowledgement signed
            by or for this employee. Each row can be re-verified against
            its SHA-256 hash — tampering is visually flagged.
          </p>
        </CardHeader>
        <CardContent>
          <SignedDocumentsList employeeId={employeeId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Documents</CardTitle>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onOpenUploadDialog}
            >
              <Plus className="h-4 w-4" /> Upload
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <EmptyState compact icon={FileText} title="No documents yet" description="Upload contracts, IDs, or HR docs above." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc: any) => (
                    <TableRow key={doc.id}>
                      <TableCell className="pl-4 font-medium">
                        {doc.title || doc.file_name || doc.name || '—'}
                        {doc.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">
                            {doc.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {doc.category || 'general'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {doc.expires_at ? formatDate(doc.expires_at) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(doc.created_at)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {doc.storage_path && (
                            <FilePreviewTrigger
                              bucket="documents"
                              path={doc.storage_path}
                              label="View"
                              fileName={doc.title || doc.file_name}
                            />
                          )}
                          {canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDeleteDocument(doc)}
                              title="Delete"
                              aria-label={`Delete document ${doc.title || doc.file_name || ''}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
