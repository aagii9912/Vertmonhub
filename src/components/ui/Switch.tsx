"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent shadow-sm transition-colors",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[state=unchecked]:bg-surface-3 data-[state=checked]:bg-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-0",
          "transition-transform duration-(--duration-fast) ease-(--ease-spring)",
          "data-[state=unchecked]:translate-x-0.5 data-[state=checked]:translate-x-[1.375rem]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}
Switch.displayName = "Switch"

export { Switch }
