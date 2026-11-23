import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Lightbulb,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Zap,
  Play,
  Code2,
} from 'lucide-react';
import { RECIPES as recipes, type Difficulty, type Recipe } from '@/features/developer-hub/data/recipes';

const difficultyColors: Record<Difficulty, string> = {
  Beginner:
    'bg-success/10 text-success dark:bg-success/10 dark:text-success',
  Intermediate:
    'bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning',
  Advanced: 'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive',
};

const allPlatforms = Array.from(
  new Set(recipes.flatMap((r) => r.platforms))
).sort();

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 px-2 text-xs gap-1"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </Button>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card
      className={cn(
        'transition-all duration-200 cursor-pointer hover:shadow-md',
        'border-zinc-200 dark:border-zinc-800',
        expanded && 'ring-1 ring-blue-500/30'
      )}
    >
      <CardContent className="p-0">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left p-5 flex items-start gap-4"
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/8 dark:bg-primary/15 flex items-center justify-center text-lg">
            {recipe.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                {recipe.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge
                className={cn(
                  'text-3xs font-medium px-1.5 py-0 border-0',
                  difficultyColors[recipe.difficulty]
                )}
              >
                {recipe.difficulty}
              </Badge>
              {recipe.platforms.map((p) => (
                <Badge
                  key={p}
                  variant="outline"
                  className="text-3xs px-1.5 py-0"
                >
                  {p}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
              {recipe.description}
            </p>
          </div>
          <div className="flex-shrink-0 mt-1 text-zinc-400">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-4">
            {/* Steps */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" /> Steps
              </h4>
              <ol className="space-y-1.5">
                {recipe.steps.map((step, i) => (
                  <li
                    key={i}
                    className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-3xs font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span className="font-mono break-all">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Important warning */}
            {recipe.important && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Important:</span>{' '}
                  {recipe.important}
                </p>
              </div>
            )}

            {/* Pro tip */}
            {recipe.proTip && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/20">
                <Lightbulb className="h-4 w-4 text-primary dark:text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-primary dark:text-primary">
                  <span className="font-semibold">Pro Tip:</span>{' '}
                  {recipe.proTip}
                </p>
              </div>
            )}

            {/* Code blocks */}
            {recipe.code?.map((block, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5" /> {block.label}
                  </h4>
                  <CopyButton text={block.content} />
                </div>
                <pre className="p-3 rounded-lg bg-zinc-900 dark:bg-zinc-950 text-zinc-100 text-2xs leading-relaxed overflow-x-auto">
                  <code>{block.content}</code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Recipes() {
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'All'>(
    'All'
  );
  const [platformFilter, setPlatformFilter] = useState<string>('All');

  const filtered = recipes.filter((r) => {
    if (difficultyFilter !== 'All' && r.difficulty !== difficultyFilter)
      return false;
    if (platformFilter !== 'All' && !r.platforms.includes(platformFilter))
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Recipes & Use Cases
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Real-world automation examples you can copy and adapt. Connect KDOps
          to your favourite tools with these battle-tested workflows.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Difficulty:
          </span>
          {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map(
            (d) => (
              <Button
                key={d}
                variant={difficultyFilter === d ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setDifficultyFilter(d)}
              >
                {d}
              </Button>
            )
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Platform:
          </span>
          {['All', ...allPlatforms].map((p) => (
            <Button
              key={p}
              variant={platformFilter === p ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setPlatformFilter(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Showing {filtered.length} of {recipes.length} recipes
      </p>

      {/* Recipe grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-400 dark:text-zinc-500">
          <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No recipes match your filters.</p>
        </div>
      )}
    </div>
  );
}
