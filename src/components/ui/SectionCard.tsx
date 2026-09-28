import * as React from "react"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/Card"

/**
 * SectionCard — гарчигтай тохиргооны хэсгийн карт. Зүүн талдаа дугуй дэвсгэртэй
 * lucide дүрс (заавал биш), хажууд нь гарчиг + тайлбар, доор нь агуулга.
 */
type SectionCardProps = {
  /** Хэсгийн гарчиг (Монголоор). */
  title: React.ReactNode
  /** lucide дүрс (заавал биш). */
  icon?: LucideIcon
  /** Гарчгийн доорх тайлбар (заавал биш). */
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Толгой ба биеийг агуулсан дотоод сав-д нэмэх класс. */
  contentClassName?: string
}

function SectionCard({
  title,
  icon: Icon,
  description,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn("min-w-0 rounded-2xl", className)}>
      <div className={cn("p-4 md:p-5", contentClassName)}>
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-2">
              <Icon className="size-4" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {title}
            </h3>
            {description ? (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </Card>
  )
}

export { SectionCard }
