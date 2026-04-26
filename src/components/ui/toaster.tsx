import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { CheckCircle2, XCircle, AlertTriangle, Info, Bell } from "lucide-react";

const ICON_BY_VARIANT = {
  default:     { Icon: Bell,           ring: "bg-[hsl(var(--tod-glow))]/15", color: "text-[hsl(var(--tod-glow))]" },
  success:     { Icon: CheckCircle2,   ring: "bg-success/15",                color: "text-success" },
  destructive: { Icon: XCircle,        ring: "bg-destructive/15",            color: "text-destructive" },
  warning:     { Icon: AlertTriangle,  ring: "bg-warning/15",                color: "text-warning" },
  info:        { Icon: Info,           ring: "bg-info/15",                   color: "text-info" },
} as const;

type Variant = keyof typeof ICON_BY_VARIANT;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const v = (variant && variant in ICON_BY_VARIANT ? variant : "default") as Variant;
        const { Icon, ring, color } = ICON_BY_VARIANT[v];
        return (
          <Toast key={id} variant={variant as any} {...props}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`relative h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${ring}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div className="grid gap-0.5 flex-1 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
