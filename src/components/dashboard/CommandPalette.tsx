"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarCheck,
  FileText,
  Contact,
  Inbox,
  Wallet,
  BarChart3,
  Settings,
} from "lucide-react"

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/Command"

type RouteEntry = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  keywords?: string[]
}

type RouteSection = {
  heading: string
  items: RouteEntry[]
}

const ROUTE_SECTIONS: RouteSection[] = [
  {
    heading: "Үндсэн",
    items: [
      {
        label: "Хяналт",
        href: "/dashboard",
        icon: LayoutDashboard,
        keywords: ["dashboard", "home", "нүүр", "хяналтын самбар"],
      },
      {
        label: "Inbox",
        href: "/dashboard/inbox",
        icon: Inbox,
        keywords: ["inbox", "чат", "мессеж", "захидал"],
      },
    ],
  },
  {
    heading: "Борлуулалт",
    items: [
      {
        label: "Үл хөдлөх",
        href: "/dashboard/properties",
        icon: Building2,
        keywords: ["properties", "байр", "орон сууц", "хөрөнгө"],
      },
      {
        label: "Лидүүд",
        href: "/dashboard/leads",
        icon: Users,
        keywords: ["leads", "лид", "сонирхогч"],
      },
      {
        label: "Уулзалт",
        href: "/dashboard/viewings",
        icon: CalendarCheck,
        keywords: ["viewings", "уулзалт", "үзлэг", "захиалга"],
      },
      {
        label: "Гэрээ",
        href: "/dashboard/contracts",
        icon: FileText,
        keywords: ["contracts", "гэрээ", "хэлцэл"],
      },
      {
        label: "Харилцагч",
        href: "/dashboard/customers",
        icon: Contact,
        keywords: ["customers", "харилцагч", "хэрэглэгч", "crm"],
      },
    ],
  },
  {
    heading: "Тайлан & Тохиргоо",
    items: [
      {
        label: "Санхүү",
        href: "/dashboard/finance",
        icon: Wallet,
        keywords: ["finance", "санхүү", "төлбөр", "орлого"],
      },
      {
        label: "Тайлан",
        href: "/dashboard/reports",
        icon: BarChart3,
        keywords: ["reports", "тайлан", "статистик", "аналитик"],
      },
      {
        label: "Тохиргоо",
        href: "/dashboard/settings",
        icon: Settings,
        keywords: ["settings", "тохиргоо", "тохируулга"],
      },
    ],
  },
]

/** Custom window event that opens the palette (dispatched by the header search button). */
export const OPEN_COMMAND_EVENT = "vertmon:open-command"

export interface CommandPaletteProps {
  /** Also open the palette when the user presses "/" outside an input. Default false. */
  enableSlashKey?: boolean
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  )
}

export function CommandPalette({ enableSlashKey = false }: CommandPaletteProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ⌘K / Ctrl+K — toggle from anywhere
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }
      // "/" — open only when not typing in a field
      if (
        enableSlashKey &&
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault()
        setOpen(true)
      }
    }

    function onOpenEvent() {
      setOpen(true)
    }

    document.addEventListener("keydown", onKeyDown)
    window.addEventListener(OPEN_COMMAND_EVENT, onOpenEvent)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpenEvent)
    }
  }, [enableSlashKey])

  const handleSelect = React.useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Команд хайлт"
      description="Хуудас руу шилжих эсвэл команд ажиллуулах"
    >
      <CommandInput />
      <CommandList>
        <CommandEmpty />
        {ROUTE_SECTIONS.map((section, sectionIndex) => (
          <CommandGroup key={section.heading} heading={section.heading}>
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  keywords={item.keywords}
                  onSelect={() => handleSelect(item.href)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                  {sectionIndex === 0 && item.href === "/dashboard" ? (
                    <CommandShortcut>⌘K</CommandShortcut>
                  ) : null}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
