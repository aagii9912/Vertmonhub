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
    <Card className={className}>
      <div className={cn("px-4 md:px-6 py-4 md:py-5", contentClassName)}>
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="heading-section text-base md:text-lg text-foreground">
              {title}
            </h3>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </Card>
  )
}

export { SectionCard }
