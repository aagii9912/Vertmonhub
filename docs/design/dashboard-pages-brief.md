# Design Brief — Dashboard хуудсууд (систем ба тогтвортой байдал)

> **Төлөв:** Ноорог v1 · **Огноо:** 2026-06-17 · **Эзэн:** Design
> **Хамрах хүрээ:** AI orchestrator-оос бусад **бүх** dashboard хуудас (борлуулалт, үйл ажиллагаа, аналитик, маркетинг, тохиргоо, admin).
> **Дагалдах баримт:** AI orchestrator-ийн дизайныг [ai-orchestrator-brief.md](./ai-orchestrator-brief.md)-аас үз.

---

## 0. Хамгийн чухал дүгнэлт (заавал унш)

Эдгээр хуудсууд **аль хэдийн бүрэн бүтсэн** — энэ бол «шинээр зурах» биш, **«нэг систем болгон жигдрүүлэх»** brief. 20 орчим хуудас дийлэнхдээ нэг хэв маяг (PageHeader + StatBar + FilterBar + Card + Badge) тууштай хэрэглэж байгаа нь **давуу тал**. Зорилго: байгаа суурийг *канон* болгож, **хазайсан хэсгүүдийг* засаж, дутуу хээгүй (states, charts, modals) газруудыг нөхөх.

**Эталон (reference) хэрэгжилт:** [inbox/page.tsx](src/app/dashboard/inbox/page.tsx) (100 мөр) — PageHeader + FilterBar + EmptyState + Spinner-ийг бүгдийг нь зөв ашигладаг. Шинэ/засварлах хуудас бүр үүнтэй адил байх ёстой.

**3 том хазайлт (§9-д дэлгэрэнгүй):**
1. **`/admin/*` хуудсууд систематаас гадуур** — PageHeader/AppShell/Badge/Modal/DataTable ашигладаггүй, өөр header өндөртэй, англи текст холилдсон.
2. **Off-brand ягаан** — [ai-settings/page.tsx](src/app/dashboard/ai-settings/page.tsx)-д `shadow-violet-200` ба «brand→purple» gradient байна. Энэ нь orchestrator brief-ийн **«ягаан хориотой»** дүрмийг зөрчиж байна.
3. **График div-ээр** — бүх аналитик хуудас (marketing-roi, reports) Recharts биш, гар хийцийн `<div>`-bar ашигладаг.

---

## 1. Дизайны зарчим
1. **Token-only** — өнгө/зай/радиус/сүүдэр зөвхөн `src/app/globals.css`-ийн token-оор. Шинэ hex/px, ялангуяа **ягаан/нил ягаан** хориотой (Vertmon brand = terracotta).
2. **Компонент дахин ашиглах** — гар хийцийн header/table/modal/tab/spinner бүү бич; §7-ийн нийтлэг блокийг ашигла.
3. **Эталоныг дага** — Inbox хуудсыг загвар болгон ашигла.
4. **Нэг архетип = нэг бүтэц** — ижил төрлийн хуудас ижил араг ястай (§4).
5. **Монгол хэл** — бүх UI copy монгол; зөвхөн код/tool нэр англиар (admin-ийн англи үлдэгдлийг засна).
6. **Бүрэн төлөв** — хуудас бүр loading / empty / error / эрхгүй төлвийг канон хэлбэрээр харуулна (§8).

---

## 2. Visual language (сануулга)
Эх сурвалж: `src/app/globals.css`. Дэлгэрэнгүйг orchestrator brief §5-аас үз. Энд зөвхөн dashboard-д хамаатай хэсэг:

| Зориулалт | Token / класс |
|-----------|----------------|
| Brand accent | `--brand` (terracotta), soft `--brand-soft`, strong `--brand-strong` |
| Гадаргуу | `--bg` (cream), `--surface`, `--surface-2/3` |
| Статус | `--status-success / danger / pending / info / active` (+ `-soft`) |
| Гарчиг | `.heading-display` (Fraunces), `.heading-section` |
| Тоон багана | `tabular-nums` |
| Радиус | `rounded-md` (мөр/badge), `rounded-xl` (карт), `rounded-2xl` (modal) |

> **График өнгөний палитр (шинэ стандарт):** Recharts-д `--brand` (үндсэн цуваа), `--status-info`, `--status-success`, `--status-pending` дарааллаар. Ягаан/санамсаргүй hex хориотой.

---

## 3. Архитектурын суурь
- **AppShell** ([AppShell.tsx](src/components/dashboard/AppShell.tsx)) — `/dashboard/*` бүрийг Sidebar + Header + MobileNav-аар хүрээлнэ; `p-4 md:p-6 lg:p-8` падддинг өгнө. **Хуудас өөрөө гадна талын паддинг/хүрээ нэмэхгүй.**
- **Контентын өргөн:** жагсаалт/аналитик хуудас бүтэн өргөн; маягт/тохиргоо хуудас `max-w-3xl`; дэлгэрэнгүй унших контент `max-w-5xl`.
- **⚠ Admin:** `/admin/*` нь AppShell биш, тусдаа `admin/layout.tsx` ашигладаг (өөр header өндөр, өөр өнгө). §9-P1-ийг үз.

---

## 4. Хуудасны архетипүүд (template)

Бүх хуудас доорх 6 архетипийн аль нэгэнд багтана. Архетип бүр **тогтсон араг ястай**.

### A. Жагсаалт / Хүснэгт хуудас
**Хуудсууд:** properties, leads, contracts, customers, procurement, customer-service, (admin/users).
**Араг яс:**
```
PageHeader (eyebrow · title · subtitle · [primary + secondary actions])
StatBar (2–4 × StatTile — accent өнгөтэй KPI)
FilterBar (search + FilterSelect[] + [rightSlot toggle] + clear)
Card → <table> (uppercase muted thead · divide-y · hover:bg-surface-2/40)
└─ Мөрийн дэлгэрэнгүйн 3 түвшин (доороос сонго):
   • Хөнгөн   → expandable row      (ж. leads)
   • Баялаг   → баруун drawer        (ж. contracts)
   • Бүрэн/edit→ modal                (ж. customers)
```
**Дүрэм:** мөрийн төлөв = `Badge` variant; үйлдэл багана баруун талд; эрхийг `canWrite/canDelete`-аар хаалт хийнэ; хоосон үед table доторх `EmptyState`.

### B. Тойм / KPI хуудас
**Хуудсууд:** dashboard (нүүр), admin/dashboard.
**Араг яс:** `PageHeader (+ хугацааны шүүлт) → StatsCard grid (×4) → 2 баганат контент (сүүлийн жагсаалтууд + CTA карт)`.
**Дүрэм:** KPI-д `StatsCard` (өөрчлөлтийн trend badge-тэй); ачаалал `DashboardSkeleton`; mobile `PullToRefresh`.

### C. Аналитик хуудас
**Хуудсууд:** reports/leads, reports/properties, marketing-roi.
**Араг яс:** `PageHeader (+ Period шүүлт) → StatBar → 2 баганат шинжилгээ (chart + breakdown table)`.
**Шинэ стандарт:**
- **Recharts wrapper** ашигла (div-bar-ийг сольж) — brand палитртай (§2).
- Period шүүлт = нэг л дундын control (одоо хуудас бүр өөрийн toggle/select хийдэг).
- Хоосон/ачаалал = дундын `EmptyState` / `Spinner` (гар хийц биш).
- Export/Download товчийг утга оруулах (одоо placeholder).

### D. Маягт / Тохиргоо хуудас
**Хуудсууд:** settings, ai-settings, admin/settings.
**Араг яс:** `PageHeader → [Tabs] → Card хэсгүүд (форм талбар) → Save (idle/saving/saved/error төлөвтэй)`.
**Дүрэм:** `Input`/`Textarea`/`Tabs`/`Spinner` дундын компонент ашигла (гар хийцийн input/toggle/tab/spinner болих); контейнер `max-w-3xl`; toggle нэг дундын компонент болгож гаргах.

### E. Бүтээгч (Builder) хуудас
**Хуудсууд:** surveys.
**Араг яс:** `PageHeader → Tabs (Судалгаа / Маркет / Өрсөлдөгч / Сошиал) → builder canvas (зүүн: асуултын төрөл, баруун: DnD жагсаалт) ЭСВЭЛ tool grid + AI үр дүнгийн панел`.
**Дүрэм:** DnD одоогийн `@hello-pangea/dnd` хэвээр; AI үр дүнгийн markdown-ийг зөв render (одоо түүхий); Tabs-ийг дундын `Tabs` руу шилжүүлэх.

### F. Яриа / Чат хуудас
**Хуудсууд:** ai-assistant (→ [orchestrator brief](./ai-orchestrator-brief.md)), inbox (картан жагсаалтын хувилбар).
**Дүрэм:** inbox нь A-гийн «картан жагсаалт» хувилбар — PageHeader + FilterBar + `Card hover` жагсаалт + EmptyState. Энэ хэвээр сайн.

---

## 5. Хуудас бүрийн хэрэглээ (одоогийн → зорилт)

| Хуудас | Файл (мөр) | Архетип | Төлөв | Гол засвар |
|--------|-----------|---------|-------|-----------|
| Нүүр (KPI) | dashboard/page.tsx (264) | B | ✅ сайн | хугацааны шүүлтийг дундын `Dropdown` болгох |
| Үл хөдлөх | properties (414) | A | ✅ сайн | төрөл/статус enum-ийг төвлөрүүлэх |
| Лид | leads (557) | A (expand) | ✅ сайн | enum төвлөрүүлэх; expandable-row-ийг компонент болгох |
| Үзлэг | viewings (210) | A (карт) | ✅ сайн | — (цэвэрхэн) |
| Гэрээ | contracts (804) | A (drawer) | ✅ сайн | `Field`/drawer-ийг тусгаарлаж дахин ашиглах |
| Харилцагч | customers (1565) | A (modal) | ✅ сайн | файлыг хуваах; `Modal` ашиглах; enum төвлөрүүлэх |
| Үйлчилгээ | customer-service (601) | A | ✅ сайн | хүснэгтийн mobile, дундын KPI карт, `Badge` |
| Санхүү | finance (353) | A/C | ✅ сайн | trend chart (Recharts) нэмэх; transaction pagination |
| Худалдан авалт | procurement (354) | A | ✅ сайн | `Modal`/`Field`-ийг ui рүү гаргах |
| Тайлан (hub) | reports (38) | — | ⚠ stub | зөв routing/tabs (доод P3) |
| Тайлан·Лид | reports/leads (323) | C | ⚠ chart | Recharts; export утга оруулах |
| Тайлан·Үл хөдлөх | reports/properties (371) | C | ⚠ chart | Recharts; дундын EmptyState/Spinner; export |
| Маркетинг ROI | marketing-roi (648) | C | ⚠ chart | div-bar → Recharts; account selector цэгцлэх |
| Судалгаа | surveys (597) | E | ✅ сайн | `Tabs` ашиглах; AI markdown render; хариу үзэгч |
| Тохиргоо | settings (274) | D | ⚠ дрифт | `Input`/toggle дундын; `max-w-3xl` |
| AI Тохиргоо | ai-settings (608) | D | 🔴 brand | **ягаан устгах**; `Tabs`/`Spinner` дундын |
| Inbox | inbox (100) | F | ✅ **эталон** | — |
| Admin нүүр | admin/dashboard (236) | B | 🔴 систем | PageHeader/StatsCard/Badge; англи→монгол |
| Admin тохиргоо | admin/settings (217) | D | 🔴 систем | PageHeader/Input/Badge |
| Admin хэрэглэгч | admin/users (507) | A | 🔴 систем | `DataTable`+`Modal`+`Badge` |

> **Алга байгаа:** `dashboard/marketing/` route байхгүй атлаа `workspaces.ts`-д лавлагдсан — §10-Q.

---

## 6. Мөрийн дэлгэрэнгүйн харилцааны 3 түвшин (A архетипийн канон)
Жагсаалт хуудаснаа дэлгэрэнгүйг харуулах гурван зөвшөөрөгдсөн загвар — **түвшинг өгөгдлийн нягтралаар сонго**:

| Түвшин | Хэзээ | Загвар | Жишээ |
|--------|-------|--------|-------|
| **Expandable row** | 2–3 талбар нэмэлт | Мөр доор `colSpan` панел | leads (AI тойм) |
| **Right drawer** | олон таб, баялаг бичлэг | Баруунаас гарах sticky панел + tab | contracts (Info/Payment/Service/Handover) |
| **Modal** | бүрэн карт + засвар + дэд үйлдэл | Төвийн `Modal` (`size`) | customers (edit/merge/service log) |

Drawer/Modal-ийн tab толгой нэг хэвтэй: идэвхтэй tab = `bg-brand-soft text-brand-strong`.

---

## 7. Нийтлэг блокийн лавлах (энийг ашигла, гар хийц битгий)

| Компонент | Файл | Зориулалт | Гар хийцийн оронд |
|-----------|------|-----------|-------------------|
| **PageHeader** | dashboard/PageHeader.tsx (74) | Хуудас бүрийн толгой (eyebrow·title·subtitle·actions·breadcrumbs) | гар h1 толгой |
| **FilterBar + FilterSelect** | dashboard/FilterBar.tsx (85) | Хайлт + шүүлт toolbar | гар search/select |
| **StatBar + StatTile** | dashboard/StatBar.tsx (61) | 2–4 баганат KPI (accent) | гар KPI grid |
| **StatsCard** | dashboard/StatsCard.tsx (87) | KPI + trend badge (B архетип) | гар stat карт |
| **Card** (+Header/Content/Title) | ui/Card.tsx (52) | Бүх хайрцаг (variants: default/elevated/ghost/muted) | гар `div` хайрцаг |
| **Badge** (11 variant, CVA) | ui/Badge.tsx (48) | Бүх статус/түвшин/tag | inline өнгөт `span` |
| **EmptyState** | ui/EmptyState.tsx (28) | Хоосон төлөв (icon·title·desc·action) | гар «өгөгдөл алга» текст |
| **Spinner** / **LoadingSkeleton** | ui/Spinner.tsx (45) · ui/LoadingSkeleton.tsx (105) | Ачаалал/skeleton | гар `Loader2 animate-spin` |
| **DataTable** (TanStack) | ui/DataTable.tsx (226) | Эрэмбэ/сонголт/pagination хэрэгтэй хүснэгт | гар `<table>` (admin/users) |
| **Modal / Dialog / BottomSheet** | ui/Modal.tsx (90) · ui/Dialog.tsx (159) · ui/BottomSheet.tsx (76) | Поп-ап/дэлгэрэнгүй (mobile = BottomSheet) | гар `fixed inset-0` div |
| **Tabs** (Radix) | ui/Tabs.tsx (92) | Tab навигаци (default/line) | гар tab товч (ai-settings) |
| **Input / Textarea** | ui/Input.tsx · ui/Textarea.tsx | Форм талбар | inline styled `<input>` |

> **Дутуу нэмэх (шинэ дундын компонент):** `Toggle` (одоо settings/ai-settings гар хийц), `ChartCard` (Recharts wrapper, brand палитр), `PeriodFilter` (аналитик дундын), `src/lib/constants/status.ts` (төрөл/статус enum + монгол label + Badge variant нэг эх сурвалж).

---

## 8. Төлвүүдийн канон (хуудас бүр заавал)
| Төлөв | Загвар |
|-------|--------|
| **Loading** | жагсаалт → `TableSkeleton`/`Spinner size="lg"`; KPI хуудас → `DashboardSkeleton`; товч доторх үйлдэл → `Spinner size="sm"` |
| **Empty** | дундын `EmptyState` (icon + монгол title + desc + [CTA]) |
| **Error** | `loadError` + дахин ачаалах товч (finance-ийн загвар эталон); сүлжээний алдаа → `sonner` toast |
| **Эрхгүй** | үйлдэл/санал саарал + tooltip «Танд энэ модулийн эрх алга» (`canAccessModule`) |
| **Save (форм)** | idle → «Хадгалах» / saving → spinner «Хадгалж байна…» / saved → ✓ «Хадгалагдлаа» / error → улаан мессеж |

---

## 9. Тогтвортой байдлын засварын бүртгэл (эрэмбэлсэн)

### 🔴 P1 — Брэнд/систем зөрчил
- **Off-brand ягаан** — [ai-settings/page.tsx](src/app/dashboard/ai-settings/page.tsx): `shadow-violet-200`, «brand→purple» gradient. → terracotta token-оор сольж, ягаан бүрэн устгах. *(orchestrator brief-ийн «ягаан хориотой» дүрэмтэй нэг)*
- **Admin систематаас гадуур** — `admin/dashboard` (236), `admin/settings` (217), `admin/users` (507): PageHeader, AppShell хэв маяг, `Badge`, `Modal`, `DataTable` ашигладаггүй; header өндөр/өнгө өөр; «Overview / Plans / Recent Shops» зэрэг **англи текст**. → бүх admin хуудсыг дундын систем рүү оруулах, монголчлох.

### 🟠 P2 — Жигд бус хэрэглээ
- **График div-bar** — marketing-roi, reports/leads, reports/properties. → `ChartCard` (Recharts, brand палитр).
- **AI Settings гар хийц** — custom tab → `Tabs`; custom spinner → `Spinner`.
- **Settings гар хийц** — inline `<input>` → `Input`; гар toggle → дундын `Toggle`.
- **Enum давхардал** — properties/leads-д төрөл/статус тус тусдаа тодорхойлсон. → `src/lib/constants/status.ts`.
- **Admin Users** — гар `<table>` + гар modal. → `DataTable` + `Modal` + `Badge`.

### 🟡 P3 — Цэгцлэл
- **Reports hub** ([reports/page.tsx](src/app/dashboard/reports/page.tsx), 38) өөр хуудасны компонентыг import хийдэг. → зөв routing/tabs.
- **`dashboard/marketing` route байхгүй** атлаа `workspaces.ts`-д бий (§10-Q).
- **Аналитик гар empty/loading** (reports/properties) → дундын `EmptyState`/`Spinner`.
- **Том файл** — customers (1565), contracts (804) → modal/drawer-ийг тусдаа файл болгох (дизайн биш, эрүүл мэнд).

---

## 10. Нээлттэй асуултууд
1. **Admin redesign-ийн гүн** — admin-ийг dashboard-ийн AppShell/системд бүрэн нэгтгэх үү, эсвэл зөвхөн компонент/брэндийг жигдрүүлэх үү (тусдаа layout хэвээр)?
2. **Q — `dashboard/marketing`** — энэ хуудсыг шинээр үүсгэх үү (маркетингийн нэгдсэн хяналт), эсвэл `workspaces.ts`-аас лавлагааг авах уу?
3. **Recharts** — бүх аналитикийг нэг дор шилжүүлэх үү, эсвэл хуудас тус бүрээр үе шаттай?
4. **Constants эх сурвалж** — статус/түрээслэл/lifecycle label-ийг DB-ээс татах уу, эсвэл `lib/constants`-д хатуу бичих үү?
5. **Хүснэгтийн mobile** — өргөн хүснэгтийг хэвтээ гүйлгэх (одоогийн) хэвээр үлдээх үү, эсвэл картан хувирал (mobile card view) болгох уу?

---

## 11. Үе шатчилсан хэрэгжилт
| Үе | Хамрах хүрээ |
|----|--------------|
| **P1 — Брэнд/систем** | AI Settings-ийн ягаан устгах; admin 3 хуудсыг систем рүү оруулах + монголчлох |
| **P2 — Дундын блок** | `ChartCard`(Recharts), `PeriodFilter`, `Toggle`, `status.ts`; AI Settings/Settings-ийг дундын компонент руу |
| **P3 — Цэгцлэл** | Reports routing; marketing route шийдвэр; аналитик states; том файл хуваах |
| **P4 — Өнгөлгөө** | хүснэгтийн mobile, a11y нягтлал, dark mode жигдрэл |

---

## Хавсралт — Эталон ба эх сурвалж
- **Эталон хуудас:** [inbox/page.tsx](src/app/dashboard/inbox/page.tsx) — шинэ хуудас бүр үүнтэй ижил бүтэцтэй байх.
- **Дундын блокууд:** `src/components/dashboard/` (PageHeader, FilterBar, StatBar, StatsCard, AppShell), `src/components/ui/` (Card, Badge, EmptyState, Spinner, LoadingSkeleton, DataTable, Modal, Dialog, BottomSheet, Tabs, Input, Textarea).
- **Token:** `src/app/globals.css`.
- **Навигаци/эрх:** `src/lib/navigation/workspaces.ts`, `src/lib/rbac.ts`.
