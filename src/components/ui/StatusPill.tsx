import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statusPillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        success: "bg-status-success-soft text-status-success",
        danger: "bg-status-danger-soft text-status-danger",
        pending: "bg-status-pending-soft text-status-pending",
        info: "bg-status-info-soft text-status-info",
        active: "bg-status-active-soft text-status-active",
        neutral: "bg-status-neutral-soft text-muted-foreground",
        brand: "bg-brand-soft text-brand-strong",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function StatusPill({
  variant,
  dot = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusPillVariants> & {
    dot?: boolean
  }) {
  return (
    <span
      data-slot="status-pill"
      className={cn(statusPillVariants({ variant }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  )
}

export { StatusPill, statusPillVariants }
