import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const VARIANT_CLASSES: Record<string, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger:  "bg-destructive",
  info:    "bg-sky-500",
};

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    variant?: keyof typeof VARIANT_CLASSES;
    animated?: boolean;
    size?: "sm" | "md" | "lg";
  }
>(({ className, value, variant = "default", animated, size = "md", ...props }, ref) => {
  const sizeClass = size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2";
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative w-full overflow-hidden rounded-full bg-secondary/50", sizeClass, className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          VARIANT_CLASSES[variant] || VARIANT_CLASSES.default,
          animated && "kd-progress-shimmer",
        )}
        style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
