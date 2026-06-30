import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * SettingRow — тохиргооны нэг мөр: зүүн талд шошго + тайлбар, баруун талд удирдлага
 * (Switch / Select / товч г.м.). Гар утсан дээр босоо давхарлаж, өргөн дэлгэц дээр
 * шошго зүүн, удирдлага баруун талдаа эгнэнэ.
 */
type SettingRowProps = {
  /** Шошгоны текст (Монголоор). */
  label: React.ReactNode
  /** Туслах тайлбар (заавал биш). */
  description?: React.ReactNode
  /** Баруун талын удирдлага (Switch, Select, товч г.м.). */
  control: React.ReactNode
  className?: string
}

function SettingRow({ label, description, control, className }: SettingRowProps) {
  return (
    <div
      data-slot="setting-row"
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-surface-2/40 p-4",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div data-slot="setting-row-control" className="shrink-0">
        {control}
      </div>
    </div>
  )
}

export { SettingRow }
