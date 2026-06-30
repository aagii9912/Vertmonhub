"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Rows3Icon,
  Rows4Icon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { Checkbox } from "@/components/ui/Checkbox"
import { TableSkeleton } from "@/components/ui/LoadingSkeleton"

// Re-export the leaf cell primitives so consumers can build column.cell renderers
// without juggling import paths: <Money>, <DateText>, <StatusPill>.
export { Money } from "@/components/ui/Money"
export { DateText } from "@/components/ui/DateText"
export { StatusPill, statusPillVariants } from "@/components/ui/StatusPill"

type Align = "left" | "center" | "right"
type SortDirection = "asc" | "desc"
type Density = "comfortable" | "compact"

export interface DataTableColumn<T> {
  /** Stable key — also used as the React key and the sort identifier. */
  key: string
  /** Header label (string or node). */
  header: React.ReactNode
  /** Extract a sortable/displayable primitive value from the row. */
  accessor?: (row: T) => React.ReactNode
  /** Fully custom cell renderer (takes precedence over accessor). */
  cell?: (row: T) => React.ReactNode
  /** Enable click-to-sort on this column's header. */
  sortable?: boolean
  /** Horizontal alignment for header + cells. */
  align?: Align
  /** Fixed width (e.g. "12rem" or 160). */
  width?: string | number
  /** Extra classes applied to both <th> and <td> for this column. */
  className?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** Stable id per row — required for keys + selection. */
  getRowId: (row: T) => string
  /** Screen-reader-only caption describing the table. */
  caption?: string
  /** Row click handler — rows become keyboard-operable buttons when set. */
  onRowClick?: (row: T) => void

  /** Show the TableSkeleton instead of rows. */
  loading?: boolean
  /** Message shown when there are no rows. */
  emptyMessage?: string

  // --- Selection ---
  /** Enable the leading checkbox column + bulk action bar. */
  selectable?: boolean
  /** Controlled set of selected row ids. */
  selectedIds?: string[]
  /** Fires with the next selection set whenever it changes. */
  onSelectionChange?: (ids: string[]) => void
  /** Rendered inside the bulk-action bar (e.g. buttons) when rows are selected. */
  bulkActions?: React.ReactNode

  // --- Density ---
  /** Initial density. Defaults to "comfortable". */
  defaultDensity?: Density
  /** Hide the comfortable/compact toggle. */
  showDensityToggle?: boolean

  // --- Pagination ---
  /**
   * Pagination mode:
   * - omit `page`/`onPageChange` → client-side pager over `data`
   * - pass `page` + `onPageChange` + `total` → server/controlled pager
   */
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
  /** Hide the pager entirely. */
  hidePagination?: boolean

  className?: string
}

const alignClass: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

const densityCell: Record<Density, string> = {
  comfortable: "px-4 py-3",
  compact: "px-4 py-2",
}

const densityHead: Record<Density, string> = {
  comfortable: "px-4 py-3",
  compact: "px-4 py-2.5",
}

function ariaSort(
  active: boolean,
  direction: SortDirection
): React.AriaAttributes["aria-sort"] {
  if (!active) return "none"
  return direction === "asc" ? "ascending" : "descending"
}

/**
 * Compare two cell values for client-side sorting.
 * Numbers sort numerically; everything else falls back to locale string compare.
 */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1

  if (typeof a === "number" && typeof b === "number") return a - b

  const an = Number(a)
  const bn = Number(b)
  if (Number.isFinite(an) && Number.isFinite(bn) && a !== "" && b !== "") {
    return an - bn
  }

  return String(a).localeCompare(String(b), "mn")
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  caption = "Өгөгдлийн хүснэгт",
  onRowClick,
  loading = false,
  emptyMessage = "Бичлэг олдсонгүй",
  selectable = false,
  selectedIds,
  onSelectionChange,
  bulkActions,
  defaultDensity = "comfortable",
  showDensityToggle = true,
  page,
  pageSize = 20,
  total,
  onPageChange,
  hidePagination = false,
  className,
}: DataTableProps<T>) {
  const [density, setDensity] = React.useState<Density>(defaultDensity)
  const [sort, setSort] = React.useState<{
    key: string
    direction: SortDirection
  } | null>(null)

  // Selection: controlled when selectedIds is provided, otherwise internal.
  const [internalSelected, setInternalSelected] = React.useState<string[]>([])
  const selected = selectedIds ?? internalSelected
  const setSelected = React.useCallback(
    (ids: string[]) => {
      if (selectedIds === undefined) setInternalSelected(ids)
      onSelectionChange?.(ids)
    },
    [selectedIds, onSelectionChange]
  )

  // Pagination: server-mode when `page` + `onPageChange` are provided.
  const isServerPaged = page !== undefined && onPageChange !== undefined
  const [internalPage, setInternalPage] = React.useState(1)
  const currentPage = isServerPaged ? (page as number) : internalPage

  // --- Sorting (client-side only; server consumers pre-sort their data) ---
  const sortedData = React.useMemo(() => {
    if (!sort || isServerPaged) return data
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.accessor) return data
    const accessor = col.accessor
    const next = [...data].sort((ra, rb) => {
      const cmp = compareValues(accessor(ra), accessor(rb))
      return sort.direction === "asc" ? cmp : -cmp
    })
    return next
  }, [data, sort, columns, isServerPaged])

  // --- Pagination slice ---
  const totalCount = total ?? sortedData.length
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))

  const pageRows = React.useMemo(() => {
    if (isServerPaged) return sortedData // server already returns the page
    const start = (currentPage - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, isServerPaged, currentPage, pageSize])

  const goToPage = React.useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(1, next), pageCount)
      if (isServerPaged) onPageChange?.(clamped)
      else setInternalPage(clamped)
    },
    [isServerPaged, onPageChange, pageCount]
  )

  // --- Selection helpers (scoped to the visible page) ---
  const pageIds = React.useMemo(
    () => pageRows.map((r) => getRowId(r)),
    [pageRows, getRowId]
  )
  const selectedOnPage = pageIds.filter((id) => selected.includes(id))
  const allPageSelected =
    pageIds.length > 0 && selectedOnPage.length === pageIds.length
  const somePageSelected =
    selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelected(Array.from(new Set([...selected, ...pageIds])))
    } else {
      setSelected(selected.filter((id) => !pageIds.includes(id)))
    }
  }

  const toggleRow = (id: string, checked: boolean) => {
    if (checked) setSelected(Array.from(new Set([...selected, id])))
    else setSelected(selected.filter((s) => s !== id))
  }

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" }
      return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
    })
  }

  const colSpan = columns.length + (selectable ? 1 : 0)

  // Range label, e.g. "1–20 / 1617"
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = isServerPaged
    ? Math.min(currentPage * pageSize, totalCount)
    : Math.min(currentPage * pageSize, totalCount)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Toolbar: bulk-action bar OR density toggle */}
      {(selectable && selected.length > 0) || showDensityToggle ? (
        <div className="flex items-center justify-between gap-3">
          {selectable && selected.length > 0 ? (
            <div
              role="status"
              className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2"
            >
              <span className="text-sm font-medium text-brand-strong tabular-nums">
                {selected.length} сонгогдсон
              </span>
              <div className="flex items-center gap-2">
                {bulkActions}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected([])}
                >
                  Цуцлах
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {showDensityToggle && (
            <div className="flex items-center gap-1">
              <Button
                variant={density === "comfortable" ? "secondary" : "ghost"}
                size="iconSm"
                aria-label="Тав тухтай харагдац"
                aria-pressed={density === "comfortable"}
                onClick={() => setDensity("comfortable")}
              >
                <Rows3Icon className="size-4" />
                <span className="sr-only">Тав тухтай харагдац</span>
              </Button>
              <Button
                variant={density === "compact" ? "secondary" : "ghost"}
                size="iconSm"
                aria-label="Нягт харагдац"
                aria-pressed={density === "compact"}
                onClick={() => setDensity("compact")}
              >
                <Rows4Icon className="size-4" />
                <span className="sr-only">Нягт харагдац</span>
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* Table shell */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>

          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border">
              {selectable && (
                <th
                  scope="col"
                  className={cn(
                    "w-px bg-surface text-fg-2",
                    densityHead[density]
                  )}
                >
                  <Checkbox
                    aria-label="Бүгдийг сонгох"
                    checked={
                      allPageSelected
                        ? true
                        : somePageSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(c) => toggleAll(c === true)}
                    disabled={loading || pageIds.length === 0}
                  />
                </th>
              )}

              {columns.map((col) => {
                const align = col.align ?? "left"
                const isActive = sort?.key === col.key
                const direction: SortDirection = isActive
                  ? sort!.direction
                  : "asc"
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      col.sortable ? ariaSort(isActive, direction) : undefined
                    }
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "bg-surface text-2xs font-semibold uppercase tracking-wide text-muted-2 whitespace-nowrap",
                      alignClass[align],
                      densityHead[density],
                      col.className
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={cn(
                          "group inline-flex items-center gap-1.5 rounded-md text-2xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground",
                          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          isActive ? "text-foreground" : "text-muted-2",
                          align === "right" && "flex-row-reverse"
                        )}
                      >
                        <span>{col.header}</span>
                        {isActive ? (
                          direction === "asc" ? (
                            <ArrowUpIcon
                              className="size-3.5 text-brand-strong"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowDownIcon
                              className="size-3.5 text-brand-strong"
                              aria-hidden="true"
                            />
                          )
                        ) : (
                          <ArrowUpDownIcon
                            className="size-3.5 opacity-50 transition-opacity group-hover:opacity-80"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="p-4">
                  <TableSkeleton rows={pageSize > 8 ? 8 : pageSize} />
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const id = getRowId(row)
                const isSelected = selected.includes(id)
                const clickable = !!onRowClick
                return (
                  <tr
                    key={id}
                    data-state={isSelected ? "selected" : undefined}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              onRowClick(row)
                            }
                          }
                        : undefined
                    }
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? "button" : undefined}
                    className={cn(
                      "border-b border-border last:border-b-0 transition-colors",
                      isSelected
                        ? "bg-brand-soft/60"
                        : "hover:bg-surface-2",
                      clickable &&
                        "cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset"
                    )}
                  >
                    {selectable && (
                      <td
                        className={cn("w-px", densityCell[density])}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label="Мөр сонгох"
                          checked={isSelected}
                          onCheckedChange={(c) => toggleRow(id, c === true)}
                        />
                      </td>
                    )}

                    {columns.map((col) => {
                      const align = col.align ?? "left"
                      const content = col.cell
                        ? col.cell(row)
                        : col.accessor
                          ? col.accessor(row)
                          : null
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "text-foreground align-middle",
                            alignClass[align],
                            densityCell[density],
                            col.className
                          )}
                        >
                          {content}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      {!hidePagination && !loading && totalCount > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground tabular-nums">
            Нийт {totalCount}
            <span className="mx-1.5 text-border-strong">·</span>
            <span className="text-fg-2">
              {rangeStart}–{rangeEnd}
            </span>
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Өмнөх хуудас"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeftIcon className="size-4" />
              <span className="sr-only">Өмнөх хуудас</span>
            </Button>

            <span className="min-w-24 text-center text-sm text-fg-2 tabular-nums">
              Хуудас {currentPage}/{pageCount}
            </span>

            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Дараах хуудас"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= pageCount}
            >
              <ChevronRightIcon className="size-4" />
              <span className="sr-only">Дараах хуудас</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

DataTable.displayName = "DataTable"
