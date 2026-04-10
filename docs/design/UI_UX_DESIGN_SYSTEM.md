# Syncly UI/UX Design System 🎨

> Энэ баримт бичиг нь SmartHub-ийн дизайн системийн бүрэн гарын авлага юм.

---

## 📋 Гарчиг

1. [Design Philosophy](#-design-philosophy)
2. [Color System](#-color-system)
3. [Typography](#-typography)
4. [Spacing & Layout](#-spacing--layout)
5. [Border Radius](#-border-radius)
6. [Shadows & Elevation](#-shadows--elevation)
7. [Components](#-components)
8. [Animations](#-animations)
9. [Mobile Guidelines](#-mobile-guidelines)
10. [Accessibility](#-accessibility)
11. [Icons](#-icons)

---

## 🎯 Design Philosophy

### Core Principles

1. **Premium & Modern** - "Million Dollar" дизайн хэв маяг
2. **Mobile-First** - Монголын хэрэглэгчдийн 80%+ утаснаас хандана
3. **Glassmorphism** - Орчин үеийн blur effect ашиглана
4. **Micro-interactions** - Бүх элемент дээр hover/tap feedback
5. **Accessibility** - WCAG 2.1 AA standard дагана

### Design Language

```
Light Mode:  "Ceramic & Platinum" - Цэвэр, гэрэлтэй
Dark Mode:   "Obsidian & Nebula" - Гүн, mysterius
```

---

## 🎨 Color System

### Primary Palette

| Name | Light Mode | Dark Mode | Usage |
|------|------------|-----------|-------|
| **Primary** | `#4f46e5` (Indigo 600) | `#6366f1` (Indigo 500) | Buttons, Links, Focus |
| **Background** | `#ffffff` | `#030712` | Page background |
| **Foreground** | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Text |
| **Card** | `rgba(255,255,255,0.8)` | `rgba(17,24,39,0.7)` | Card backgrounds |
| **Border** | `#e2e8f0` (Slate 200) | `#1e293b` | Borders |

### Semantic Colors

| Name | Value | Usage |
|------|-------|-------|
| **Success** | `#10b981` (Emerald 500) | Амжилттай, Хүргэгдсэн |
| **Warning** | `#f59e0b` (Amber 500) | Анхааруулга, Хүлээгдэж буй |
| **Danger/Destructive** | `#ef4444` (Red 500) | Алдаа, Устгах, Цуцлах |
| **Info** | `#3b82f6` (Blue 500) | Мэдээлэл |

### Status Badge Colors

```css
/* Order Statuses */
.badge-pending    { background: #f59e0b; }  /* Amber - Хүлээгдэж буй */
.badge-confirmed  { background: #3b82f6; }  /* Blue - Баталгаажсан */
.badge-shipping   { background: #3b82f6; }  /* Blue - Хүргэлтэнд */
.badge-delivered  { background: #65c51a; }  /* Green - Хүргэгдсэн */
.badge-cancelled  { background: #ef4444; }  /* Red - Цуцалсан */
.badge-vip        { background: linear-gradient(to right, #fbbf24, #eab308); }
```

### CSS Variables

```css
:root {
  --background: #ffffff;
  --foreground: #0f172a;
  --card: rgba(255, 255, 255, 0.8);
  --card-foreground: #0f172a;
  --primary: #4f46e5;
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --muted: #f8fafc;
  --muted-foreground: #64748b;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --success: #10b981;
  --success-foreground: #ffffff;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #4f46e5;
  --radius: 1rem;
}
```

---

## 📝 Typography

### Font Family

```css
--font-sans: 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'Geist Mono', monospace;
```

### Type Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| **Display** | 48px / 3rem | 700 | 1.1 | Hero headlines |
| **H1** | 36px / 2.25rem | 700 | 1.2 | Page titles |
| **H2** | 30px / 1.875rem | 600 | 1.3 | Section titles |
| **H3** | 24px / 1.5rem | 600 | 1.4 | Card titles |
| **H4** | 20px / 1.25rem | 600 | 1.4 | Subsections |
| **Body Large** | 18px / 1.125rem | 400 | 1.6 | Important text |
| **Body** | 16px / 1rem | 400 | 1.5 | Default text |
| **Body Small** | 14px / 0.875rem | 400 | 1.5 | Secondary text |
| **Caption** | 12px / 0.75rem | 500 | 1.4 | Labels, hints |

### Tailwind Classes

```html
<!-- Headlines -->
<h1 class="text-3xl md:text-4xl font-bold text-gray-900">Гарчиг</h1>
<h2 class="text-2xl md:text-3xl font-semibold text-gray-900">Дэд гарчиг</h2>
<h3 class="text-lg md:text-xl font-semibold text-gray-900">Card Title</h3>

<!-- Body -->
<p class="text-base text-gray-700">Үндсэн текст</p>
<p class="text-sm text-gray-500">Хоёрдогч текст</p>
<span class="text-xs text-muted-foreground">Caption</span>
```

---

## 📐 Spacing & Layout

### Spacing Scale

Base unit: **4px**

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| xs | 4px | `p-1` / `m-1` | Icon padding |
| sm | 8px | `p-2` / `m-2` | Tight spacing |
| md | 12px | `p-3` / `m-3` | Default |
| lg | 16px | `p-4` / `m-4` | Card padding |
| xl | 24px | `p-6` / `m-6` | Section spacing |
| 2xl | 32px | `p-8` / `m-8` | Page padding |
| 3xl | 48px | `p-12` / `m-12` | Large gaps |

### Layout Grid

```html
<!-- Dashboard Layout -->
<div class="flex">
  <!-- Sidebar: 256px fixed on desktop -->
  <aside class="hidden md:block w-64 fixed h-screen">...</aside>
  
  <!-- Main content -->
  <main class="md:ml-64 flex-1 min-h-screen">
    <div class="p-4 md:p-6 lg:p-8">
      <!-- Content grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        ...
      </div>
    </div>
  </main>
</div>
```

### Responsive Breakpoints

| Breakpoint | Width | Device |
|------------|-------|--------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

---

## 🔲 Border Radius

### Radius Scale

```css
--radius: 1rem;  /* 16px - Base */
--radius-sm: calc(var(--radius) - 4px);  /* 12px */
--radius-md: calc(var(--radius) - 2px);  /* 14px */
--radius-lg: var(--radius);              /* 16px */
```

### Common Uses

| Element | Radius | Class |
|---------|--------|-------|
| Buttons | 12px | `rounded-xl` |
| Cards | 16px | `rounded-2xl` |
| Inputs | 12px | `rounded-xl` |
| Badges | Full | `rounded-full` |
| Modals | 16px | `rounded-2xl` |
| Avatars | Full | `rounded-full` |

---

## 🌟 Shadows & Elevation

### Shadow Scale

```css
/* Elevation levels */
.shadow-sm   { box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.shadow      { box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06); }
.shadow-md   { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.shadow-lg   { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
.shadow-xl   { box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }

/* Colored shadows for buttons */
.shadow-primary { box-shadow: 0 4px 14px 0 rgba(79, 70, 229, 0.25); }
.shadow-success { box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25); }
.shadow-danger  { box-shadow: 0 4px 14px 0 rgba(239, 68, 68, 0.25); }
```

### Glassmorphism

```css
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.glass-dark {
  background: rgba(17, 24, 39, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

---

## 🧩 Components

### Button

**Variants:**

| Variant | Style | Usage |
|---------|-------|-------|
| Primary | Solid indigo + shadow | Main actions |
| Secondary | Light gray border | Альтернатив actions |
| Danger | Red + shadow | Delete, Cancel |
| Ghost | Transparent, hover:gray | Tertiary actions |

**Sizes:**

| Size | Min Height | Padding | Font |
|------|------------|---------|------|
| sm | 40px | px-4 py-2 | 14px |
| md | 44px | px-5 py-2.5 | 14px |
| lg | 48px | px-6 py-3 | 16px |

```tsx
<Button variant="primary" size="md">
  Хадгалах
</Button>

<Button variant="secondary" size="sm">
  Цуцлах
</Button>

<Button variant="danger" isLoading>
  Устгаж байна...
</Button>
```

---

### Card

**Structure:**

```tsx
<Card hover>
  <CardHeader>
    <CardTitle>Гарчиг</CardTitle>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>
```

**Styles:**

```css
/* Card base */
.card {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
}

/* Card with hover */
.card:hover {
  border-color: #cbd5e1;
  transition: all 0.2s;
}

/* Card padding */
.card-content {
  padding: 16px;  /* Mobile */
  padding: 20px;  /* md+ */
  padding: 24px;  /* lg+ */
}
```

---

### Badge

**Variants:**

| Variant | Colors | Usage |
|---------|--------|-------|
| default | Gray bg | Neutral status |
| success | Green/10 bg, Green text | Амжилттай |
| warning | Amber/10 bg, Amber text | Анхааруулга |
| danger | Red/10 bg, Red text | Алдаа |
| info | Blue/10 bg, Blue text | Мэдээлэл |
| vip | Gold gradient | VIP хэрэглэгч |

```tsx
<Badge variant="success">Хүргэгдсэн</Badge>
<Badge variant="warning">Хүлээгдэж буй</Badge>
<Badge variant="vip">⭐ VIP</Badge>
```

---

### Input

**States:**

| State | Border | Ring |
|-------|--------|------|
| Default | `#e2e8f0` | - |
| Hover | `#cbd5e1` | - |
| Focus | transparent | `#8b5cf6` (violet) |
| Error | `#fca5a5` | `#ef4444` (red) |
| Disabled | `#e2e8f0` | - (opacity 50%) |

```tsx
<Input 
  label="Нэр"
  placeholder="Бүтээгдэхүүний нэр"
  error="Заавал бөглөнө"
/>

<Textarea 
  label="Тайлбар"
  rows={4}
/>
```

---

### Stats Card

Dashboard дээрх статистик карт:

```tsx
<StatsCard
  title="Өнөөдрийн захиалга"
  value={24}
  icon={ShoppingCart}
  iconColor="bg-[#65c51a]"
  change={{ value: 12, isPositive: true }}
/>
```

**Icon Colors:**

| Stat | Color | Hex |
|------|-------|-----|
| Orders | Green | `#65c51a` |
| Revenue | Violet | `#8b5cf6` |
| Customers | Blue | `#3b82f6` |
| Products | Amber | `#f59e0b` |

---

### DataTable

**Features:**
- Sorting by column
- Search/Filter
- Pagination
- Responsive (scroll on mobile)

```tsx
<DataTable
  columns={columns}
  data={data}
  searchable={true}
  searchKey="name"
  pageSize={10}
/>
```

---

## ✨ Animations

### Timing Functions

```css
/* Standard easing */
transition: all 0.2s ease;

/* Smooth entrance */
transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

/* Bounce */
transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### Keyframe Animations

```css
/* Float animation (landing page) */
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}
.animate-float { animation: float 6s ease-in-out infinite; }

/* Fade in up */
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up { animation: fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

/* Slide up (modals) */
@keyframes slide-up {
  from { opacity: 0; transform: translateY(100%); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slide-up { animation: slide-up 0.4s ease-out forwards; }

/* Skeleton loading */
@keyframes skeleton-loading {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton { animation: skeleton-loading 1.5s ease-in-out infinite; }

/* Tap feedback */
@keyframes tap-feedback {
  0% { transform: scale(1); }
  50% { transform: scale(0.96); }
  100% { transform: scale(1); }
}
.tap-feedback:active { animation: tap-feedback 0.2s ease-out; }
```

### Animation Delays

```css
.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
```

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 📱 Mobile Guidelines

### Touch Targets

WCAG 2.1 standard: **Minimum 44x44px**

```css
.touch-target { min-width: 44px; min-height: 44px; }
.touch-target-lg { min-width: 48px; min-height: 48px; }
```

### Safe Areas (Notched Devices)

```css
.pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 1rem); }
.pt-safe { padding-top: max(env(safe-area-inset-top), 1rem); }
.pl-safe { padding-left: env(safe-area-inset-left); }
.pr-safe { padding-right: env(safe-area-inset-right); }
```

### Mobile Navigation

- Bottom navigation bar (fixed)
- 5 main items maximum
- Active state: filled icon + label
- Inactive: outlined icon only

### Mobile-Specific Behaviors

```css
/* Prevent accidental zoom */
html { -webkit-text-size-adjust: 100%; }

/* Disable tap highlight */
* { -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1); }

/* Prevent overscroll bounce */
body { overscroll-behavior-y: contain; }
```

### Pull-to-Refresh

Custom pull-to-refresh component байна:

```tsx
<PullToRefresh onRefresh={handleRefresh}>
  <Content />
</PullToRefresh>
```

---

## ♿ Accessibility

### Color Contrast

- Normal text: 4.5:1 minimum ratio
- Large text (18px+): 3:1 minimum ratio
- UI components: 3:1 minimum ratio

### Focus States

```css
/* Visible focus ring */
:focus-visible {
  outline: none;
  ring: 2px;
  ring-color: var(--ring);
  ring-offset: 2px;
}

/* Skip focus ring for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

### Interactive Elements

- All buttons: `min-height: 44px`
- Clear hover/active states
- Disabled state: `opacity: 50%` + `pointer-events: none`

### Screen Reader Support

```html
<!-- Hidden visually, available to SR -->
<span class="sr-only">Screen reader text</span>

<!-- Aria labels -->
<button aria-label="Хайх">
  <SearchIcon />
</button>
```

---

## 🎭 Icons

### Icon Library

**Lucide React** ашиглана - [lucide.dev](https://lucide.dev)

### Icon Sizes

| Context | Size | Class |
|---------|------|-------|
| Button icon | 16px | `w-4 h-4` |
| Navigation | 20px | `w-5 h-5` |
| Card icon | 24px | `w-6 h-6` |
| Stats icon | 24-28px | `w-6 h-6` / `w-7 h-7` |
| Hero | 32-48px | `w-8 h-8` / `w-12 h-12` |

### Common Icons

```tsx
import {
  // Navigation
  Home, Package, ShoppingCart, Users, Settings,
  
  // Actions
  Plus, Edit, Trash2, Search, Filter,
  
  // Status
  CheckCircle, AlertCircle, XCircle, Clock,
  
  // UI
  ChevronLeft, ChevronRight, ChevronDown, Menu, X,
  
  // Features
  MessageCircle, Bell, Download, Upload, Share2
} from 'lucide-react';
```

---

## 📋 Component Checklist

UI component үүсгэхдээ дараах зүйлсийг шалгана:

- [ ] Mobile-first responsive design
- [ ] Touch target size (44px+)
- [ ] Hover & active states
- [ ] Focus visible state
- [ ] Disabled state
- [ ] Loading state (if applicable)
- [ ] Error state (if applicable)
- [ ] Reduced motion support
- [ ] Screen reader accessible
- [ ] Consistent spacing (4px grid)
- [ ] Consistent border radius
- [ ] Dark mode support (if applicable)

---

## 🔗 Related Files

- [`globals.css`](../src/app/globals.css) - CSS variables & animations
- [`Button.tsx`](../src/components/ui/Button.tsx)
- [`Card.tsx`](../src/components/ui/Card.tsx)
- [`Badge.tsx`](../src/components/ui/Badge.tsx)
- [`Input.tsx`](../src/components/ui/Input.tsx)
- [`DataTable.tsx`](../src/components/ui/DataTable.tsx)
- [`LoadingSkeleton.tsx`](../src/components/ui/LoadingSkeleton.tsx)

---

**Happy Designing! 🎨**
