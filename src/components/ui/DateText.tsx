import * as React from "react"

import { cn } from "@/lib/utils"

type DateFormat = "date" | "datetime" | "relative"

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** YYYY.MM.DD (Монгол стандарт) */
function formatDatePart(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}.${m}.${day}`
}

/** HH:mm (24 цаг) */
function formatTimePart(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${min}`
}

/** "3 өдрийн өмнө", "5 минутын дараа" гэх мэт. */
function formatRelative(d: Date): string {
  const diffMs = d.getTime() - Date.now()
  const past = diffMs <= 0
  const abs = Math.abs(diffMs)

  const sec = Math.round(abs / 1000)
  const min = Math.round(sec / 60)
  const hour = Math.round(min / 60)
  const day = Math.round(hour / 24)
  const month = Math.round(day / 30)
  const year = Math.round(day / 365)

  const suffix = past ? "өмнө" : "дараа"

  if (sec < 45) return "саяхан"
  if (min < 60) return `${min} минутын ${suffix}`
  if (hour < 24) return `${hour} цагийн ${suffix}`
  if (day < 30) return `${day} өдрийн ${suffix}`
  if (month < 12) return `${month} сарын ${suffix}`
  return `${year} жилийн ${suffix}`
}

function DateText({
  value,
  format = "date",
  className,
  ...props
}: React.ComponentProps<"time"> & {
  value: string | number | Date | null | undefined
  format?: DateFormat
}) {
  const date = toDate(value)

  if (!date) {
    return (
      <time data-slot="date-text" className={cn("tabular-nums", className)} {...props}>
        —
      </time>
    )
  }

  let label: string
  if (format === "datetime") {
    label = `${formatDatePart(date)} ${formatTimePart(date)}`
  } else if (format === "relative") {
    label = formatRelative(date)
  } else {
    label = formatDatePart(date)
  }

  return (
    <time
      data-slot="date-text"
      dateTime={date.toISOString()}
      title={`${formatDatePart(date)} ${formatTimePart(date)}`}
      className={cn("tabular-nums", className)}
      {...props}
    >
      {label}
    </time>
  )
}

export { DateText }
