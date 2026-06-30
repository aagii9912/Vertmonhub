"use client"

import * as React from "react"
import { Toaster as SonnerToaster, toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"

/**
 * Pre-configured sonner Toaster wired to our design tokens.
 * Mount ONCE near the root (already mounted in src/app/layout.tsx).
 * - position: top-right
 * - richColors: off (we theme via our own tokens)
 * - closeButton: on
 */
function Toaster({ ...props }: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="top-right"
      richColors={false}
      closeButton
      gap={8}
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "group bg-surface text-foreground border border-border rounded-xl shadow-lg px-4 py-3 gap-3",
          title: "text-sm font-medium text-foreground",
          description: "text-sm text-muted-foreground",
          actionButton:
            "bg-brand text-brand-fg rounded-md px-3 py-1.5 text-sm font-medium hover:bg-brand-strong",
          cancelButton:
            "bg-surface-2 text-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:bg-surface-3",
          closeButton:
            "bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-2",
          icon: "shrink-0",
          success: "[&_[data-icon]]:text-status-success",
          error: "[&_[data-icon]]:text-status-danger",
          warning: "[&_[data-icon]]:text-status-pending",
          info: "[&_[data-icon]]:text-status-info",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDialog — drop-in replacement for window.confirm                     */
/* -------------------------------------------------------------------------- */

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmState = ConfirmOptions & {
  open: boolean
  resolve: ((value: boolean) => void) | null
}

const CONFIRM_EVENT = "vh:confirm-toast"

/**
 * Imperative API. Renders through a single mounted <ConfirmDialogHost />.
 *
 *   const ok = await confirmToast({
 *     title: "Бичлэг устгах уу?",
 *     description: "Энэ үйлдлийг буцаах боломжгүй.",
 *     destructive: true,
 *   })
 *   if (ok) { ... }
 *
 * Returns Promise<boolean> — true on confirm, false on cancel/close.
 * Requires <ConfirmDialogHost /> mounted once (it ships in <Toaster/>'s tree
 * here is decoupled; mount it yourself near the root if you use confirmToast).
 */
function confirmToast(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<{ options: ConfirmOptions; resolve: (v: boolean) => void }>(
        CONFIRM_EVENT,
        { detail: { options, resolve } }
      )
    )
  })
}

/**
 * Host for the imperative confirmToast() API. Mount ONCE near the root
 * (alongside <Toaster/>). Listens for confirm requests and renders our Dialog.
 */
function ConfirmDialogHost() {
  const [state, setState] = React.useState<ConfirmState>({
    open: false,
    title: "",
    resolve: null,
  })

  React.useEffect(() => {
    function handle(event: Event) {
      const detail = (
        event as CustomEvent<{
          options: ConfirmOptions
          resolve: (v: boolean) => void
        }>
      ).detail
      if (!detail) return
      setState({ ...detail.options, open: true, resolve: detail.resolve })
    }
    window.addEventListener(CONFIRM_EVENT, handle)
    return () => window.removeEventListener(CONFIRM_EVENT, handle)
  }, [])

  function settle(value: boolean) {
    state.resolve?.(value)
    setState((prev) => ({ ...prev, open: false, resolve: null }))
  }

  return (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) settle(false)
      }}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      destructive={state.destructive}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDialog — controlled component (use directly without the host)       */
/* -------------------------------------------------------------------------- */

type ConfirmDialogProps = ConfirmOptions & {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onCancel?: () => void
}

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = "Тийм",
  cancelLabel = "Цуцлах",
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="rounded-2xl sm:max-w-md"
        data-slot="confirm-dialog"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.()
              onOpenChange(false)
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { Toaster, toast, confirmToast, ConfirmDialog, ConfirmDialogHost }
export type { ConfirmOptions, ConfirmDialogProps }
