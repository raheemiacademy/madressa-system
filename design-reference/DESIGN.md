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
- Dashboard, first view of the session only: KPI figures count up (900ms, ease-out cubic, equal-width digit slots), the weekly attendance line draws in (700ms), fee bars grow from 0 (600ms, 40ms stagger).
- Working buttons: a spinner in place of the label, then "Saved ✓" / "Done ✓" pops in (240ms) for 1.2s; the button keeps its width.
- Sign in ↔ "email me a link": one card, the track slides one card-width (300ms) and the address changes without a page load.
- Nav highlights slide; the items themselves still don't scale. Portal tab bar: the current-tab highlight slides to the pressed tab (250ms), stretching up to 1.6× on the way. Sidebars: the highlight slides to the page you open (280ms). Section tabs and filter chips: one dark pill slides from the current chip to the pressed one (280ms); chips are outlined, not filled, so it shows as it passes.
- Sign in: after a right password, in the existing 0.4s, the fields fade and "Welcome back" rises (280ms). New password: a 4px bar fills towards the 10-character rule (orange, then green); it measures only that rule.
- Add fees: after "Record payment" the receipt slides down out of a slot under the form (560ms), with Open receipt and Email to parent.
- Reply: the paper plane on the button flies off and comes back (600ms).
- Slow pages (Students, Fees, Reports, Search): a click on a link to one shows its outline at once (the admin Shell draws the pulsing .ra-skel blocks until it arrives), then the page fades in (200ms). Not loading.tsx: a loading boundary there sometimes left a save spinning.
- File boxes (FileDrop): drop or choose a file; it uploads at once with a bar of the real bytes sent (200ms steps), then ✓ pops in, or the reason with Retry. Saving during an upload waits for it.
- Page not found: the logo turns once into place (600ms) and the words rise.
- Messages: a sent reply rises in (200ms); a conversation that arrives while the inbox is open drops in at the top (260ms) with one 300ms pop of its count, and the rows below slide down.
- No keyboard-shortcut animation, and no chart animation anywhere else. Reduced motion: opacity only, and nothing on the dashboard counts, draws or grows.

## Mobile-native baseline (all portals)
`viewport-fit=cover`, `env(safe-area-inset-*)` on header/tab bar/pinned buttons, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none` on root and `contain` on scroll areas, `touch-action: manipulation` + `user-select: none` on controls only, hover styles inside `@media (hover: hover) and (pointer: fine)`, `100dvh` for app shells, inputs ≥16px with the right `inputmode`/`enterkeyhint`, `theme-color` per colour scheme. Never disable zoom.

## Accessibility floor
WCAG AA contrast, visible `:focus-visible` rings, real buttons/links/labels, icon buttons have `aria-label`, live counts in `aria-live` regions, destructive actions need confirm or undo.
