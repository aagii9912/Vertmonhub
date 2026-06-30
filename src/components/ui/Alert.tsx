import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  InfoIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border p-3 text-sm [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:translate-y-px",
  {
    variants: {
      variant: {
        info: "bg-status-info-soft text-status-info border-transparent",
        success: "bg-status-success-soft text-status-success border-transparent",
        warning: "bg-status-pending-soft text-status-pending border-transparent",
        danger: "bg-status-danger-soft text-status-danger border-transparent",
        brand: "bg-brand-soft text-brand-strong border-transparent",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const variantIcon: Record<NonNullable<AlertVariant>, LucideIcon> = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  danger: XCircleIcon,
  brand: SparklesIcon,
}

type AlertVariant = VariantProps<typeof alertVariants>["variant"]

function Alert({
  className,
  variant = "info",
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    /** Override the default leading icon. Pass `null` to hide it. */
    icon?: React.ReactNode
  }) {
  const resolved = variant ?? "info"
  const DefaultIcon = variantIcon[resolved]
  const showDefault = icon === undefined
  const assertive = resolved === "danger" || resolved === "warning"

  return (
    <div
      data-slot="alert"
      role="alert"
      aria-live={assertive ? "assertive" : "polite"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {showDefault ? <DefaultIcon aria-hidden="true" /> : icon}
      <div className="col-start-2 flex flex-col gap-1">{children}</div>
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium leading-snug tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm leading-relaxed opacity-90 [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
