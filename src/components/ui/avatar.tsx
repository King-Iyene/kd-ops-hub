import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

type AvatarStatus = "online" | "away" | "offline" | "busy";

const STATUS_COLORS: Record<AvatarStatus, string> = {
  online:  "bg-success",
  away:    "bg-warning",
  offline: "bg-muted-foreground/50",
  busy:    "bg-destructive",
};

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
    status?: AvatarStatus;
  }
>(({ className, status, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-visible rounded-full", className)}
    {...props}
  >
    <div className="h-full w-full overflow-hidden rounded-full">
      {props.children}
    </div>
    {status && (
      <span
        aria-label={status}
        className={cn(
          "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background",
          STATUS_COLORS[status],
          status === "online" && "animate-pulse",
        )}
      />
    )}
  </AvatarPrimitive.Root>
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn("aspect-square h-full w-full", className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
export type { AvatarStatus };
