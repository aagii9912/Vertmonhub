import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statusDotVariants = cva("inline-block size-2 shrink-0 rounded-full", {
  variants: {
    variant: {
      success: "bg-status-success",
      danger: "bg-status-danger",
      pending: "bg-status-pending",
      info: "bg-status-info",
      active: "bg-status-active",
      neutral: "bg-status-neutral",
      brand: "bg-brand",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
})

function StatusDot({
  variant,
  className,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusDotVariants>) {
  return (
    <span
      data-slot="status-dot"
      aria-hidden="true"
      className={cn(statusDotVariants({ variant }), className)}
      {...props}
    />
  )
}

export { StatusDot, statusDotVariants }
