import { MapPin } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { useReportFilters } from '../../reports/useReportFilters';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';

/**
 * Reports > Time > Other > Location report. TimeCamp's version shows where
 * a mobile clock-in happened (GPS captured by their mobile app). We have no
 * mobile app capturing geolocation yet, so every entry here has nothing to
 * show — same honest empty state TimeCamp itself shows when a workspace
 * has no location data for the selected filters, rather than a fake map.
 */
export default function LocationReportPage() {
  const filters = useReportFilters();

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Location Report" description="Where time entries were logged from, when location is captured" icon={MapPin} />
      <ReportFiltersBar filters={filters} />
      <div className="rounded-md border border-border/60 py-10 text-center text-sm text-muted-foreground">
        No data match your criteria, try different filters.
        <p className="text-xs mt-2 max-w-md mx-auto">
          No current KD Ops client captures GPS location on clock-in — this report will populate once a
          location-aware mobile clock-in is built.
        </p>
      </div>
    </div>
  );
}
