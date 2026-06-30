# Vertmon Hub — UI/UX Шинэчлэлийн Ерөнхий Төлөвлөгөө
### "Editorial Terracotta, бүрэн хэрэгжүүлсэн" — бүх функцийг хадгалсан 100% front-end шинэчлэл

**Зохиогч:** Lead Designer + Frontend Architect
**Огноо:** 2026-06-30
**Төлөв:** Хэрэгжүүлэхэд бэлэн. Энэ баримтыг үндэс болгон гүйцэтгэнэ.
**Хамрах хүрээ:** Бүх front-end гадаргуугийн (dashboard, CRM, санхүү, AI, маркетинг, нийтийн/auth, admin) визуал + харилцааны бүрэн шинэчлэл. Функцийн ямар ч ухралт (regression) гаргахгүй. Амьд хэрэглэгч (Mandala Garden) хэзээ ч эвдрэх ёсгүй.

---

## 1. Ерөнхий тойм

Vertmon Hub нь аль хэдийн жинхэнэ өвөрмөц дизайны DNA-тай — халуун cream өнгийн гадаргуу, гүн ink өнгө, OKLCH terracotta brand, Fraunces serif гарчгийн фонтыг IBM Plex Sans (Кирилл дэмжсэн)-тэй хослуулсан. Асуудал нь брэндийн өвөрмөц байдалд биш; харин тэр өвөрмөц байдал нь **тал хувь л хэрэгжсэн** явдалд оршино. `globals.css` доторх цэвэрхэн хоёр давхар token систем нь 175 гар хийсэн фонтын хэмжээ, 149 off-brand палитрын utility, 35 түүхий-палитрын gradient, өрсөлдөгч 3 modal систем, өрсөлдөгч 3 chat хэрэгжүүлэлт, мөн **20 компонентоос 14 нь огт ашиглагдаагүй** primitive сангаар сүйтгэгдсэн байна. Аппын хамгийн өнгөлсөн ганц гадаргуу — AI orchestrator chat — нь баг шагнал хүртэхүйц чанартай бүтээгдэхүүн гаргаж чадна гэдгийг батлав; гагцхүү тэр чанар бусад руу тархаагүй байна.

Энэ төлөвлөгөө Editorial Terracotta чиглэлд **100% амлаж**, түүнийг "сайн ясан хийцтэй wireframe"-ээс **premium broadsheet ба trading-desk-ийн нийлбэр бүтээгдэхүүн** болгон өргөнө: жинхэнэ type scale, гүйцэд elevation систем, Radix дээр суурилсан нэгдмэл компонент кит, жинхэнэ Motion давхарга, мөн хатуу "de-rainbow" (өнгө цэгцлэх) дамжуулалт. `@theme → primitive` гэсэн дам холболт аль хэдийн цэвэрхэн (`globals.css:13-104`) учраас бид ~40 root хувьсагчаас бүх аппыг дахин будна — 945 `text-muted-foreground` / 559 `bg-surface` call site-д хүрэлгүйгээр. Өөрчлөлт нь бүрэн мэдрэгдэнэ — шинэ typography, шинэ motion, шинэ компонент, нэгдсэн chat болон хүснэгт — атлаа ачаалал даадаг логикт (pipeline урьдчилсан тооцоо, гэрээ үүсгэлт, санхүүгийн pagination) бараг ямар ч эрсдэл учруулахгүй.

**North-star мэдрэмж:** *Дээд зэрэглэлийн хэвлэмэл үл хөдлөх хөрөнгийн брошюр нээгээд, тэр чинь trading terminal шиг хөдөлж байгааг олж мэдэх.* Тайван үед халуун дотно, итгэл төрүүлэм; өдөрт 8 цаг үүн дотор амьдардаг борлуулалтын менежерийн гарт хурдан, нягт, нарийвчлалтай.

---

## 2. Одоогийн төлөв байдлын дүгнэлт (ноцтой байдлаар эрэмбэлсэн, нотолгоотой)

| # | Зэрэг | Асуудал | Нотолгоо |
|---|----------|---------|----------|
| 1 | **Critical** | **Нийтэд харагдах гадаргуу дээр амьд "Syncly" үлдэгдэл.** Болзошгүй үйлчлүүлэгч бүртгүүлэх дэлгэц болон admin дээр үхсэн өрсөлдөгчийн брэндийг хардаг. | `auth/register/page.tsx:98-105` (`src="/logo.png"`, `alt="Syncly"`, `<h1>Syncly</h1>`); `admin/login/[[...sign-in]]/page.tsx:51` ("Syncly Admin"), `:95` ("© 2024 Syncly AI Platform") |
| 2 | **High** | **Type scale байхгүй.** 170 дур зоргын фонтын хэмжээ, голдуу 12px-ээс жижиг текст давамгайлсан (88× `text-[11px]`, 53× `text-[10px]`, 6× `text-[9px]`). Энэ нь систем огт байхгүй нягтрал-болон-AA-ийн шинж тэмдэг. | grep-ээр баталгаажсан: `text-[11px]`=88, `text-[10px]`=53, `text-[9px]`=6; `globals.css` нь **ямар ч** `--text-*` token тодорхойлоогүй |
| 3 | **High** | **Off-brand өнгөний сарнил.** 149 анхдагч-Tailwind палитрын utility + 35 түүхий-палитрын gradient (`from-blue-600 to-purple-600`, `via-pink-500`) нь token системийг тойрч гардаг; эдгээр нь rebrand хийгдэхгүй, dark-mode ажиллахгүй. | grep: `to-purple-600`=7, `border-violet-600`=5, `via-pink-500`=3, 35 `bg-gradient-to`; AI/admin/marketing-д хамгийн их |
| 4 | **High** | **Хамгийн өнгөлсөн гадаргуу нь өнгөөрөө гажуудалтай.** AI chat нь `from-brand to-brand-strong` (on-brand) ашигладаг ч inbox нь `from-blue-500/30 to-violet-500/30` ашигладаг — хоёр өөр бүтээгдэхүүн шиг харагдах хоёр chat UI. | `ai-assistant/page.tsx:336` ба `inbox/messages/page.tsx:231,264` |
| 5 | **High** | **Үхсэн/давхардсан компонент кит.** `ui/` primitive-ийн 14/20 нь 0 importer-тэй; апп нь 7+ inline `fixed inset-0 z-50` modal, 20 native `<select>`, 8 native checkbox-ыг гараар бичсэн. Гурван overlay систем (Dialog, Modal, BottomSheet) зэрэгцэн оршино; Modal/Tooltip/Dropdown нь **байхгүй animation class** (`animate-fade-in`, `animate-scale-in`)-ыг лавладаг. | grep: Modal/Dialog/Tooltip/Avatar/Dropdown/Tabs/Progress/DataTable/BottomSheet = 0 importer; `globals.css` нь зөвхөн `.animate-fade-in-up` тодорхойлсон |
| 6 | **High** | **Хоорондоо өрсөлддөг хоёр үндсэн навигацийн загвар.** Header-ийн төв дэх WorkspaceSwitcher нь зүүн талын бүх sidebar-ыг чимээгүйхэн дахин бичдэг — гүн route-уудыг чиглүүлэх breadcrumb-гүй уламжлалт бус дээд түвшний IA. | `Header.tsx:66-69` + `useActiveWorkspace.ts:14-17`; `/dashboard/finance/projects` мэт гүн route зөвхөн ганц leaf гарчиг авдаг |
| 7 | **High** | **Жинхэнэ chart байхгүй, fake дата шиппэгдсэн.** `AIMonitor.tsx:7-13` нь `dummyAiStats` дээр recharts render хийдэг; аналитик тайлан бүр гар хийсэн CSS bar эсвэл энгийн `<table>` ашигладаг. recharts нь бусдаар зөвхөн AI chat-д л байдаг. | `reports/leads/page.tsx:285-289` (гар хийсэн `<div style={{width:%}}>`); `AIMonitor.tsx` дотор `value="156"`, `"92%"` литерал |
| 8 | **High** | **Ачаалал хаа сайгүй ганц spinner.** Өнгөлсөн `LoadingSkeleton` кит-ийг яг **нэг** хуудас л импортолдог; ~35 хуудас нүцгэн `animate-spin` гялсхийлгэдэг — layout shift үүсгэж, хямд мэдрэмж төрүүлдэг. | зөвхөн `app/dashboard/page.tsx` нь `LoadingSkeleton` импортолдог; 35 `page.tsx` дотор `animate-spin` байдаг |
| 9 | **Medium** | **Мөнгө/формат эмх замбараагүй.** 8+ бие даасан мөнгөний форматлагч: ижил үлдэгдлийг гэрээн дээр `380,000,000₮` гэж, санхүүгийн дээр `380.0 сая₮` гэж — `lib/utils/currency.formatMNT` байсаар атал. | `contracts/page.tsx:49`, `finance/page.tsx:52`, `customer-service/page.tsx:74`, `marketing-roi/page.tsx:74`, гэх мэт |
| 10 | **Medium** | **Статик, зөвхөн hover-ийн харилцаа.** Ямар ч animation сан суулгаагүй; 441 `hover:` ба ердөө ~11 `active:` төлөв. UI нь хүрэлцэх (touch) үед амьгүй. Үхсэн `--s-*` spacing scale (0 ашиглалт) ба үхсэн `.touch-target` utility нь хэзээ ч хэрэгжээгүй системийг илтгэдэг. | `package.json` (framer-motion/gsap/motion алга); `var(--s-N)` = 0 олдоц; `touch-target` нь tsx-д = 0 олдоц |
| 11 | **Medium** | **Монолит + дур зоргын shell.** `customers/page.tsx` нь 4 inline modal-тай 1569 мөр; `customer-service` ба `contracts/generate` нь хуваалцсан системийг огт үл тоомсорлодог (өөрийн `min-h-screen` shell, түүхий `<h1>`, локал `KPICard`, hardcode хийсэн `#1a1a1a` хэвлэх CSS). | `customers/page.tsx:125-1568`; `customer-service/page.tsx:177-196,440`; `contracts/generate/page.tsx:145-148,213` |
| 12 | **Medium** | **Хүртээмжийн (accessibility) өр их хэмжээгээр.** 22 хүснэгтэд 0 `<th scope>` / 0 `<caption>`; skip link байхгүй; `<main>` нь `id`-гүй; 236 `<button>` ба ердөө 39 `aria-*`; `BottomSheet`/`DataTable`/`Tooltip` нь keyboard/дэлгэц уншигчид ажиллахгүй. | `AppShell.tsx:27` (id байхгүй); grep: `<th scope>`=0, `<caption>`=0; `DataTable.tsx:118` нь `<div onClick>` дээр sort хийдэг |

Дашрамд засах хоёр бүтцийн алдаа: AI chat-ийн viewport тооцоо нь 3.5rem header гэж тооцдог ч header нь `h-14 md:h-16` (desktop дээр ≈8px халих) — `ai-assistant/layout.tsx` (`h-[calc(100vh-3.5rem)]`) ба `Header.tsx:60`-аар баталгаажсан; мөн `auth/register` нь одоо байхгүй болсон route руу `redirect_url=/setup` илгээдэг (`callback/route.ts:36` нь `/dashboard`-ыг hardcode хийсэн).

---

## 3. Дизайны хэл

**Чиглэл: Editorial Terracotta — Refined.** Халуун cream + гүн ink + terracotta DNA-г хадгал. Дахин зохиохгүй, боловсронгуй болго.

### Зарчмууд
1. **Хаалттай байдалгүй нягтрал.** CRM бол өдөр тутмын хэрэгсэл. Өгөөмөр line-height (`--leading-body 1.55` хэвээр) ба тодорхой шатлал, гэхдээ нягт, харагдахуйц мөрүүд, санхүүгийн дата-д tabular numerics. Type-ийн доод хязгаарыг 9–11px-ээс дээш өргө.
2. **Нэг accent — hue-ээр биш, жингээр олж авсан.** Terracotta бол *цорын ганц* brand accent. Гүн нь `-soft`/`-strong` хослол ба elevation-аас ирдэг, хоёр дахь hue хэзээ ч биш. Статусын өнгө (success/danger/info/pending) нь чимэглэл биш, функциональ дохио.
3. **Fraunces бол зориудын дуу хоолой.** Одоо 17 тарсан call site. Үүнийг бат барь: хуудас бүрийн гарчиг, KPI hero тоо бүр, property/contract нэр бүр. ≥20px-ээр хязгаарла (serif уншигдац + Кирилл ascender).
4. **Telemetry бол гоо зүй.** Orchestration-trace / agent-badge хэл (алхам тус бүрийн latency, token, tool) бол гарын үсэг. Үүний визуал дүрмийг activity feed, audit log, pipeline hygiene chip-д дахин ашигла.
5. **Motion бол feedback, тоглолт биш.** Богино (120–260ms), тасалдуулж болдог, reduced-motion-ыг мэддэг. Интерактив элемент бүр дарахад хариу үзүүлнэ.
6. **Монгол хэл нэн тэргүүнд.** Кирилл нь Латинаас ~15–20% урт. Шошго бүрийг (`БОРЛУУЛАЛТ`, `САНХҮҮ / ERP`) мөр таслалтанд шалга; ascender-ийг шахдаг хэт нягт all-caps tracking-аас зайлсхий.

### Авч үлдэх (Embrace)
Халуун cream гадаргуу · үсэн зураас border · халуун өнгөлсөн сүүдэр · Fraunces display + tabular-nums · IBM Plex Mono микро-eyebrow · AI chat-ийн bubble/trace/confirm-modal хийц · 5-өнгийн OKLCH chart палитр · WCAG focus ring.

### Зайлсхийх (Avoid)
Энгийн shadcn-neutral саарал · хоёр дахь accent hue · түүхий Tailwind палитрын өнгө · статусын тэмдэг болгон emoji (`'✅ Амжилттай'`, `pipeline/page.tsx:43,325` дахь `'🔥'`) · glassmorphism gradient · 12px-ээс жижиг body текст · зөвхөн hover-ийн харилцаа · native `confirm()`/`alert()`.

---

## 4. Дизайн систем ба Token (`src/app/globals.css`)

Хоёр давхар систем хэвээр. Бид дутуу scale-уудыг **нэмж**, Tailwind анхдагч руу унадаг scale-уудыг **гүйцээнэ**.

### 4.1 Өнгө — хадгал, дараа нь de-rainbow
Light ба dark primitive хэвээрээ (`globals.css:109-201`, `207-242`). Шинэ hue алга. Ажил бол **нэгтгэх (consolidation)**:
- Chart-аас мэдрэмжтэй статусын тав тух нэм: 5-өнгийн OKLCH chart палитрыг (`--chart-1..5`) data-viz-ийн *цорын ганц* эх сурвалж болгон хадгал.
- **Давхардсан dark блокийг нэгтгэ.** `globals.css:207-242` ба `:245-277` дахь `prefers-color-scheme` хувилбар нь бараг ижил. Dark primitive-ийг нэг `@mixin` маягийн дүрмийн багц эсвэл хоёр selector хоёулаа лавладаг хуваалцсан custom-property бүлэг болгон гарга — ингэснээр rebrand нэг газар өөрчилнө.
- shadcn alias map хэвээр (`--color-card/-popover/-primary/-secondary/-accent/-destructive/-ring`) — ингэснээр бүх shadcn primitive ямар ч rebrand-ыг үнэгүй өвлөнө.

### 4.2 Typography — ШИНЭ token scale (хамгийн их leverage бүхий засвар)
Хосолсон line-height бүхий модульчлагдсан scale нэм, дараа нь 170 дур зоргын хэмжээг codemod-оор түүн рүү шилжүүл. Body-д доод хязгаар 12px; 11px-ийг *зөвхөн* mono микро-eyebrow-д зөвшөөрнө.

```css
@theme inline {
  --text-2xs: 0.6875rem;  /* 11px — зөвхөн mono eyebrow */
  --text-xs:  0.75rem;    /* 12px — meta, caption */
  --text-sm:  0.8125rem;  /* 13px — нягт хүснэгтийн нүд */
  --text-base:0.9375rem;  /* 15px — body анхдагч */
  --text-lg:  1.0625rem;  /* 17px */
  --text-xl:  1.3125rem;  /* 21px — хэсгийн гарчиг (Fraunces болно) */
  --text-2xl: 1.625rem;   /* 26px — хуудасны гарчиг */
  --text-3xl: 2.125rem;   /* 34px — KPI hero тоо */
  --text-display: 2.875rem;/* 46px — landing / empty-state hero */
}
:root {
  --leading-2xs: 1.4; --leading-xs: 1.45; --leading-sm: 1.5;
  --leading-base: 1.55; --leading-lg: 1.45; --leading-xl: 1.2;
  --leading-2xl: 1.15; --leading-3xl: 1.1; --leading-display: 1.05;
}
```
Шилжилтийн codemod map: `text-[9px]`→`text-2xs`, `text-[10px]`→`text-2xs`, `text-[11px]`→`text-xs` (тус бүрийг шалга — олонх нь жинхэнэ `text-xs`/`text-sm` болох ёстой), `text-[12px]`→`text-xs`, `text-[13px]`→`text-sm`, `text-[15px]`→`text-base`. Фонт өөрчлөгдөхгүй (`--font-*-google` дам холболт нь хэрэв хэзээ нэгэн цагт фонт солих бол нэг мөрийн ажил гэсэн үг).

### 4.3 Spacing — үхсэн scale-ыг авах эсвэл устгах
`--s-1..--s-16` (`globals.css:173-183`) нь **0 ашиглалттай**. Шийдвэр: **устга.** Энэ нь хэзээ ч жинхэнэ байгаагүй хэмнэлийн (rhythm) системийг илтгэдэг; Tailwind-ийн анхдагч spacing (хаа сайгүй аль хэдийн ашиглагдаж байгаа) бол систем нь. Үүнийг устгаснаар хуурамч гэрээ дуусна. (Хэрэв ирээдүйд layout grid хатуу хэмнэл шаардвал `--space-*` болгон lint хяналттайгаар дахин нэвтрүүл — одоо биш.)

### 4.4 Radius — хадгал, 3xl-ийн талаар шийд
`--r-xs(4)..--r-3xl(28)` хэвээр. `rounded-3xl` өнөөдөр 0 ашиглалттай. Шинэ том гадаргуунд (empty-state card, hero panel, `--r-2xl`-аар bottom sheet) **зориудаар авч** хэрэглэ — ингэснээр булан дур зоргын байхаа болино (`rounded-md`/`lg`/`xl`/`2xl`/`rounded-t-[2.5rem]` өнөөдөр холилдсон). **Radius гэрээ** тодорхойл: control=`md`, card=`xl`, modal/sheet=`2xl`, pill=`full`.

### 4.5 Shadow / Elevation — scale-ыг гүйцээ
Өнөөдөр `shadow-2xl` нь 14× ашиглагдаж байгаа ч custom scale нь `--shadow-xl-val` дээр зогсдог тул `shadow-2xl` нь Tailwind-ийн **хүйтэн-саарал** сүүдэр рүү чимээгүй унаж, халуун-ink санааг эвддэг. Нэм:
```css
--shadow-2xl-val: 0 12px 24px rgba(20,18,12,.08), 0 40px 80px rgba(20,18,12,.14);
/* ил гарга: @theme дотор --shadow-2xl: var(--shadow-2xl-val); */
```
**Elevation шат** тодорхойл: rest=байхгүй, hover-card=`shadow-sm`, dropdown/popover=`shadow-md`, modal=`shadow-lg`, command-palette/sheet=`shadow-2xl`.

### 4.6 Motion — ШИНЭ token (motion давхаргын урьдчилсан нөхцөл)
```css
:root {
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --duration-slow: 260ms;
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* одоо байгаа fade-in-up-тай таарна */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);/* press/pop */
}
```
Нэмээд `useReducedMotion()` JS hook — ингэснээр Motion нь тохиргоог хүндэтгэнэ (өнөөдөр зөвхөн `globals.css:366-373` дахь CSS clamp хийдэг — `PullToRefresh.tsx:108` үл тоомсорлодог).

### 4.7 Layout token — shell-ийг салга
AppShell-ийн шидэт тоонуудыг token-оор сольж AI-assistant-ийн сөрөг-margin холболтыг найдвартай болго:
```css
:root { --sidebar-w: 16rem; --header-h: 3.5rem; }
@media (min-width: 768px){ :root { --header-h: 4rem; } }
```
Дараа нь `AppShell` нь `md:ml-[var(--sidebar-w)]`, AI layout нь `h-[calc(100vh-var(--header-h))]` ашиглана — нэгэн зэрэг **8px халих алдааг засна**.

### 4.8 Цэвэрлэгээ
Хуучин e-commerce `.badge-shipping/-delivered/-cancelled/-paid/-pickups` (`globals.css:412-417`)-ыг устга. De-rainbow дамжуулалтын дараа тарсан 77 `dark:` override-ийн ихэнхийг устга (token давхарга өөрөө auto-theme хийдэг).

---

## 5. Компонентын сангийн шинэчлэл

**shadcn-ийн талаарх шийдвэр:** shadcn-ийн **зохиох стандарт** (CVA + `data-slot` + Radix)-ыг нэг сэтгэлгээний загвар болгон авна, гэхдээ өөрсдийн token-д mapped хийсэн variant-аа хадгална. Бид bridge alias-уудтай аль хэдийн байгаа. shadcn-ийн neutral theme-ыг бөөнөөр **импортлохгүй** — Editorial token-уудаа хадгална.

### 5.1 Одоо байгаа `src/components/ui/` — шийдвэр

| Компонент | Ашиглагч | Үйлдэл | Үндэслэл |
|---|---|---|---|
| `Button` | 39 | **Refactor (API тогтвортой)** | Хамгийн хүчтэй primitive. Press-scale `active:scale-[0.98]` нэм, `.touch-target`-ыг `size:icon` руу холбо, focus ring-ийн spec-ыг Input-тай нэгтгэ (нэг `ring-[3px] ring-ring/40`). |
| `Card` | 46 | **Хадгал + өргөтгө** | Хамгийн их ашиглагддаг. `interactive` variant нэм (hover elevation + press), `rounded-xl` мөрдүүл. |
| `Badge` | 9 | **Хадгал** | Баялаг статус variant аль хэдийн token руу map хийгдсэн. Шинэ `StatusPill`-ийн суурь болно. |
| `Input` / `Textarea` / `Label` | 12 / 6 / 0 | **Хадгал** | shadcn/Radix-аас үүсгэгдсэн; a11y үнэгүй. Focus ring-ыг Button-тай таарууул. |
| `Spinner` | 16 | **Хадгал** | Үлгэр жишээ a11y (`role=status` + sr-only). Каноник ачааллын атом. |
| `EmptyState` | 12 | **Хадгал + өргөтгө** | Зураг (illustration) slot нэм + AI suggestion-card загварыг дахин ашигла. |
| `Tabs` | 0 | **Refactor → авах** | Radix дээр суурилсан, сайн; хүчээр авна (ai-settings, surveys, гэрээний дэлгэрэнгүй). |
| `Dialog` | 0 | **Каноник болгох** | `radix-ui` umbrella import, animation зөв. ЦОРЫН ГАНЦ modal болно. |
| `Modal` | 0 | **Устга** | Dialog-ийн давхардал (`@radix-ui/react-dialog` шууд). size/title API-г Dialog руу нэгтгэ. |
| `BottomSheet` | 0 | **Солих** | Гар хийсэн, focus trap/aria байхгүй. `Sheet` болгон дахин барь (Radix Dialog + side variant, эсвэл чирэхэд `vaul`). |
| `Tooltip` | 0 | **Солих** | Гар хийсэн, `aria-describedby` байхгүй. Radix Tooltip ашигла. |
| `Dropdown` | 0 | **Солих** | Keyboard nav/role байхгүй. Radix DropdownMenu ашигла. |
| `Avatar` | 0 | **Refactor** | `<img>`→`next/image` болго, нэрийн эхний үсгийн fallback нэм, `AvatarGroup`-ийн ганц-child алдааг (`Avatar.tsx:83`) зас. |
| `Progress` | 0 | **Хадгал (CVA руу шилжүүл)** | Гэрээ/төлбөрийн bar-д ашиглагддаг — гэхдээ одоо inline; тэдгээрийг үүгээр дамжуул. |
| `DataTable` | 0 | **Солих → DataTable v2** | Монолит, зөвхөн хулганы sort, hardcode MN текст, overflow wrapper-гүй. Композицлогдох байдлаар дахин барь. |
| `LiveIndicator` | 0 | **Хадгал** | inbox AI-active / online төлөвт дахин ашигла. |
| `LoadingSkeleton` | 1 | **Refactor + дэлгэрүүл** | `OrderItemSkeleton`→`RowSkeleton`, `DashboardSkeleton`→`KpiGridSkeleton` нэр сольё. route тус бүрийн `loading.tsx`-аар нийлүүл. |

### 5.2 Барих ШИНЭ primitive-ууд (Radix-суурьтай, token-themed)

| Шинэ | Орлуулна / боломжтой болгоно | Priority |
|---|---|---|
| **Select** | 20 native `<select>` (PropertyForm, lead form, finance, filter) | P0 |
| **Checkbox / RadioGroup / Switch** | 8 native input + 3 давхардсан гар хийсэн toggle (`ai-settings:240,591`, `settings:204-235`) + DataTable түүхий checkbox | P0 |
| **Sheet (slide-over)** | UnitDrawer, contracts drawer, customer detail, viewings detail → нэг каноник master/detail | P0 |
| **Toast** | mount хийсэн `sonner`-ыг боож өгнө; бүх `alert()`/`confirm()` (`contracts:171,181`, `surveys:278,280`, `inbox/messages:75`)-ыг орлуулна | P0 |
| **DataTable v2 (SmartTable)** | бүх 22 түүхий `<table>`; sticky header, sort (`aria-sort` + жинхэнэ `<button>`), client/server pagination, мөр сонголт + bulk bar, нягтрал toggle, cell renderer (`<Money>`/`<DateText>`/`<StatusPill>`/`<ProgressCell>`), `overflow-x-auto` + `<th scope>` + `<caption>` | P0 |
| **FormField** (label + hint + error + control) | олон арван талбарт давтагддаг `px-3 py-2.5 border border-border-strong rounded-lg` string | P0 |
| **StatusPill** | 6+ дур зоргын статус→{label,variant} map (leads/contracts/units/customer-service) | P1 |
| **Money / DateText** | 8 мөнгөний форматлагч; ганц `formatMNT` эх сурвалж | P1 |
| **Command palette (cmdk)** | бүх route/record даяар шинэ global ⌘K навигаци | P1 |
| **ChartCard кит** (recharts + `useChartColors` дээр `BarChart`/`LineChart`/`DonutChart`/`Sparkline`/`AgingBar`) | report, finance хүснэгт, marketing-roi дахь гар хийсэн CSS bar; `AIMonitor`-ыг амьд дата руу холбох эсвэл устгах | P1 |
| **Popover · Separator · Breadcrumb · Alert/Banner** | тарсан дур зоргын эквивалентууд; breadcrumb нь shell-ийг тэжээнэ | P1 |
| **Хуваалцсан chat кит** `src/components/chat/` (`MessageBubble`, `MessageList`, `Composer`, `ConversationSidebar`) `MarkdownMessage`-ыг дахин ашиглана | 3 inbox хэрэгжүүлэлтийг AI-chat north-star руу нэгтгэнэ | P2 |
| **AuthShell · AuthCard · BrandLogo · OAuthButton** | давхардсан auth/admin chrome | P2 |

---

## 6. Навигаци ба Мэдээллийн архитектур (IA)

**Хос-навигацийн зөрчлийг (Асуудал #6) шийдэмгий шийднэ.** Дата-аар удирдагддаг `workspaces.ts` загварыг хадгал (энэ нь маш сайн — нэг эх сурвалж) гэхдээ *танилцуулга*-ыг өөрчил:

1. **WorkspaceSwitcher-ыг sidebar-ийн header руу зөөнө**, page header руу биш. Энэ нь зүүн талын нэг тасралтгүй шатлал болж уншигдана: `Workspace → Section → Item`. Header-ийн төв нь **breadcrumb** + global ⌘K хайлтын trigger болно. Энэ нь "header дахь pill миний sidebar-ыг чимээгүй дахин бичдэг" гэдэг төөрөгдлийг алга болгоно.
2. **Хумигдах icon-rail sidebar** (`AppShell.tsx:25` дахь `transition-all duration-300` үүнийг аль хэдийн төлөвлөсөн). Хумих төлөв ба хэсэг тус бүрийн хумилтыг `localStorage`-д хадгал (`useActiveWorkspace.ts:24-39`-д `rememberSubroute` загвар аль хэдийн байгаа).
3. **Хүчтэй active төлөв.** Өнөөдөр active = `bg-surface-2` (cream дээр ≈6% lightness зөрүү, `Sidebar.tsx:137`). Зүүн accent зураас (terracotta), хүчтэй гадаргуу, жингийн өөрчлөлт нэмж байршил нэг харалтаар харагдах болго.
4. **Shell дотор жинхэнэ breadcrumb** гүн route-уудад (`finance/projects`, `reports/*`) — `PageHeader` аль хэдийн breadcrumb дэмждэг (`PageHeader.tsx:37-52`); үүнийг shell түвшинд гарга.
5. **Гарцуудыг нэгтгэ.** Өнөөдөр гурван profile/logout гадаргуу байна (үхсэн sidebar profile товч `Sidebar.tsx:250`, sidebar Гарах `:237`, header dropdown `Header.tsx:112`). Sidebar profile товчийг цэс нээдэг болго; давхардсан logout-ыг устга.
6. **Нэг active/title matcher.** Гурван бие даасан хэрэгжүүлэлтийг (`Sidebar.tsx:54`, `MobileNav.tsx:36`, `getNavTitle` `workspaces.ts:274`) нэг хуваалцсан helper болгон нэгтгэ.
7. **Mobile "Бусад" sheet** нь хавтгай 11-icon овоолго (`MobileNav.tsx:63-80`)-ын оронд хэсэгчилсэн бүлэглэл (БОРЛУУЛАЛТ / САНХҮҮ / АНАЛИТИК) авна.
8. **Marketing RBAC-ыг тааруул** — түүний 12 item-д жинхэнэ `module` утга өг (`workspaces.ts:206`) — ингэснээр гурван workspace тогтвортой gate хийнэ.
9. **Route нэгтгэл:** `/dashboard/inbox` + `/dashboard/inbox/messages` → conversation id хадгалсан нэг route (`inbox/page.tsx:74` одоо алддаг). Орхигдсон `ConversationList/Item/MessageThread` ба хуучин `ai-assistant/agents` `ai_agents` дэлгэцийг тэтгэвэрт гарга (эсвэл orchestrator-ийн agent-legend хэл рүү дахин будах). `/dashboard/reports` нь `LeadsReport` алдагдуулахын оронд жинхэнэ hub landing болно.

---

## 7. Хуудас тус бүрийн шинэчлэл

**Dashboard KPI** — `StatBar` дотор Fraunces hero KPI тоо (`text-3xl` + tabular-nums); imperative DOM цаг-шүүлтийн dropdown (`page.tsx:88-118`)-ыг хяналттай Radix Select-ээр солих; сүүлийн лидийн мөрүүдийг `/leads/[id]` руу deep-link болгох (одоо бүгд → `/dashboard/leads`, `:170`) ба viewings мөрүүдийг гадагш холбох (`:219`); өргөн дэлгэцэд тарахаа болиулахаар `max-w` container нэм.

**Properties — list/blocks** — Blocks board бол **лавлах гадаргуу**; давхар-мэдрэмжтэй grid + drawer-ыг хадгал. `bg-orange-400` "ordered" цэгийг (`blocks/page.tsx:72`) статус token руу шилжүүл. Хуваалцсан `StatusDot` нэм.

**Properties — detail/new/edit** — Одоо хоёр дахь дизайны хэл (`rounded-2xl` panel, `bg-brand text-white` түүхий товч, `properties/[id]/page.tsx:95-172`). `Card`/`Button`/`Badge`/`PageHeader` дээр дахин барь; carousel overlay-г `bg-black/40`-аас token руу; дур зоргын `min-h-screen` wrapper-ыг хая.

**PropertyForm + Lead form** — Хоёр 500-мөрийн гар хийсэн form (`PropertyForm.tsx`, `leads/new/page.tsx`). Хоёуланг нь `FormField` + `Select` + `Textarea` + хэсгийн `Card` дээр refactor. PropertyForm-ийн нэг урт scroll-ыг алхамчилсан/2-баганат layout болго.

**Leads list** — `md:`-ийн доор card/давхарласан layout нэм (өнөөдөр 7-баганат `overflow-x-auto` хүснэгт, `leads/page.tsx:280`); inline статус `<select>`-ыг зөв control болгох; зөвхөн ачаалсан хуудсыг таардаг client-side хайлтыг (`:128-133`) зас; Lead model-ыг type хийж `as any` cast-ыг (`:331`) арилга.

**Pipeline** — Бүх forecast/hygiene/lost-reason логикийг хадгал. Стандарт `PageHeader` + shell padding руу оруул (`min-h-screen bg-surface-2/40`-ыг хая, `pipeline/page.tsx:214`); түүхий HTML5 DnD-ийг (touch/keyboard байхгүй, `:301`) `@dnd-kit`-ээр сольж (touch + keyboard); `yellow-200/orange-200/indigo-200/violet-300` (`:39-42,282`) ба emoji статус (`:43,325,344`)-ыг → token + lucide болго.

**Viewings** — Каноник дэлгэрэнгүй `Sheet`-ыг ав; огнооны форматыг `<DateText>`-ээр стандартчил.

**Contracts** — Баруун талын drawer-ыг каноник `Sheet` руу шилжүүл; түүхий хүснэгт → DataTable v2; `formatMoney` → `<Money>`; `window.confirm/alert` (`:171,181`) → Toast + баталгаажуулах Dialog.

**Customers** — 1569-мөрийн монолит (`customers/page.tsx`)-ыг container + `CustomerDetailSheet` + `HubSpotImportModal` + `HubSpotSyncModal` + `CreateCustomerModal` + `ServiceLogForm` болгон хувааж; хүснэгт → DataTable v2.

**Customer-service** — `PageHeader` + `StatBar` + `Button` + `StatusPill` дээр бүрэн дахин барь (локал `KPICard` `:440` ба className pill map `:51-72`-ыг устга, өөрийн shell `:177`-ыг хая).

**Inbox** — 3 хэрэгжүүлэлтийг хуваалцсан **chat кит** дээрх нэг route болгон нэгтгэ; bubble-ийг `from-blue-500/30 to-violet-500/30` (`messages:231,264`) → AI chat-тай таарах brand token руу дахин будах; англи string-уудыг ("AI mode", "Yesterday", "Guest", `:329,175,237`) орчуулах; native `confirm()` (`:75`) → Toast.

**AI-assistant** — **North-star**; хийцийг хадгал (animated bubble, agent badge, OrchestrationTrace, ActionConfirmModal). Зөвхөн нэг өөрчлөлт: layout тооцоог `--header-h` token руу зас; түүний motion багцыг inbox-ыг дахин барих каноник лавлагаа болгон хадгал.

**Finance / projects / reports** — Хүснэгт → DataTable v2; aging/cashflow нь ChartCard кит-ээс `AgingBar`/`BarChart`/`LineChart` авна; бүх мөнгө → `<Money compact>`.

**Reports** — Жинхэнэ hub landing барь (card-ууд → leads/properties/manager-performance/meetings); дөрвөн дэд тайланг бүгдийг `PageHeader` + `StatBar` дээр нэгтгэ (leads/properties дахь локал `StatCard` `:125`-ыг солих); гар хийсэн CSS bar (`reports/leads:285`)-ыг жинхэнэ chart-аар сольж.

**Marketing-ROI** — Гар хийсэн flex-div bar chart (`:616`) ба inline progress bar → ChartCard кит; мөнгө → `<Money>`.

**Surveys** — Tabs → Radix `Tabs`; `alert()` (`:278`) → Toast; AI гаралтыг `MarkdownMessage`-аар render (`whitespace-pre-wrap` `:341` биш); `JSON.stringify` dump (`[id]/page.tsx:342`)-аас үр дүнг асуулт тус бүрийн дүгнэлт (тоо, үнэлгээний тархалт, сонголтын bar) болгон дахин барь; `'Bogino khariу'` галиглалыг (`:484`) зас; `TAB_COLORS` солонго → статус token болго.

**Settings / AI-settings** — Гар хийсэн toggle (`ai-settings:240,591`, `settings:204-235`) → `Switch`; `SettingRow` (label + тайлбар + control) + `SectionCard` барь; emoji гарчиг (🎭🏢📝🔔)-ыг хая → token-өнгөт lucide icon; `from-violet-50 to-purple-50` banner (`ai-settings:358`)-ыг устга.

**Landing** — wireframe-ыг жинхэнэ борлуулалтын хуудас болго: бүтээгдэхүүний hero визуал (dashboard mock), animated Messenger-AI demo, lead→viewing→contract scroll өгүүлэмж, Moncon-ыг social proof болгон (цорын ганц badge биш), жинхэнэ тоо, SSR + OG metadata. CMS түүхийг шийд: `page.tsx`-ыг `/admin/landing` `LandingContent` хэрэглэдэг болгох эсвэл орхигдсон CMS-ыг тэтгэвэрт гаргах.

**Auth** — register-ыг login-ийн Editorial хэв маяг руу нэгтгэ (login бол хамгийн цэвэр лавлагаа, `auth/login/page.tsx:81`); **бүх Syncly үлдэгдлийг устга** (`register:98-105`); үхсэн `/setup` redirect-ыг (`register:41,60` → `/dashboard`) зас; login microcopy "Хөдөлмөрт орох" → "Нэвтрэх" зас; `AuthShell`/`AuthCard`/`OAuthButton`/`BrandLogo` барь; Facebook товч баримтжуулсан brand token-оор зөв FB цэнхэр авна.

**Admin** — violet glassmorphism (`admin/login:44`)-аас Editorial token руу rebrand; англи текст ("Admin Dashboard", `dashboard:78`)-ыг орчуул; KPI-г устгасан SaaS billing метрик биш үл хөдлөх хөрөнгийн домэйн (properties/leads/viewings/contracts/pipeline) дээр дахин барь; буруу `text-brand-dark` (`dashboard:202`) ба `hover:bg-surface-2/40/50` (`landing:44`)-ыг зас.

---

## 8. Хөдөлгөөн ба Микро-харилцаа

**Сан: `motion` (Framer Motion).** Зөвхөн CSS биш — бидэнд layout/shared-element transition ба тасалдуулж болдог spring хэрэгтэй. Сайн tree-shake хийгддэг. `awwwards-animations`/`gsap-framer-scroll-animation` skill-ыг зөвхөн **landing**-д (scroll өгүүлэмж) нэм. Dashboard motion = Framer Motion + шинэ motion token.

**Стандарт багц** (бүгд `useReducedMotion()`-аар хаагдсан):

| Харилцаа | Тодорхойлолт |
|---|---|
| **Press feedback** | `active:scale-[0.98]`, `--duration-fast`, `--ease-spring`, интерактив элемент бүрт Button/IconButton/Card-interactive-аар |
| **List/grid stagger** | хүснэгтийн мөр & card grid fade-in-up, 30ms stagger, эхний ~12 item-ээр хязгаарлах, `--duration-base` |
| **Page/route transition** | `AnimatePresence` cross-fade + 8px өргөлт, `--duration-base`, `--ease-out` |
| **Shared-element** | property/lead card → detail Sheet руу `layoutId`-аар |
| **Loading** | route тус бүрийн `loading.tsx`-аар skeleton-эхэлсэн (35 нүцгэн spinner-ыг орлуулна; CLS тэг) — *хамгийн их нөлөө, хамгийн бага эрсдэл* |
| **Optimistic updates** | статусын өөрчлөлт / drag-drop тэр даруй animate, хариу дээр тааруулна (pipeline, lead статус) |
| **Modal/Sheet/Popover** | Radix `data-[state]` enter/exit (Dialog аль хэдийн зөв хийдэг) |
| **AI chat** | одоо байгаа bubble entrance + trace reveal = каноник лавлагаа |

Reduced-motion: CSS clamp (`globals.css:366-373`) хэвээр; шинэ `useReducedMotion()` hook бүх JS animation-ыг таслана (`PullToRefresh.tsx:108` тохиргоог үл тоомсорлодгийг засна). Доод зэрэглэлийн талбарын утсыг хамгаалахаар duration-ыг 120–260ms байлга.

---

## 9. Responsive ба Хүртээмж (Accessibility)

**Breakpoint.** Өнөөдөр хоёр-горимтой (md=160 ашиглалт, xl=5, 2xl=0). Жинхэнэ том-desktop түвшин нэвтрүүл: `xl:`/`2xl:` нэмж дээд контентын өргөн (`max-w-[1440px]` container AppShell-д), олон-баганат dashboard, өргөн дэлгэцэд нягт хүснэгт. Mobile-first хэвээр.

**Талбарын борлуулалтад зориулсан mobile загвар.** Хэсэгчилсэн "Бусад" sheet; bottom-sheet дэлгэрэнгүй харагдац (`vaul`-аар чирч хаах); жагсаалт дээр pull-to-refresh; form дээр sticky доод үйлдлийн bar; Button `size:icon`-аар үхсэн `.touch-target` utility-г холбож 44px touch target мөрдүүлэх; safe-area utility (аль хэдийн байгаа).

**WCAG 2.1 AA хяналтын жагсаалт (давалгаа тус бүрт `design:accessibility-review` ажиллуул):**
- [ ] Skip-to-content link + `<main>`-д `id="main"` (`AppShell.tsx:27` — өнөөдөр байхгүй)
- [ ] DataTable v2: жинхэнэ `<button>` sort header + `aria-sort`, `<th scope="col">`, `<caption>`, select checkbox дээр `aria-label` (өнөөдөр 22 хүснэгтэд 0)
- [ ] Sheet/BottomSheet: `role="dialog"` + `aria-modal` + focus trap + focus буцаалт (BottomSheet-д өнөөдөр алга)
- [ ] icon-only товч бүр `aria-label` авна (өнөөдөр 236 товч ба 39 aria-*); IconButton-д кодлож regress хийхгүй болго
- [ ] Radix-аар Tooltip → `aria-describedby` + Escape
- [ ] Body type доод хязгаар ≥12px; type-scale дамжуулалтын дараа AA contrast шалга (`:122` дахь `--muted-2` AA засварыг хадгал)
- [ ] Global focus-visible ring-ийг яг хэвээр хадгал (`globals.css:433-437`) — хамгийн хүчтэй a11y хөрөнгө
- [ ] 320px өргөнд шошго бүр дээр Кирилл мөр таслалтыг шалга

---

## 10. Хэрэгжүүлэх замын зураг (үе шаттай давалгаа, аюулгүй нийлүүлэлт)

Mandala Garden амьд байна. Давалгаа бүр бие даан нийлүүлэгдэх, функц бүрэн байх ёстой. **Стратеги: эхлээд token + primitive давхарга (үл үзэгдэх боловч суурь), дараа нь гадаргуу-тус-бүрээр — ингэснээр regression нэг хуудсанд тусгаарлагдана.** `main`-аас feature branch ашигла; build-ыг хэзээ ч бүү эвд.

### Wave 0 — Суурь (token + motion, үл үзэгдэх дахин будалт) — *бүх зүйлийн эрсдэлийг бууруулна*
- Type scale, motion token, layout token (`--sidebar-w`/`--header-h`) нэм; `--shadow-2xl` гүйцээ; давхардсан dark блокийг нэгтгэ; `--s-*` ба хуучин `.badge-*` устга.
- `motion`, `@dnd-kit`, `cmdk`, `vaul` суулга. `useReducedMotion()` нэм.
- AI-layout header-тооцооны алдааг token-оор зас.
- **Гарах шалгуур:** апп build хийгдэнэ, визуалаар яг адилхан харагдана, гэхдээ бүх суурь token бий болж AI viewport алдаа арилсан. Call-site өөрчлөлт тэг.

### Wave 1 — Компонент кит нэгтгэл
- Select, Checkbox/Radio/Switch, Sheet, Toast, FormField, StatusPill, Money/DateText, DataTable v2, ChartCard кит, Popover/Breadcrumb/Separator/Alert барь.
- Button (press-scale + нэгдсэн ring), Card (interactive), LoadingSkeleton (нэр солих + route тус бүрийн `loading.tsx`) refactor.
- Modal устга; BottomSheet/Tooltip/Dropdown-ыг Radix-ээр сольж.
- **Гарах шалгуур:** бүх шинэ primitive нь Storybook маягийн demo хуудас + a11y-шалгасан байдлаар бий; хуучин хуудсууд ажилласаар (албадан шилжилт хараахан үгүй).

### Wave 2 — Shell, nav & IA + de-rainbow дамжуулалт 1
- WorkspaceSwitcher → sidebar header; хумигдах rail; хадгалсан төлөв; shell breadcrumb; гарцууд + active/title matcher нэгтгэх; хэсэгчилсэн mobile sheet; marketing RBAC.
- **Critical: Syncly-г устга** (register + admin) — үүнийг Wave 2-т хий, энэ нь хамгийн бага хүчтэй/хамгийн их нөлөөтэй ялалт бөгөөд shell-ийн эринд хамаатай.
- Shell + admin гадаргуунд de-rainbow хий.
- **Гарах шалгуур:** нэг уялдаатай навигацийн загвар; хаана ч Syncly үлдэгдэлгүй; shell de-rainbow хийгдсэн; visual-regression screenshot батлагдсан.

### Wave 3 — Их ачаалалтай үндсэн хуудсууд
- Dashboard, Properties (blocks + detail + form), Leads list + Pipeline (dnd-kit), Viewings. DataTable v2, Sheet, FormField, Money/DateText, StatusPill, chart, skeleton, Framer motion руу шилжүүл.
- **Гарах шалгуур:** өдөр тутмын борлуулалтын гадаргуу бүрэн шинэ системд орсон; Mandala flow (pipeline, blocks) гараар шалгасан.

### Wave 4 — Finance / Contracts / Customers / Customer-service
- Хаа сайгүй DataTable v2; customers монолитыг хувааж; каноник Sheet detail; customer-service + contracts/generate дахин барь; хэвлэх stylesheet-ыг token болго; санхүүгийн aging/cashflow-д ChartCard.
- **Гарах шалгуур:** finance + CRM бөөгнөрөл нэгдсэн; гэрээний pagination/forecast логик бүрэн бүтэн нь шалгагдсан.

### Wave 5 — AI / Inbox / Reports / Surveys / Settings + de-rainbow дамжуулалт 2
- Хуваалцсан chat кит; inbox route-уудыг нэгтгэх; inbox-ыг дахин будах; AIMonitor-ыг холбох/устгах; reports hub + жинхэнэ chart; surveys үр дүнг дахин барих; Switch/SettingRow шилжилт; бүх англи string орчуулах.
- **Гарах шалгуур:** бүх AI-текст MarkdownMessage-аар render хийгдэнэ; off-token өнгө үлдэхгүй; зөвхөн-Монгол дүрэм биелсэн.

### Wave 6 — Нийтийн landing + auth + admin өнгөлгөө
- Landing борлуулалтын хуудас (SSR/OG, motion, hero визуал); auth-ыг AuthShell дээр нэгтгэх; admin rebrand; landing CMS-ыг шийдэх/тэтгэвэрт гаргах.
- **Гарах шалгуур:** анхны сэтгэгдлийн гадаргуу premium; SEO/OG байгаа; `design:design-critique` + accessibility-review дамжсан.

---

## 11. Skills ба Хэрэгсэл

| Wave | Skills | Нэмэх сан |
|---|---|---|
| 0 | `design:design-system` (token audit/doc) | `motion`, `@dnd-kit/core`, `cmdk`, `vaul` |
| 1 | `premium-frontend-design`, `design:design-system`, `design:accessibility-review` | (одоо байгаа radix-ui, @tanstack/react-table, recharts ашиглана) |
| 2 | `modern-web-design`, `design:ux-copy` (microcopy: "Нэвтрэх", breadcrumb), `design:accessibility-review` | — |
| 3–5 | `premium-frontend-design`, `framer-motion-animator` / `page-transitions`, `design:design-handoff`, `webapp-testing` (flow шалгах) | — |
| 6 | `landing-page-design`, `awwwards-animations` + `gsap-framer-scroll-animation` (зөвхөн landing), `seo`, `image-optimization`, `performance` | сонголтоор `lenis` (landing smooth-scroll) |

Гадаргуугийн давалгаа бүрийн төгсгөлд `design:design-critique` ажиллуул, давалгаа merge хийхээс өмнө `design:accessibility-review`-ыг хаалт болгон ажиллуул.

---

## 12. Эрсдэл ба Хамгаалалт

| Эрсдэл | Бууруулах арга |
|---|---|
| **"Боловсронгуй болгох ≠ 100% өөрчлөлт"** — эзэн эрс ялгаатай байхыг хүлээж байна | Өөрчлөлтийг *мэдрэгдүүл*: бат барьсан Fraunces шатлал, шинэ type scale, гүйцэд elevation, бүрэн motion давхарга, нэгдсэн chat/хүснэгт, хумигдах rail-аар. Brand hue хэвээр ч бүтээгдэхүүн өөрчлөгдсөн мэдрэмж төрнө. Давалгаа тус бүрт өмнө/дараа screenshot үзүүл. |
| **Халуун палитр нь type шахуу хэвээр бол зөөлөн уншигдана** | Type-scale + AA дамжуулалт бол **хатуу урьдчилсан нөхцөл (Wave 0)**, сонголт биш. Доод хязгаарыг 9–11px-ээс дээш өргө. |
| **Fraunces + урт Кирилл гарчиг** мөр таслалт/уншигдац | Fraunces-ыг ≥20px display/KPI-аар хязгаарла; 20px-ээс доош бүх зүйлд Plex Sans; `БОРЛУУЛАЛТ`/`САНХҮҮ / ERP` мөр таслалтыг 320px-д шалга. |
| **De-rainbow нь dark mode / brand агшинг эвдэх** | Гадаргуу-тус-бүрээр дараалуул (Wave 2 & 5 дахь дамжуулалт), visual-regression screenshot-той; нэг global find-replace хэзээ ч бүү хий. AI chat-ийн зориудын `from-brand to-brand-strong`-ыг хамгаал. |
| **Motion нь талбарын утсан дээр perf-ыг муутгах** | Бүх JS motion-ыг `useReducedMotion()`-аар хаа; duration 120–260ms; stagger тоог хязгаарла; Framer feature-ыг lazy-load хий. |
| **Амьд хэрэглэгчийн (Mandala) сул зогсолт** | Давалгаа бүр `main`-аас бие даан нийлүүлэгдэнэ; Wave 0/1 нь үл үзэгдэх/нэмэлт; ачаалал даадаг flow бүрийг (pipeline forecast, гэрээ үүсгэлт, санхүүгийн 1000-мөр pagination) хадгал, Wave 3–4-ийн дараа гараар шалга. |
| **Backend руу scope creep** | Энэ бол зөвхөн front-end. `/setup` redirect засваараас бусад schema/API өөрчлөлт байхгүй. Дата сантехник (`workspaces.ts`, `useChartColors`, `formatMNT`) дахин ашиглагдана, дахин баригдахгүй. |
| **Монолит refactor алдаа оруулах** | `customers/page.tsx`-ыг зан төлөвөөр 1:1 хувааж (logic-ыг дахин бичихгүй, гаргаж ав); одоогийн зан төлөвтэй diff-тест хий. |

---

### Дүгнэлт
Энэ төлөвлөгөө бол **системтэй боловсронгуй болголт, дахин бичих биш**: ~40 token бүх зүйлийг дахин будна, нэг Radix кит гурван хагас-баригдсан системийг орлуулна, AI chat-ийн батлагдсан хийц стандарт болно, жинхэнэ type scale + motion давхарга нь бүхэл бүтэн зүйлийг premium ба амьд мэдрэгдүүлнэ. Энэ нь баг аль хэдийн хагас-барьсан өвөрмөц байдалд 100% амлаж — одоо дуусаагүй мэт харагдах бүх шалтгааныг арилгана.

**Эхлэх гол файлууд (Wave 0):** `src/app/globals.css` (token), `src/components/dashboard/AppShell.tsx` + `src/app/dashboard/ai-assistant/layout.tsx` (layout token + calc алдаа), `package.json` (`motion`/`@dnd-kit`/`cmdk`/`vaul` нэмэх), `src/components/ui/Button.tsx` (press-scale + ring), мөн шинэ `src/hooks/useReducedMotion.ts`.
