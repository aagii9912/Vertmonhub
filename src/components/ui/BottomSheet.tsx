"use client"

import * as React from "react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/Sheet"

/**
 * BottomSheet — mobile-first preset of the canonical {@link Sheet}.
 *
 * Thin compatibility wrapper that renders a `<Sheet side="bottom">`. Prefer
 * importing {@link Sheet} directly for new code; this exists so any future
 * `BottomSheet` import path stays valid while delegating to the accessible
 * Radix-backed implementation (focus trap + aria-modal + Escape).
 */
function BottomSheet({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetContent>) {
  return (
    <SheetContent side="bottom" className={className} {...props}>
      {children}
    </SheetContent>
  )
}

export { BottomSheet, Sheet, SheetHeader, SheetTitle }
