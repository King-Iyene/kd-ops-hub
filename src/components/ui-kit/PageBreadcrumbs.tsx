/**
 * PageBreadcrumbs — drop-in breadcrumb trail for detail pages.
 *
 * Standard pattern for the four big detail surfaces (BatchDetail,
 * EmployeeProfile, ContractorProfile, ClientProfile). Pass an
 * ordered list of trail segments; the last one is auto-highlighted
 * as the current page (no link) and earlier segments link.
 *
 *   <PageBreadcrumbs trail={[
 *     { label: 'Employees', href: '/employees' },
 *     { label: empName },
 *   ]} />
 *
 * Renders nothing if the list is empty so callers can pass a dynamic
 * trail without the extra null-check.
 */
import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  trail: Crumb[];
  className?: string;
}

export function PageBreadcrumbs({ trail, className }: Props) {
  if (!trail.length) return null;
  return (
    <Breadcrumb className={cn('mb-3', className)}>
      <BreadcrumbList className="text-xs text-muted-foreground">
        {trail.map((c, i) => {
          const isLast = i === trail.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="contents">
              <BreadcrumbItem>
                {isLast || !c.href ? (
                  <BreadcrumbPage className="text-foreground/70 truncate max-w-[40ch]" title={c.label}>
                    {c.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={c.href} className="hover:text-foreground kd-transition">{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
