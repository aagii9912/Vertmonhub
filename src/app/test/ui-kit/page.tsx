"use client"

import * as React from "react"
import {
  XIcon,
  PencilIcon,
  TrashIcon,
  MoreVerticalIcon,
  FilterIcon,
  BellIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

// --- Primitives (Wave 1) ---
import { Button } from "@/components/ui/Button"
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"

// --- Form controls ---
import { Switch } from "@/components/ui/Switch"
import { Checkbox } from "@/components/ui/Checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup"
import {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "@/components/ui/Select"
import { FormField, FieldGroup, FieldRow } from "@/components/ui/FormField"

// --- Feedback ---
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert"
import { toast, confirmToast } from "@/components/ui/Toast"

// --- Overlays ---
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/Dialog"
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/Sheet"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/Popover"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/Tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/Dropdown"

// --- Data display ---
import { StatusPill } from "@/components/ui/StatusPill"
import { Money } from "@/components/ui/Money"
import { DateText } from "@/components/ui/DateText"
import { Badge } from "@/components/ui/Badge"
import { Separator } from "@/components/ui/Separator"

// --- DataTable v2 ---
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"

// --- Charts ---
import { ChartCard } from "@/components/ui/ChartCard"
import { BarChart } from "@/components/charts/BarChart"
import { LineChart } from "@/components/charts/LineChart"
import { DonutChart } from "@/components/charts/DonutChart"
import { AgingBar } from "@/components/charts/AgingBar"
import { Sparkline } from "@/components/charts/Sparkline"

// --- Navigation ---
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/Breadcrumb"

// --- Command palette ---
import { CommandPalette } from "@/components/dashboard/CommandPalette"

import { formatMNT } from "@/lib/utils/currency"

/* -------------------------------------------------------------------------- */
/*  Section wrapper                                                            */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h2 className="heading-section text-lg text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sample data                                                               */
/* -------------------------------------------------------------------------- */

type SampleRow = {
  id: string
  name: string
  type: string
  budget: number
  createdAt: string
  status: "active" | "pending" | "won" | "lost"
}

const SAMPLE_ROWS: SampleRow[] = [
  {
    id: "1",
    name: "Б. Болдбаатар",
    type: "Орон сууц",
    budget: 380_000_000,
    createdAt: "2026-06-28T09:30:00Z",
    status: "active",
  },
  {
    id: "2",
    name: "Д. Сараа",
    type: "Хувийн байшин",
    budget: 1_200_000_000,
    createdAt: "2026-06-25T14:05:00Z",
    status: "pending",
  },
  {
    id: "3",
    name: "Г. Энхжин",
    type: "Оффис",
    budget: 750_000_000,
    createdAt: "2026-06-21T11:15:00Z",
    status: "won",
  },
  {
    id: "4",
    name: "Т. Мөнхбат",
    type: "Орон сууц",
    budget: 240_000_000,
    createdAt: "2026-06-18T16:40:00Z",
    status: "lost",
  },
  {
    id: "5",
    name: "Н. Алтанцэцэг",
    type: "Газар",
    budget: 95_000_000,
    createdAt: "2026-06-15T08:00:00Z",
    status: "active",
  },
  {
    id: "6",
    name: "О. Батжаргал",
    type: "Хувийн байшин",
    budget: 540_000_000,
    createdAt: "2026-06-10T13:20:00Z",
    status: "pending",
  },
]

const STATUS_LABEL: Record<
  SampleRow["status"],
  { label: string; variant: "active" | "pending" | "success" | "danger" }
> = {
  active: { label: "Идэвхтэй", variant: "active" },
  pending: { label: "Хүлээгдэж буй", variant: "pending" },
  won: { label: "Хаагдсан", variant: "success" },
  lost: { label: "Алдсан", variant: "danger" },
}

const BAR_DATA = [
  { district: "Сүхбаатар", sale: 18, rent: 7 },
  { district: "Хан-Уул", sale: 24, rent: 11 },
  { district: "Баянзүрх", sale: 15, rent: 9 },
  { district: "Чингэлтэй", sale: 12, rent: 5 },
]

const LINE_DATA = [
  { week: "1-р 7 хоног", leads: 12 },
  { week: "2-р 7 хоног", leads: 19 },
  { week: "3-р 7 хоног", leads: 16 },
  { week: "4-р 7 хоног", leads: 27 },
]

const DONUT_DATA = [
  { name: "Орон сууц", value: 42 },
  { name: "Хувийн байшин", value: 18 },
  { name: "Оффис", value: 11 },
  { name: "Газар", value: 7 },
]

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function UiKitPage() {
  // Form-control demo state
  const [notify, setNotify] = React.useState(true)
  const [agreed, setAgreed] = React.useState<boolean | "indeterminate">(false)
  const [deal, setDeal] = React.useState("sale")
  const [propertyType, setPropertyType] = React.useState<string | undefined>(
    undefined
  )

  // DataTable selection state (controlled)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  const columns: DataTableColumn<SampleRow>[] = [
    {
      key: "name",
      header: "Нэр",
      accessor: (r) => r.name,
      sortable: true,
    },
    {
      key: "type",
      header: "Төрөл",
      accessor: (r) => r.type,
      sortable: true,
    },
    {
      key: "budget",
      header: "Төсөв",
      align: "right",
      sortable: true,
      accessor: (r) => r.budget,
      cell: (r) => <Money value={r.budget} />,
    },
    {
      key: "createdAt",
      header: "Огноо",
      accessor: (r) => r.createdAt,
      sortable: true,
      cell: (r) => <DateText value={r.createdAt} />,
    },
    {
      key: "status",
      header: "Төлөв",
      cell: (r) => {
        const s = STATUS_LABEL[r.status]
        return (
          <StatusPill variant={s.variant} dot>
            {s.label}
          </StatusPill>
        )
      },
    },
  ]

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 md:px-6 md:py-14">
          {/* Page header */}
          <header className="flex flex-col gap-3">
            <p className="text-2xs uppercase tracking-widest text-muted-2">
              VERTMON HUB · WAVE 1
            </p>
            <h1 className="heading-display text-3xl text-foreground md:text-4xl">
              UI Kit · Компонент жагсаалт
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Дахин загварчлалын эхний долгионы бүх анхдагч компонентуудыг нэг
              хуудсанд цуглуулсан үзүүлэн. Энэ нь нэгдсэн туршилт болон хүртээмж
              (a11y) хяналтын гадаргуу болж ажиллана.
            </p>
          </header>

          {/* ----------------------------------------------------------------- */}
          {/* Buttons + interactive Card                                        */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Товчлуурууд"
            description="Бүх хувилбар, хэмжээ, ачаалж буй төлөв болон интерактив карт."
          >
            <Card>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary">Үндсэн</Button>
                  <Button variant="secondary">Хоёрдогч</Button>
                  <Button variant="tertiary">Гуравдагч</Button>
                  <Button variant="outline">Хүрээтэй</Button>
                  <Button variant="ghost">Сүүдэргүй</Button>
                  <Button variant="danger">Устгах</Button>
                  <Button variant="link">Холбоос</Button>
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Жижиг</Button>
                  <Button size="md">Дунд</Button>
                  <Button size="lg">Том</Button>
                  <Button size="icon" aria-label="Засах">
                    <PencilIcon className="size-4" />
                    <span className="sr-only">Засах</span>
                  </Button>
                  <Button size="iconSm" variant="ghost" aria-label="Цэс нээх">
                    <MoreVerticalIcon className="size-4" />
                    <span className="sr-only">Цэс нээх</span>
                  </Button>
                  <Button isLoading>Хадгалж байна</Button>
                  <Button variant="secondary" disabled>
                    Идэвхгүй
                  </Button>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Card
                    interactive
                    tabIndex={0}
                    role="button"
                    onClick={() => toast("Картын дэлгэрэнгүй нээгдлээ")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        toast("Картын дэлгэрэнгүй нээгдлээ")
                      }
                    }}
                  >
                    <CardHeader>
                      <CardTitle>Интерактив карт</CardTitle>
                      <CardDescription>
                        Дарж эсвэл Enter/Space товчоор нээнэ.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Үл хөдлөх хөрөнгийн дэлгэрэнгүй мэдээлэл рүү шилжих карт.
                      </p>
                    </CardContent>
                  </Card>

                  <Card variant="muted">
                    <CardHeader>
                      <CardTitle>Энгийн карт</CardTitle>
                      <CardDescription>
                        Интерактив бус, зөвхөн агуулга харуулна.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Гарчиг, тайлбар, агуулгын хэсгүүдтэй.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* ----------------------------------------------------------------- */}
          {/* Form controls                                                     */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Формын удирдлагууд"
            description="Input, Textarea, Select, Switch, Checkbox, RadioGroup — FormField болон FieldRow дотор."
          >
            <Card>
              <CardContent className="flex flex-col gap-6">
                <FieldGroup>
                  <FormField
                    label="Утасны дугаар"
                    htmlFor="phone"
                    required
                    hint="8 оронтой дугаар оруулна уу"
                  >
                    <Input
                      id="phone"
                      inputMode="numeric"
                      placeholder="9911-2233"
                      aria-describedby="phone-hint"
                    />
                  </FormField>

                  <FormField
                    label="И-мэйл хаяг"
                    htmlFor="email"
                    error="И-мэйл хаяг буруу байна"
                  >
                    <Input
                      id="email"
                      type="email"
                      defaultValue="buruu-email"
                      aria-invalid
                      aria-describedby="email-error"
                    />
                  </FormField>

                  <FormField
                    label="Тэмдэглэл"
                    htmlFor="note"
                    hint="Дотоод тэмдэглэл — харилцагчид харагдахгүй."
                  >
                    <Textarea
                      id="note"
                      placeholder="Тэмдэглэл бичих..."
                      aria-describedby="note-hint"
                    />
                  </FormField>

                  <FormField label="Үл хөдлөхийн төрөл" htmlFor="ptype">
                    <Select
                      value={propertyType}
                      onValueChange={setPropertyType}
                    >
                      <SelectTrigger className="w-full sm:w-72" id="ptype">
                        <SelectValue placeholder="Сонгох" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Орон сууц</SelectLabel>
                          <SelectItem value="apt">Орон сууц</SelectItem>
                          <SelectItem value="house">Хувийн байшин</SelectItem>
                          <SelectSeparator />
                          <SelectLabel>Бусад</SelectLabel>
                          <SelectItem value="office">Оффис</SelectItem>
                          <SelectItem value="land">Газар</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormField>
                </FieldGroup>

                <Separator />

                <FieldRow
                  label={
                    <div className="flex flex-col gap-0.5">
                      <span>Мэдэгдэл</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Шинэ лид ирэхэд push мэдэгдэл авах.
                      </span>
                    </div>
                  }
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={notify}
                      onCheckedChange={setNotify}
                      aria-label="Мэдэгдэл идэвхжүүлэх"
                    />
                    <span className="text-sm text-muted-foreground">
                      {notify ? "Идэвхтэй" : "Идэвхгүй"}
                    </span>
                  </div>
                </FieldRow>

                <FieldRow
                  label={
                    <div className="flex flex-col gap-0.5">
                      <span>Гэрээний төрөл</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Зарах эсвэл түрээслэх.
                      </span>
                    </div>
                  }
                >
                  <RadioGroup value={deal} onValueChange={setDeal}>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="sale" id="deal-sale" />
                      <span>Зарах</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="rent" id="deal-rent" />
                      <span>Түрээслэх</span>
                    </label>
                  </RadioGroup>
                </FieldRow>

                <FieldRow
                  label={
                    <div className="flex flex-col gap-0.5">
                      <span>Зөвшөөрөл</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Үйлчилгээний нөхцөлийг зөвшөөрөх.
                      </span>
                    </div>
                  }
                >
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={agreed}
                      onCheckedChange={(c) => setAgreed(c)}
                      aria-label="Үйлчилгээний нөхцөл зөвшөөрөх"
                    />
                    <span>Үйлчилгээний нөхцөлийг зөвшөөрч байна</span>
                  </label>
                </FieldRow>
              </CardContent>
            </Card>
          </Section>

          {/* ----------------------------------------------------------------- */}
          {/* Feedback                                                          */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Санал хүсэлт"
            description="Alert хувилбарууд, toast болон баталгаажуулах харилцах цонх."
          >
            <Card>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <Alert variant="info">
                    <AlertTitle>Мэдээлэл</AlertTitle>
                    <AlertDescription>
                      Шинэ боломжууд нэмэгдлээ.
                    </AlertDescription>
                  </Alert>
                  <Alert variant="success">
                    <AlertTitle>Амжилттай</AlertTitle>
                    <AlertDescription>
                      Гэрээ амжилттай хадгалагдлаа.
                    </AlertDescription>
                  </Alert>
                  <Alert variant="warning">
                    <AlertTitle>Анхааруулга</AlertTitle>
                    <AlertDescription>
                      Энэ лидтэй 7 хоног холбогдоогүй байна.
                    </AlertDescription>
                  </Alert>
                  <Alert variant="danger">
                    <AlertTitle>Алдаа гарлаа</AlertTitle>
                    <AlertDescription>
                      Хадгалах үед алдаа гарлаа. Дахин оролдоно уу.
                    </AlertDescription>
                  </Alert>
                  <Alert variant="brand">
                    <AlertTitle>Онцлох</AlertTitle>
                    <AlertDescription>
                      AI туслах танд 3 шинэ зөвлөгөө бэлдлээ.
                    </AlertDescription>
                  </Alert>
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => toast.success("Хадгаллаа")}>
                    Амжилттай toast
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => toast.error("Алдаа гарлаа")}
                  >
                    Алдааны toast
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={() =>
                      toast("Шинэ лид", {
                        description: "Б. Болдбаатар сонирхож байна.",
                      })
                    }
                  >
                    Тайлбартай toast
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      const ok = await confirmToast({
                        title: "Бичлэг устгах уу?",
                        description: "Энэ үйлдлийг буцаах боломжгүй.",
                        destructive: true,
                      })
                      if (ok) toast.success("Устгалаа")
                      else toast("Цуцлагдлаа")
                    }}
                  >
                    Баталгаажуулах
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* ----------------------------------------------------------------- */}
          {/* Overlays                                                          */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Давхарга цонхнууд"
            description="Dialog, Sheet (4 тал), Popover, Tooltip, Dropdown."
          >
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3">
                {/* Dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Dialog нээх</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Үл хөдлөх хөрөнгө нэмэх</DialogTitle>
                      <DialogDescription>
                        Шинэ зарын мэдээллийг оруулна уу.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                      <Input placeholder="Гарчиг" />
                      <Input placeholder="Үнэ" inputMode="numeric" />
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Цуцлах</Button>
                      </DialogClose>
                      <Button>Хадгалах</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Sheets — one per side */}
                {(["right", "left", "top", "bottom"] as const).map((side) => (
                  <Sheet key={side}>
                    <SheetTrigger asChild>
                      <Button variant="secondary">
                        Sheet ({sideLabel(side)})
                      </Button>
                    </SheetTrigger>
                    <SheetContent side={side}>
                      <SheetHeader>
                        <SheetTitle>Дэлгэрэнгүй</SheetTitle>
                        <SheetDescription>
                          {sideLabel(side)} талаас гарч ирэх давхарга.
                        </SheetDescription>
                      </SheetHeader>
                      <div className="flex-1 overflow-y-auto p-6">
                        <p className="text-sm text-muted-foreground">
                          Энд үл хөдлөх хөрөнгийн дэлгэрэнгүй мэдээлэл, зураг,
                          үнийн түүх зэрэг харагдана.
                        </p>
                      </div>
                      <SheetFooter>
                        <SheetClose asChild>
                          <Button variant="outline">Цуцлах</Button>
                        </SheetClose>
                        <Button>Хадгалах</Button>
                      </SheetFooter>
                    </SheetContent>
                  </Sheet>
                ))}

                {/* Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <FilterIcon className="size-4" />
                      Шүүлтүүр
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start">
                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-medium text-foreground">
                        Үнийн хязгаар
                      </p>
                      <div className="flex items-center gap-2">
                        <Input placeholder="Доод" inputMode="numeric" />
                        <Input placeholder="Дээд" inputMode="numeric" />
                      </div>
                      <Button size="sm" className="w-full">
                        Хэрэглэх
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Мэдэгдэл"
                    >
                      <BellIcon className="size-4" />
                      <span className="sr-only">Мэдэгдэл</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Мэдэгдэл</TooltipContent>
                </Tooltip>

                {/* Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary">
                      <MoreVerticalIcon className="size-4" />
                      Үйлдэл
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Үйлдэл</DropdownMenuLabel>
                    <DropdownMenuItem>
                      <PencilIcon />
                      Засах
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <FilterIcon />
                      Хувилах
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="danger">
                      <TrashIcon />
                      Устгах
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          </Section>

          {/* ----------------------------------------------------------------- */}
          {/* Data display                                                      */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Өгөгдөл харуулах"
            description="StatusPill, Money, DateText, Badge."
          >
            <Card>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <p className="text-2xs uppercase tracking-wide text-muted-2">
                    StatusPill
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill variant="success" dot>
                      Идэвхтэй
                    </StatusPill>
                    <StatusPill variant="pending">Хүлээгдэж буй</StatusPill>
                    <StatusPill variant="danger" dot>
                      Цуцлагдсан
                    </StatusPill>
                    <StatusPill variant="info">Мэдээлэл</StatusPill>
                    <StatusPill variant="active" dot>
                      Яваа
                    </StatusPill>
                    <StatusPill variant="neutral">Энгийн</StatusPill>
                    <StatusPill variant="brand">Онцлох</StatusPill>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-2xs uppercase tracking-wide text-muted-2">
                    Badge
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">Энгийн</Badge>
                    <Badge variant="brand">Брэнд</Badge>
                    <Badge variant="success">Амжилттай</Badge>
                    <Badge variant="pending">Хүлээгдэж буй</Badge>
                    <Badge variant="danger">Алдаа</Badge>
                    <Badge variant="info">Мэдээлэл</Badge>
                    <Badge variant="outline">Хүрээтэй</Badge>
                    <Badge variant="vip" size="md">
                      VIP
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-2xs uppercase tracking-wide text-muted-2">
                      Мөнгөн дүн (Money)
                    </p>
                    <p className="text-base font-semibold text-foreground">
                      <Money value={380_000_000} />
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <Money value={1_200_000_000} compact /> ·{" "}
                      <Money value={null} />
                    </p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <p className="text-2xs uppercase tracking-wide text-muted-2">
                      Огноо (DateText)
                    </p>
                    <p className="text-base font-semibold text-foreground">
                      <DateText value="2026-06-30T14:05:00Z" />
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <DateText
                        value="2026-06-30T14:05:00Z"
                        format="datetime"
                      />{" "}
                      ·{" "}
                      <DateText
                        value="2026-06-27T14:05:00Z"
                        format="relative"
                      />
                    </p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <p className="text-2xs uppercase tracking-wide text-muted-2">
                      Sparkline
                    </p>
                    <Sparkline
                      data={[3, 5, 4, 8, 6, 9, 12]}
                      area
                      aria-label="7 хоногийн чиг хандлага"
                    />
                    <p className="text-sm text-muted-foreground">
                      7 хоногийн чиг хандлага
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* ----------------------------------------------------------------- */}
          {/* DataTable v2                                                       */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Өгөгдлийн хүснэгт (DataTable)"
            description="Эрэмбэлэх багана, мөр сонголт + бөөнөөр үйлдэл, хуудаслалт болон нүдний рендерүүд."
          >
            <DataTable<SampleRow>
              caption="Лидийн жагсаалт"
              columns={columns}
              data={SAMPLE_ROWS}
              getRowId={(r) => r.id}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              bulkActions={
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    toast.success(`${selectedIds.length} мөр устгалаа`)
                    setSelectedIds([])
                  }}
                >
                  Устгах
                </Button>
              }
              onRowClick={(r) => toast(`${r.name} сонгогдлоо`)}
              pageSize={4}
            />
          </Section>

          {/* ----------------------------------------------------------------- */}
          {/* Charts                                                            */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Графикууд"
            description="BarChart, LineChart, DonutChart, AgingBar — ChartCard дотор."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="Дүүргээр"
                subtitle="Зарах vs Түрээс"
                eyebrow="БОРЛУУЛАЛТ"
                height={280}
                actions={
                  <Button size="sm" variant="ghost">
                    Шүүх
                  </Button>
                }
              >
                <BarChart
                  data={BAR_DATA}
                  xKey="district"
                  stacked
                  series={[
                    { key: "sale", name: "Зарах" },
                    { key: "rent", name: "Түрээс" },
                  ]}
                />
              </ChartCard>

              <ChartCard
                title="Лидийн чиг хандлага"
                subtitle="Сүүлийн 4 долоо хоног"
                height={280}
              >
                <LineChart
                  data={LINE_DATA}
                  xKey="week"
                  series={[{ key: "leads", name: "Лид" }]}
                />
              </ChartCard>

              <ChartCard
                title="Үл хөдлөхийн төрөл"
                eyebrow="БАЙРШИЛ"
                height={280}
              >
                <DonutChart data={DONUT_DATA} centerLabel="Нийт" />
              </ChartCard>

              <ChartCard
                title="Авлагын насжилт"
                subtitle="Цуглуулаагүй төлбөр"
                height={280}
              >
                <AgingBar
                  buckets={{
                    current: 8_000_000,
                    d30: 3_200_000,
                    d60: 1_100_000,
                    d90: 900_000,
                  }}
                  valueFormatter={(v) => formatMNT(v, { compact: true })}
                />
              </ChartCard>
            </div>
          </Section>

          {/* ----------------------------------------------------------------- */}
          {/* Navigation + Command                                              */}
          {/* ----------------------------------------------------------------- */}
          <Section
            title="Навигаци"
            description="Breadcrumb, Separator болон Command палитр."
          >
            <Card>
              <CardContent className="flex flex-col gap-6">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/dashboard">Нүүр</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/dashboard/properties">
                        Үл хөдлөх
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Дэлгэрэнгүй</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>

                <Separator />

                <div className="flex items-center gap-4">
                  <p className="text-sm text-muted-foreground">
                    Command палитрыг{" "}
                    <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-2xs tabular-nums">
                      ⌘K
                    </kbd>{" "}
                    эсвэл доорх товчоор нээнэ.
                  </p>
                  <Separator orientation="vertical" className="h-6" />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // Trigger the global ⌘K listener registered by CommandPalette
                      document.dispatchEvent(
                        new KeyboardEvent("keydown", {
                          key: "k",
                          metaKey: true,
                          bubbles: true,
                        })
                      )
                    }}
                  >
                    Command палитр нээх
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Section>

          <footer className="flex items-center gap-2 pt-4 text-2xs text-muted-2">
            <XIcon className="size-3.5" aria-hidden="true" />
            <span>
              Vertmon Hub UI Kit · Зөвхөн хөгжүүлэлтийн үзүүлэн (RBAC хамгаалалтгүй)
            </span>
          </footer>
        </div>

        {/* Mounted once for the ⌘K command palette. */}
        <CommandPalette />
      </div>
    </TooltipProvider>
  )
}

function sideLabel(side: "right" | "left" | "top" | "bottom"): string {
  switch (side) {
    case "right":
      return "баруун"
    case "left":
      return "зүүн"
    case "top":
      return "дээд"
    case "bottom":
      return "доод"
  }
}
