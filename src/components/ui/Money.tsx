import * as React from "react"

import { cn } from "@/lib/utils"
import { formatMNT } from "@/lib/utils/currency"

function Money({
  value,
  compact = false,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  value: number | null | undefined
  compact?: boolean
}) {
  const isNullish = value === null || value === undefined || !Number.isFinite(Number(value))

  return (
    <span
      data-slot="money"
      className={cn("tabular-nums", className)}
      {...props}
    >
      {isNullish ? "—" : formatMNT(value, { compact })}
    </span>
  )
}

export { Money }
