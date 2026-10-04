# Vertmon Hub dashboard design system

Одоогийн Workday хувилбар: [WORKDAY-DESIGN-SYSTEM-2026-09-28.md](./WORKDAY-DESIGN-SYSTEM-2026-09-28.md). Доорх нь 2026-09-14-ний өмнөх baseline; шинэ хувилбарын өнгө, зай, навигацийн дүрэм дээрх баримтад байна.

## Өмнөх critic baseline

This file is a factual baseline for the Design Loop system critic. It is derived from `src/app/globals.css` and the shared dashboard shell on 2026-09-14.

## Theme and color

- Preserve both the light default and the existing `[data-theme="dark"]` theme. A redesign must not force Attio's white appearance onto a user who selected dark mode.
- Use the semantic tokens `bg`, `surface`, `surface-2`, `surface-3`, `border`, `border-strong`, `fg`, `fg-2`, `muted`, and `brand`; do not introduce hard-coded UI color values.
- The sole product accent is Vertmon blue: `brand` for primary actions and active states, `brand-soft` for selected surfaces. Status colors only communicate status.
- Prefer borders over decorative shadows. Use the existing warm-ink shadow tokens only for elevated, temporary layers such as dialogs and menus.

## Type and density

- Use Golos Text for interface text and JetBrains Mono only for dates, counts, identifiers, and compact labels.
- Standard dashboard text is 12–14px; page titles are concise and avoid display-scale typography. Use font weight and foreground contrast before increasing type size.
- Shared controls use the existing height ladder: 26px chip, 30px compact control or nav row, 34px input/select, and 44px mobile primary action.
- Dense data headers target 32px and desktop data rows target 36px. A row may grow to 40px only when its visible content needs it. Mobile interactive rows maintain at least 44px tap targets.

## Layout and components

- The desktop shell keeps the shared 232px sidebar and 52px header. Page content uses the shell's `p-4 md:p-6` rhythm.
- Reuse shared primitives and semantic classes (`bg-surface`, `border-border`, `focus-ring`, `mono-label`, `Panel`, `Pill`, `Skeleton`) instead of duplicating variants.
- A record list has one enclosing surface, 1px dividers, a quiet header row, and an inset brand indicator for the selected record. Avoid nested cards inside the list.
- Interactive elements need a visible focus state, an accessible label, and disabled/loading states that retain context.
