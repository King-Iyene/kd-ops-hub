import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const indicatorRef = React.useRef<HTMLDivElement>(null);
  const isPill = !className?.includes('rounded-none');

  const updateIndicator = React.useCallback(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator || !isPill) return;
    const active = list.querySelector<HTMLElement>('[data-state="active"]');
    if (!active) {
      indicator.style.opacity = '0';
      return;
    }
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    indicator.style.opacity = '1';
    indicator.style.width = `${activeRect.width}px`;
    indicator.style.height = `${activeRect.height}px`;
    indicator.style.transform = `translate(${activeRect.left - listRect.left}px, ${activeRect.top - listRect.top}px)`;
  }, [isPill]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list || !isPill) return;
    updateIndicator();
    const observer = new MutationObserver(updateIndicator);
    observer.observe(list, { attributes: true, subtree: true, attributeFilter: ['data-state'] });
    window.addEventListener('resize', updateIndicator);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateIndicator); };
  }, [updateIndicator, isPill]);

  return (
    <TabsPrimitive.List
      ref={(node) => {
        listRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(
        "relative inline-flex h-11 md:h-10 items-center justify-center rounded-xl bg-muted/50 p-1 text-muted-foreground border border-border/30 dark:bg-muted/30",
        className,
      )}
      {...props}
    >
      {isPill && (
        <div
          ref={indicatorRef}
          aria-hidden
          className="absolute left-0 top-0 rounded-lg bg-card shadow-sm border border-border/50 dark:bg-card/80 dark:backdrop-blur-sm pointer-events-none"
          style={{ transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), width 250ms cubic-bezier(0.16, 1, 0.3, 1), height 250ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease', opacity: 0 }}
        />
      )}
      {props.children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative z-[1] inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground ring-offset-background transition-colors duration-150 data-[state=active]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 hover:text-foreground/80",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
