import { FileText, ExternalLink, Download } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  payslips: any[];
  humanPeriod: (p: string) => string;
  previewPayslip: (slip: any) => void;
  downloadPayslip: (slip: any) => void;
}

export default function PayrollTab({ payslips, humanPeriod, previewPayslip, downloadPayslip }: Props) {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payroll</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payslips.length === 0 ? (
            <EmptyState compact icon={FileText} title="No payslips yet" description="Finance generates payslips at the end of each month." />
          ) : (
            <div className="divide-y">
              {payslips.map((slip: any) => (
                <div key={slip.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">{humanPeriod(slip.period)}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => previewPayslip(slip)}
                    >
                      <ExternalLink className="h-4 w-4" /> Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => downloadPayslip(slip)}
                    >
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
