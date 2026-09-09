import { useState, lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Telescope, Zap, BookOpen, Key, Webhook, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

const ApiOverview = lazy(() => import('./ApiOverview'));
const ApiExplorer = lazy(() => import('./ApiExplorer'));
const ApiReference = lazy(() => import('./ApiReference'));
const ApiKeysManager = lazy(() => import('./ApiKeysManager'));
const WebhooksManager = lazy(() => import('./WebhooksManager'));

export function DeveloperHub() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/20">
                <Terminal size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Developer Hub
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Platform API, keys, webhooks & integrations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">
                API v1
              </span>
              <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                REST
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="bg-transparent border-b border-zinc-200 dark:border-zinc-800 rounded-none w-full justify-start gap-1 h-auto p-0">
            {[
              { value: 'overview', label: 'Overview', icon: Telescope },
              { value: 'explorer', label: 'API Explorer', icon: Zap },
              { value: 'reference', label: 'API Reference', icon: BookOpen },
              { value: 'keys', label: 'API Keys', icon: Key },
              { value: 'webhooks', label: 'Webhooks', icon: Webhook },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-all',
                  'data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 dark:data-[state=active]:border-blue-400',
                  'data-[state=inactive]:text-zinc-500 dark:data-[state=inactive]:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300',
                  'data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                )}
              >
                <tab.icon size={14} className="mr-1.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="py-6">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              }
            >
              <TabsContent value="overview" className="mt-0">
                <ApiOverview onNavigate={setActiveTab} />
              </TabsContent>
              <TabsContent value="explorer" className="mt-0">
                <ApiExplorer />
              </TabsContent>
              <TabsContent value="reference" className="mt-0">
                <ApiReference />
              </TabsContent>
              <TabsContent value="keys" className="mt-0">
                <ApiKeysManager />
              </TabsContent>
              <TabsContent value="webhooks" className="mt-0">
                <WebhooksManager />
              </TabsContent>
            </Suspense>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
