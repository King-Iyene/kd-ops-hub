import { lazy, Suspense, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Terminal, Rocket, Key, BookOpen, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AREAS,
  isSectionInArea,
  locationToParams,
  resolveLocation,
  resolveTarget,
  type AreaId,
  type SectionId,
} from '@/features/developer-hub/lib/navigation';
import { SectionToc } from '@/features/developer-hub/components/SectionToc';

const ApiOverview = lazy(() => import('./ApiOverview'));
const QuickStart = lazy(() => import('@/features/developer-hub/components/QuickStart'));
const ApiExplorer = lazy(() => import('./ApiExplorer'));
const ApiReference = lazy(() => import('./ApiReference'));
const V0Preview = lazy(() => import('@/features/developer-hub/components/V0Preview'));
const ApiKeysManager = lazy(() => import('./ApiKeysManager'));
const WebhooksManager = lazy(() => import('./WebhooksManager'));
const IntegrationGuides = lazy(() => import('./IntegrationGuides'));
const Recipes = lazy(() => import('./Recipes'));
const Troubleshooting = lazy(() => import('./Troubleshooting'));
const ModuleGuides = lazy(() => import('./ModuleGuides'));

const AREA_ICONS: Record<AreaId, React.ElementType> = {
  start: Rocket,
  keys: Key,
  reference: BookOpen,
  webhooks: Webhook,
};

/** Sections whose pages have no sidebar of their own get the "On this page" list. */
const SECTIONS_WITH_TOC = new Set<SectionId>(['overview', 'quickstart', 'guides', 'recipes', 'troubleshooting', 'v0']);

const tabTriggerClass = cn(
  'shrink-0 rounded-none border-b-2 border-transparent px-3 sm:px-4 py-2.5 text-sm font-medium transition-all',
  'data-[state=active]:border-primary data-[state=active]:text-primary dark:data-[state=active]:text-primary dark:data-[state=active]:border-primary',
  'data-[state=inactive]:text-zinc-500 dark:data-[state=inactive]:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300',
  'data-[state=active]:bg-transparent data-[state=active]:shadow-none',
);

const subTriggerClass = cn(
  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border border-transparent',
  'data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/30 data-[state=active]:shadow-none',
  'data-[state=inactive]:text-zinc-600 dark:data-[state=inactive]:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60',
);

function Loading() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Loading">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export function DeveloperHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const topRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const location = useMemo(
    () =>
      resolveLocation({
        area: searchParams.get('area'),
        section: searchParams.get('section'),
        tab: searchParams.get('tab'),
      }),
    [searchParams],
  );

  const goTo = useCallback(
    (loc: { area: AreaId; section: SectionId }) => {
      setSearchParams(locationToParams(loc));
      topRef.current?.scrollIntoView({ block: 'start' });
    },
    [setSearchParams],
  );

  /** Children call this with an old tab id (explorer, reference, keys, ...), a section id or an area id. */
  const navigate = useCallback(
    (target: string) => {
      const loc = resolveTarget(target);
      if (loc) goTo(loc);
    },
    [goTo],
  );

  const onAreaChange = useCallback(
    (areaId: string) => {
      const loc = resolveTarget(areaId);
      if (loc) goTo(loc);
    },
    [goTo],
  );

  const onSectionChange = useCallback(
    (sectionId: string) => {
      if (isSectionInArea(location.area, sectionId)) goTo({ area: location.area, section: sectionId });
    },
    [goTo, location.area],
  );

  const renderSection = (section: SectionId) => {
    switch (section) {
      case 'overview':
        return <ApiOverview onNavigate={navigate} />;
      case 'quickstart':
        return <QuickStart onNavigate={navigate} />;
      case 'guides':
        return <IntegrationGuides />;
      case 'recipes':
        return <Recipes />;
      case 'troubleshooting':
        return <Troubleshooting onNavigate={navigate} />;
      case 'keys':
        return <ApiKeysManager />;
      case 'reference':
        return <ApiReference />;
      case 'explorer':
        return <ApiExplorer />;
      case 'v0':
        return <V0Preview />;
      case 'webhooks':
        return <WebhooksManager />;
      case 'modules':
        return <ModuleGuides />;
    }
  };

  const showToc = SECTIONS_WITH_TOC.has(location.section);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto w-full max-w-[1680px] px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-gradient-to-br from-[hsl(200,80%,22%)] to-[hsl(200,65%,28%)] shadow-lg shadow-primary/20 shrink-0">
                <Terminal size={20} className="text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Developer Hub
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  Platform API, keys, webhooks & integrations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xs font-mono px-2 py-1 rounded-full bg-success/10 dark:bg-success/10 text-success dark:text-success font-medium">
                API v1
              </span>
              <span className="text-3xs font-mono px-2 py-1 rounded-full bg-primary/10 dark:bg-primary/10 text-primary dark:text-primary font-medium">
                REST
              </span>
            </div>
          </div>

          {/* Areas */}
          <Tabs value={location.area} onValueChange={onAreaChange} className="mt-2">
            <TabsList
              aria-label="Developer Hub areas"
              className="bg-transparent rounded-none border-0 w-full justify-start gap-1 h-auto p-0 flex-nowrap overflow-x-auto overflow-y-hidden"
            >
              {AREAS.map((area) => {
                const Icon = AREA_ICONS[area.id];
                return (
                  <TabsTrigger key={area.id} value={area.id} title={area.description} className={tabTriggerClass}>
                    <Icon size={14} className="mr-1.5" aria-hidden="true" />
                    {area.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto w-full max-w-[1680px] px-3 sm:px-6 lg:px-8">
        <div ref={topRef} className="scroll-mt-32" />
        {AREAS.filter((a) => a.id === location.area).map((area) => (
          <Tabs key={area.id} value={location.section} onValueChange={onSectionChange} className="pt-4">
            {area.sections.length > 1 && (
              <TabsList
                aria-label={`${area.label} sections`}
                className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0 flex-nowrap"
              >
                {area.sections.map((s) => (
                  <TabsTrigger key={s.id} value={s.id} className={subTriggerClass}>
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}

            <div className={cn('py-6', showToc && 'xl:grid xl:grid-cols-[13rem_minmax(0,1fr)] xl:gap-8')}>
              {showToc && (
                <aside className="hidden xl:block">
                  <SectionToc contentRef={contentRef} sectionKey={location.section} />
                </aside>
              )}
              <div ref={contentRef} className="min-w-0">
                <Suspense fallback={<Loading />}>
                  {area.sections.map((s) => (
                    <TabsContent key={s.id} value={s.id} className="mt-0 focus-visible:outline-none">
                      {renderSection(s.id)}
                    </TabsContent>
                  ))}
                </Suspense>
              </div>
            </div>
          </Tabs>
        ))}
      </div>
    </div>
  );
}
