# School admin system — design reference

Source of truth for the look and feel. The HTML files in this folder are working mockups; match them, don't copy their sample data.

## Files
- `dashboard/index.html` — admin web app: shell, Dashboard, Fees, Students, Register, Classes, Messages (full designs) and layout blueprints for Teachers, Teacher logs, Newsletters & SMS, Homework, Exams & reports, Events & trips, Incidents, Settings. It expects a host that provides `d3` and a `dash` data object; read it for layout, CSS and behaviour, not as runnable code.
- `mobile/*.dc.html` — 390×844 phone screens. `Main`, `AdminStudents`, `AdminFees`, `AdminDrill` = admin app; `Teacher*` = teacher portal; `Parent*` = parent portal. Markup is plain HTML with `{{holes}}` filled by the small `Component` class at the bottom of each file.
- `feature-inventory.md` — every feature the system must have (modelled on IBEAMS). It is the functional spec.

## Palette (supplied by the client — do not change)
| Token | Hex | Use |
|---|---|---|
| indigo | #5680E9 | brand, chart line, focus ring |
| sky | #84CEEB | accents on ink, "late" |
| blue | #5AB9EA | "received", "present" |
| lavender | #C1C8E4 | soft fills, invoiced bars, "authorised" |
| violet | #8860D0 | badges, "outstanding", "notified" |

Derived roles:
- ink `#1C2147` — sidebar, hero panels. Text on ink: `#FFFFFF`, muted `#B9BEDB`. Sky/blue/lavender pass 7–9:1 on ink.
- primary (buttons, links on light) `#4364B6` (= indigo 78% + black), hover `#3D5BC0` area; white text 5.6:1.
- accent text on light ≈ `#4563AF`; on dark ≈ `#819FEB`.
- light blue, sky and lavender FAIL as text on white — use them only as fills or on ink.
- surface = lavender 9% over page bg; tints = palette colour at 10–22% alpha.
- status: ok `#2F7D32`, bad `#C62828`, warn `#9A6700`.

## Type
- UI: Inter (400/500/600). Big numbers and page titles: Fraunces 400 (serif).
- Min text 12px; body 14–15px; inputs 16px on touch devices. Sentence case. Tabular numerals for all figures.

## Layout
- Admin web: 240px ink sidebar (grouped nav: Overview, School, Finance, Communication, Learning, System; fire-drill hold button at the bottom), top bar (crumb, global search with "/" shortcut, year switcher, notification/message/help icons with count badges, avatar), content padding 24–28px, 12-column card grid, cards radius 16px with 1px border.
- Below ~860px container width the sidebar becomes a horizontal scrolling nav and cards stack.
- Mobile apps: bottom tab bar (≤5 tabs), 44px+ targets, cards radius 18px, ink hero card at top of home screens.

## Components (see dashboard CSS for exact values)
KPI tile (label, serif value, signed change coloured by whether it is good, "No change" at 0) · alert banner (tinted, hidden at 0, singular/plural wording) · status chip (dot + text) · data table (sticky header, long names wrap, minor columns hide when narrow, empty-state line) · filter pills with counts · message list item (avatar initials from first+last word, Intl.Segmenter-safe) · class card (capacity bar, over-capacity in warn colour, "Not assigned" teacher) · register grid (P/L/A/N/U letter cells, never colour alone) · charts with tooltips and an aria-label summary.

## Money and numbers
GBP, en-GB. Show pence only when non-zero (`£45`, `£0.50`). Percentages one decimal. Never round money to whole pounds in tables.

## Motion
Ease-out `cubic-bezier(0.23, 1, 0.32, 1)`.
- Press feedback: `scale(0.97)`, 160ms (web) / 120ms (mobile) on buttons, chips, quick actions — not on nav.
- Dashboard tiles: 280ms rise + fade, 40ms stagger, first view only.
- Banners: fade in via `@starting-style`, 220ms.
- Fire drill: hold-to-confirm, 2s linear fill, 200ms snap back on release, keyboard (Space/Enter) supported.
- No page-transition, chart-draw or keyboard-shortcut animation. Reduced motion: opacity only.

## Mobile-native baseline (all portals)
`viewport-fit=cover`, `env(safe-area-inset-*)` on header/tab bar/pinned buttons, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none` on root and `contain` on scroll areas, `touch-action: manipulation` + `user-select: none` on controls only, hover styles inside `@media (hover: hover) and (pointer: fine)`, `100dvh` for app shells, inputs ≥16px with the right `inputmode`/`enterkeyhint`, `theme-color` per colour scheme. Never disable zoom.

## Accessibility floor
WCAG AA contrast, visible `:focus-visible` rings, real buttons/links/labels, icon buttons have `aria-label`, live counts in `aria-live` regions, destructive actions need confirm or undo.
