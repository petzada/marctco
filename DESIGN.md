## Overview

marct.co's design language is **Linear's structural restraint executed in Apple's white**. The canvas is light and stays light: a two-tone rhythm of Pure White and Parchment, with hierarchy carried by hairline borders and surface steps rather than shadow, color, or decoration. There is exactly one chromatic accent, one shadow for overlays, one shadow for product imagery, and no gradients anywhere in the system.

Both source systems converge on the same underlying conviction — **the chrome recedes so the product can speak**. Apple achieves it with reverent product photography on alternating full-bleed tiles; Linear achieves it with high-fidelity product UI screenshots framed in minimal panels. For a CRM, Linear's protagonist wins: the interface itself is the argument. Apple supplies the surface treatment, the typographic discipline, the focus and press mechanics, and the whitespace philosophy that makes a light canvas feel calm instead of empty.

Density sits deliberately between the two. Apple's marketing pace (one tile per viewport, 17px body) is too airy for pipeline views and data tables; Linear's dark-canvas compression is unavailable in white mode, where a lift reads as a *hairline*, not a glow. The resolution is a four-step light ladder — Parchment sinks, White holds, Pearl insets, White-plus-shadow floats — applied consistently across marketing surfaces and app surfaces alike. This is one design language expressed at two volumes: editorial on the landing page, dense in the product.

**Key Characteristics:**
- **Single white theme.** No dark mode. `{colors.canvas}` (#ffffff) and `{colors.canvas-sunken}` (#f5f5f7) alternate; the surface change is the section divider.
- **One chromatic accent** — Action Blue (`{colors.primary}` — #0066cc) — on links, primary CTAs, focus rings, and selection. Nothing else is brand-colored.
- **Four-step light surface ladder** (sunken → canvas → inset → raised) carries hierarchy. Skipping levels is a bug.
- **Hairlines before shadows.** Elevation is a 1px `{colors.hairline}` rule. Shadow exists in exactly two forms: floating overlays and product screenshots.
- **8px-radius buttons, never pills.** Pills are reserved for status badges and segmented toggles — they signal *state*, not *action*.
- **Inter across the stack** at weights 400 / 500 / 600, with em-relative negative tracking scaling from -0.03em at display to 0 at 14px and below.
- **Product UI screenshots lead every marketing section**, resting on the canvas with the system product-shadow.
- **Semantic color is status-only** — never a CTA, never a section fill, never competing with the accent.

## Colors

> **Sources reconciled:** Apple (homepage, environment, store, iPhone buy page, accessories) and Linear (home, /intake, /pricing, /contact/sales, /build). Apple's light palette supplies the surfaces and the accent; Linear supplies the ladder discipline and accent scarcity. Linear's dark canvas and lavender hue are not carried over — see Source Reconciliation.

### Brand & Accent
- **Action Blue** (`{colors.primary}` — #0066cc): The single brand-level interactive color. Every text link, every primary CTA fill, every selection indicator. 5.6:1 against `{colors.canvas}` — it is the one accent hue in this system tuned natively for a white surface.
- **Action Blue Hover** (`{colors.primary-hover}` — #0055aa): Hovered primary CTA. Note the direction: on a light canvas the hover state goes **darker**, the inverse of a dark-canvas system.
- **Action Blue Pressed** (`{colors.primary-pressed}` — #004c99): Pressed CTA fill, paired with the system scale-down transform.
- **Focus Blue** (`{colors.primary-focus}` — #0071e3): A marginally brighter sibling reserved for the keyboard focus ring. Never used as a fill.
- **Accent Wash** (`{colors.primary-subtle}` — #e8f1fb): Tinted background for accent-selected states — selected table rows, active nav items, selected configurator chips. The light-mode equivalent of a surface lift.
- **On Primary** (`{colors.on-primary}` — #ffffff): Label color on any Action Blue fill.

### Surface
- **Canvas** (`{colors.canvas}` — #ffffff): The default content plane. Cards, panels, tables, modals, the app work area.
- **Canvas Sunken** (`{colors.canvas-sunken}` — #f5f5f7): Apple's signature parchment. The page background *behind* cards in app surfaces, and the alternating band in marketing sections. Just different enough from white to create rhythm without becoming a second theme.
- **Surface Inset** (`{colors.surface-inset}` — #fafafc): Near-white well. Secondary button fills, table header rows, nested panels, read-only fields. Lighter than parchment so it still reads as raised when it sits on `{colors.canvas-sunken}`.
- **Surface Ink** (`{colors.surface-ink}` — #1d1d1f): The rare full-bleed inversion. Reserved for a single closing CTA band per page — a punctuation mark, not a theme. Never used for cards.
- **Overlay Scrim** (`{colors.overlay-scrim}` — rgba(0, 0, 0, 0.40)): Modal backdrop.
- **Chip Translucent** (`{colors.surface-chip-translucent}` — rgba(210, 210, 215, 0.64)): Circular control chips floating over imagery.

### Text
- **Ink** (`{colors.ink}` — #1d1d1f): Every headline and every body paragraph. Near-black rather than pure black keeps the page photographic rather than printed.
- **Ink Secondary** (`{colors.ink-secondary}` — #3d3d41): Field labels, table column headers, sustained secondary copy.
- **Ink Muted** (`{colors.ink-muted}` — #6e6e73): Meta information, timestamps, placeholders, captions. 5.1:1 on `{colors.canvas}` — still AA for body sizes.
- **Ink Disabled** (`{colors.ink-disabled}` — #a1a1a6): Disabled labels and fine legal print only. Below AA by design; never carries information that isn't repeated elsewhere.
- **Ink Inverse** (`{colors.ink-inverse}` — #ffffff): Text on `{colors.surface-ink}` and on Action Blue fills.

### Hairlines & Borders
- **Hairline Soft** (`{colors.hairline-soft}` — #f0f0f0): Internal rules inside a card; the ring on secondary buttons, where it functions as a soft edge rather than a visible line.
- **Hairline** (`{colors.hairline}` — #e0e0e0): The default 1px border. Cards, panels, inputs, table rules, nav underline. This is the workhorse of the entire elevation system.
- **Hairline Strong** (`{colors.hairline-strong}` — #c7c7cc): Emphasized borders — hovered inputs, outer table frame, dividers that need to survive against `{colors.canvas-sunken}`.

### Semantic
> Neither source system documents a full semantic set — Apple ships none and Linear ships only success green. A CRM cannot function without status color, so this is a deliberate extension. It obeys one rule: **semantic colors describe state, never action.** They never fill a button, never fill a section, and never appear in marketing chrome.

- **Success** (`{colors.success}` — #27a644) / **Success Ink** (`{colors.success-ink}` — #1a7f37) / **Success Surface** (`{colors.success-surface}` — #e6f4ea): Won deals, active contracts, completed steps.
- **Warning** (`{colors.warning}` — #c76a00) / **Warning Ink** (`{colors.warning-ink}` — #8a4b00) / **Warning Surface** (`{colors.warning-surface}` — #fdf3e6): Stalled leads, approaching deadlines, pending documentation.
- **Danger** (`{colors.danger}` — #d70015) / **Danger Ink** (`{colors.danger-ink}` — #b3000f) / **Danger Surface** (`{colors.danger-surface}` — #fdecec): Lost deals, overdue actions, destructive confirmations.
- **Info**: reuses `{colors.primary}` / `{colors.primary-subtle}`. There is no separate info hue.

The dot/pill fill uses the base tone; any **text** on white uses the `-ink` variant, which clears 4.5:1. The `-surface` variant is the pill background, always paired with `-ink` text.

### Data visualization
> Resolves the Known Gaps entry below. A single-accent system has no categorical sequence, and pipeline charts (this phase) plus Analytics (Fase 7) cannot improvise one from success / warning / danger. The sequence is derived separately; semantic tones stay status-only.

**Categorical sequence** — eight steps. Adjacent steps differ by hue, not only by lightness, so two neighbouring stages remain distinguishable on `{colors.canvas}`. The first step is Action Blue so a single-series chart matches the rest of the chrome; every later step is a hue that is not a semantic tone.

| Token | Hex | Neighbour contrast |
|---|---|---|
| `{colors.chart-1}` | #0066cc | Action Blue. First series, and the only categorical step that is also a brand token. |
| `{colors.chart-2}` | #8a4f24 | Umber. Warm brown against the preceding blue; not `{colors.warning}`. |
| `{colors.chart-3}` | #1a7a78 | Sea. Cool teal against umber; not `{colors.success}`. |
| `{colors.chart-4}` | #6b3d91 | Grape. Violet against teal. |
| `{colors.chart-5}` | #c4a035 | Gold. Yellow-gold against grape; not `{colors.warning}` (#c76a00). |
| `{colors.chart-6}` | #2c4a7c | Slate navy. Deep blue against gold, darker than `{colors.chart-1}` so a wrap-around pair still splits. |
| `{colors.chart-7}` | #9a5b7d | Dusty rose. Muted magenta against navy; not `{colors.danger}`. |
| `{colors.chart-8}` | #4a6b52 | Sage. Muted green against rose; not `{colors.success}` (#27a644). |

**Overflow.** When there are more series than tokens, restart at `{colors.chart-1}` (`index modulo 8`). Do not invent a ninth hue. Do not pad the sequence with `{colors.success}`, `{colors.warning}`, or `{colors.danger}` — those remain status.

**Axis and grid.** Derived from the surface ladder that already exists; no third gray.
- `{colors.chart-axis}` aliases `{colors.ink-muted}` — tick labels, axis titles.
- `{colors.chart-grid}` aliases `{colors.hairline}` — the workhorse 1px rule, used as a grid line on `{colors.canvas}`.
- Plot fill is `{colors.canvas}`. Cursor / hover hairline is `{colors.hairline-strong}`.

**Semantic state on a chart.** A mark that means estourado, atrasado, cumprido, or parado uses the semantic set (`{colors.danger}`, `{colors.warning}`, `{colors.success}` and their `-ink` / `-surface` variants). Those tones never occupy a slot in the categorical sequence. A single quantitative series (chegadas, taxa de aderência) uses `{colors.chart-1}`, not a semantic fill.

### Brand Gradient
**No decorative gradients.** Both source systems ship zero gradient tokens, and the unified system keeps that. Depth comes from surface steps and hairlines; atmosphere comes from imagery. A gradient on this canvas would be the loudest element on the page.

## Typography

### Font Family
- **Display / Text**: `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. One family from 64px down to 10px — Apple's Display/Text split and Linear's Display/Text split are both silent to the reader, so the unified system uses a single variable face. On Apple platforms the stack resolves toward SF Pro naturally via the fallbacks.
- **Mono**: `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`. Reserved for IDs, API keys, imported CSV previews, and code inside product screenshots. Never on marketing chrome.
- **OpenType features**: `font-feature-settings: "ss03"` on Inter to approximate SF Pro's single-storey "a" at display sizes. `font-variant-numeric: tabular-nums` is **mandatory** on any column of currency, percentages, or dates — a CRM requirement neither source needed.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 64px | 600 | 1.05 | -0.030em | Marketing hero headline (one per page) |
| `{typography.display-lg}` | 48px | 600 | 1.08 | -0.028em | Section opener headlines |
| `{typography.display-md}` | 36px | 600 | 1.15 | -0.024em | Sub-section headlines |
| `{typography.headline}` | 28px | 600 | 1.20 | -0.020em | App page titles, pricing tier titles, CTA banner heading |
| `{typography.title}` | 22px | 600 | 1.27 | -0.015em | Card titles, panel titles, modal titles |
| `{typography.subhead}` | 20px | 400 | 1.40 | -0.010em | Lead paragraphs, intro copy |
| `{typography.body-lg}` | 18px | 400 | 1.50 | -0.010em | Hero subhead, testimonial quotes |
| `{typography.body}` | 16px | 400 | 1.50 | -0.005em | Default paragraph, form field values |
| `{typography.body-strong}` | 16px | 600 | 1.50 | -0.005em | Inline emphasis, primary cell in a table row |
| `{typography.body-sm}` | 14px | 400 | 1.45 | 0 | Dense UI copy, table cells, card body, footer columns |
| `{typography.label}` | 13px | 500 | 1.30 | 0 | Form labels, table column headers, nav links |
| `{typography.button}` | 14px | 500 | 1.20 | 0 | All button labels |
| `{typography.eyebrow}` | 13px | 500 | 1.30 | +0.030em | Section eyebrow — the only positive tracking in the system |
| `{typography.caption}` | 12px | 400 | 1.40 | 0 | Meta, timestamps, helper text, status labels |
| `{typography.mono}` | 13px | 400 | 1.50 | 0 | IDs, keys, code in screenshots |
| `{typography.micro-legal}` | 10px | 400 | 1.30 | 0 | LGPD notices, footer disclaimers |

### Principles

- **Tracking is em-relative and scales with size.** From -0.030em at 64px down to -0.005em at 16px, reaching 0 at 14px and below. Absolute-pixel tracking (Apple's approach) breaks under responsive type scaling; a percentage of size holds the same optical cadence at every breakpoint.
- **Never negative below 14px.** Small type needs its counters. The rule is inherited identically from both sources.
- **The eyebrow inverts the rule.** `{typography.eyebrow}` runs +0.030em positive. The contrast against negative-tracked display type is what marks it as taxonomy rather than headline.
- **The weight ladder is 400 / 500 / 600.** 400 for body, 500 for UI chrome (buttons, labels, nav), 600 for display and inline emphasis. Weights 300 and 700 are deliberately absent — 300 is a marketing-airiness cue that costs legibility on white at data density, and 600 already carries every assertion 700 would.
- **Body runs 16px, not 17px.** Apple's extra pixel buys an editorial "reading, not scanning" pace that is exactly wrong for a pipeline view. 16px is the default; `{typography.body-sm}` at 14px is the working size inside tables and cards.
- **Line-height is context-specific.** Display 1.05–1.20 (tight), body 1.50 (editorial), UI chrome 1.20–1.45 (compact). Never compress body below 1.50.
- **One family, one voice.** No family change between display and body. The reader should never perceive a seam.

### Note on Font Substitutes
Inter is the primary, not a substitute — it is the closest open-source equivalent to both SF Pro and Linear's custom cut, and it ships as a variable font.

- Load the variable file and expose only 400 / 500 / 600 as named weights; blocking the rest prevents drift.
- If `system-ui` resolves to real SF Pro on an Apple device, reduce display tracking by a further `0.005em` — SF Pro's default tracking already runs tighter than Inter's.
- **Geist Sans** is an acceptable alternate at the same weights if a more geometric read is wanted; the token values carry over unchanged.
- For mono, **JetBrains Mono** or **Geist Mono** at 400.

## Layout

### Spacing System
- **Base unit:** 4px. Every structural value is a multiple; no odd values, no typography-derived spacing.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px · `{spacing.section-lg}` 96px · `{spacing.chart-plot}` 240px (plot area of `{component.chart}`).
- **Section vertical padding:** `{spacing.section}` (80px) on app and standard marketing sections; `{spacing.section-lg}` (96px) on full-bleed marketing openers. Sections stack edge-to-edge with 0 gap — the surface change provides the break.
- **Card padding:** `{spacing.lg}` (24px) default; `{spacing.xl}` (32px) on testimonial and detail panels; `{spacing.xxl}` (48px) on CTA banners.
- **Button padding:** 8px vertical · 14px horizontal (compact) — 12px · 20px on the large marketing CTA.
- **Input padding:** 8px vertical · 12px horizontal.
- **Table cell padding:** 12px vertical · 16px horizontal.

### Grid & Container
- **Max content width:** 1280px default. 1440px on data-dense app grids and tables. 720px on prose-heavy sections — long-form copy must never run the full 1280px measure. `{min-width.chart-track}` is 640px: the horizontal scroll track of `{component.chart}` on small viewports.
- **Column patterns:** 3-up card grids at desktop, 2-up at tablet, 1-up at mobile. Product screenshot panels span the full content width — they are the protagonist.
- **Gutters:** `{spacing.lg}` (24px) between cards.
- **App shell:** 240px fixed sidebar on `{colors.canvas-sunken}` + fluid work area on `{colors.canvas}`, hairline between them.

### Whitespace Philosophy
On a dark canvas, the void is the whitespace. On white, whitespace must be **built**, and the tool is the surface step. Sections separate by sinking to `{colors.canvas-sunken}` or by lifting a `{colors.canvas}` card onto it — not by stacking empty margin.

Marketing surfaces keep Apple's air: at least 64px above a headline and 48px below, and nothing within 40px of a product screenshot. App surfaces compress to `{spacing.lg}` (24px) between blocks, because a CRM is scanned, not read. The footer is the one place where density is deliberate — the full information architecture should be visible at a glance.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No border, no shadow | Body type, hero text, full-bleed sections, footer |
| 1 — Sunken | `{colors.canvas-sunken}` fill | Page background behind cards, alternating marketing bands, app sidebar |
| 2 — Hairline | `{colors.canvas}` fill + 1px `{colors.hairline}` | The default lift: cards, panels, tables, inputs |
| 3 — Inset | `{colors.surface-inset}` fill + 1px `{colors.hairline-soft}` | Wells, table header rows, secondary buttons, read-only fields |
| 4 — Raised | `{colors.canvas}` fill + 1px `{colors.hairline}` + `{shadow.overlay}` | Dropdowns, popovers, modals, toasts |
| 5 — Frosted | `{colors.canvas-sunken}` at 80% + `backdrop-filter: saturate(180%) blur(20px)` | Sticky top nav, floating action bar |
| Focus | 2px `{colors.primary-focus}` outline + 2px `{colors.canvas}` offset | Any focused interactive element |

**Shadow philosophy.** Two shadows exist in the entire system, and both earn their place:

- `{shadow.overlay}` — `0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)`. Applied **only** to elements that genuinely float above the page and can be dismissed. If it can't be closed, it doesn't get this shadow.
- `{shadow.product}` — `0 8px 30px rgba(0, 0, 0, 0.12)`. Applied **only** to product screenshots resting on the canvas. Softer than Apple's original 0.22 alpha, which was tuned for photographic subjects against parchment; on flat white, 0.22 reads as a smudge.

Cards do not get shadows. Buttons do not get shadows. Text never gets a shadow. Both source systems resist shadow almost entirely, and on a white canvas the temptation to reach for one is exactly the instinct that produces generic SaaS.

### Decorative Depth
- **Product UI screenshots** are the decorative depth. There is no other.
- **Surface alternation** (white ↔ parchment) creates rhythm without borders, gradients, or spotlight cards.
- **Backdrop-filter blur** on the sticky nav is functional — it keeps content legible while scrolling under it — not decorative.
- **No atmospheric gradients, no spotlight cards, no glow, no mesh.**

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Full-bleed sections, table rows, edge-to-edge bands |
| `{rounded.xs}` | 4px | Status dots, small chips, checkboxes |
| `{rounded.sm}` | 6px | Inline tags, avatars in dense rows, table-inline controls |
| `{rounded.md}` | 8px | **All buttons and all form inputs.** The action grammar. |
| `{rounded.lg}` | 12px | Cards — feature, pricing, kanban, detail panels |
| `{rounded.xl}` | 16px | Product screenshot panels, modals |
| `{rounded.xxl}` | 24px | Oversized CTA banners (rare) |
| `{rounded.pill}` | 9999px | Status badges, segmented toggles, filter chips — **state, not action** |
| `{rounded.full}` | 50% | Avatar circles, circular icon controls |

Radii do not mix within a grammar. A button is 8px; a card is 12px; a panel is 16px. There is nothing in between.

### Imagery Geometry
- **Product UI screenshots** are the protagonist. They sit in `{rounded.xl}` (16px) frames with a 1px `{colors.hairline}` border and `{shadow.product}`, and they **never crop** — aspect ratio is preserved at every breakpoint.
- **Hero imagery**, when photographic, runs full-bleed and rectangular (`{rounded.none}`). Rounding appears only on inline card imagery.
- **Avatars** at `{rounded.full}`, 24–40px.
- **Customer logos** render at ~24px height on `{colors.canvas-sunken}`, no border, no card.
- Responsive `srcset` + `sizes` at every breakpoint; WebP/AVIF; lazy-load everything below the fold, eager-load the hero.

## Components

### Navigation

**`top-nav`** — Sticky bar pinned to the top of every marketing page. Background `{colors.canvas}` at 80% with `backdrop-filter: saturate(180%) blur(20px)`, height 56px, 1px `{colors.hairline}` bottom border. Wordmark left in `{colors.ink}`; nav links centered in `{typography.label}` with `{colors.ink-secondary}`; right cluster is a `{component.button-secondary}` ("Entrar") + `{component.button-primary}` ("Começar") pair. Collapses to hamburger below 768px.

**`sub-nav-frosted`** — Context bar sticking below `{component.top-nav}` on deep pages. Background `{colors.canvas-sunken}` at 80% with the same backdrop filter, height 52px. Left: section name in `{typography.title}`. Right: inline links in `{typography.label}` ending in a persistent primary CTA.

**`app-sidebar`** — Fixed 240px rail on app surfaces. Background `{colors.canvas-sunken}`, 1px `{colors.hairline}` right border, padding `{spacing.sm}`. Items in `{typography.label}` with `{colors.ink-secondary}`, `{rounded.md}`, 8px × 12px padding, 36px height.

**`app-sidebar-item-active`** — Background `{colors.primary-subtle}`, text `{colors.primary}`, weight 500. The accent wash **is** the selection signal; no left bar, no bold underline.

### Buttons

**`button-primary`** — The system's action. Background `{colors.primary}`, text `{colors.on-primary}` in `{typography.button}`, rounded `{rounded.md}` (8px), padding 8px × 14px, min-height 40px (44px on touch).
- Hover: `{component.button-primary-hover}` — background `{colors.primary-hover}` (darker).
- Pressed: `{component.button-primary-pressed}` — background `{colors.primary-pressed}` + `transform: scale(0.98)`.
- Focus: `{component.button-primary-focus}` — 2px `{colors.primary-focus}` outline with 2px offset.

**`button-primary-lg`** — Marketing hero CTA. Identical fill and radius; `{typography.body}` (16px / 500) with 12px × 20px padding. Used at most twice per page.

**`button-secondary`** — The default non-primary action. Background `{colors.surface-inset}`, text `{colors.ink}` in `{typography.button}`, 1px `{colors.hairline}` border, rounded `{rounded.md}`, padding 8px × 14px.
- Hover: border upgrades to `{colors.hairline-strong}`, fill stays.

**`button-tertiary`** — Plain text button for low-weight actions ("Cancelar", "Ver tudo"). Transparent background, text `{colors.ink-secondary}`, rounded `{rounded.md}`, padding 8px × 14px. Hover fills with `{colors.surface-inset}`.

**`button-danger`** — Destructive confirmation only, and only inside a modal. Background `{colors.danger}`, text `{colors.ink-inverse}`, otherwise identical to `{component.button-primary}`. Never appears in a table row or a toolbar.

**`button-icon`** — Square icon-only control. 36 × 36px (40px on touch), transparent background, icon in `{colors.ink-muted}`, rounded `{rounded.md}`. Hover fills `{colors.surface-inset}` and the icon darkens to `{colors.ink}`.

**`button-icon-circular`** — Floats over imagery. 44 × 44px, background `{colors.surface-chip-translucent}`, icon `{colors.ink}`, rounded `{rounded.full}`. Carousel and close controls.

**`text-link`** — Inline link in `{colors.primary}`, underlined in body copy, un-underlined in UI chrome.

### Cards & Containers

**`card`** — The universal container. Background `{colors.canvas}`, 1px `{colors.hairline}` border, rounded `{rounded.lg}` (12px), padding `{spacing.lg}` (24px). No shadow. On `{colors.canvas-sunken}` the hairline plus the fill difference is the entire lift.

**`card-hover`** — Border upgrades to `{colors.hairline-strong}`. No transform, no shadow, no fill change. Only applied to cards that are themselves clickable.

**`feature-card`** — `{component.card}` with an icon in `{colors.primary}` at 20px, title in `{typography.title}`, body in `{typography.body-sm}` with `{colors.ink-secondary}`.

**`pricing-card`** — `{component.card}` with tier name in `{typography.headline}`, price in `{typography.display-md}` with tabular numerals, feature list in `{typography.body-sm}`, and a full-width `{component.button-secondary}`.

**`pricing-card-featured`** — Recommended tier. Border upgrades to 1px `{colors.primary}`, the CTA upgrades to `{component.button-primary}`, and an `{component.status-badge}` sits above the tier name. The fill stays `{colors.canvas}` — the accent border does the lifting.

**`product-screenshot-panel`** — The dominant marketing element. Background `{colors.canvas}`, 1px `{colors.hairline}` border, rounded `{rounded.xl}` (16px), `{shadow.product}`. Sits on `{colors.canvas-sunken}` so the frame reads. Contains a full-fidelity capture of the CRM, never cropped, never tilted, never in a 3D perspective mockup.

**`section-band-sunken`** — Full-bleed section on `{colors.canvas-sunken}`, `{rounded.none}`, vertical padding `{spacing.section}`. Alternates with the default white section to create page rhythm. The surface change **is** the divider — no rule, no border.

**`cta-banner`** — Closing panel near page bottom. Background `{colors.canvas-sunken}`, rounded `{rounded.xxl}`, padding `{spacing.xxl}` (48px), heading in `{typography.headline}`, single `{component.button-primary-lg}`.

**`cta-banner-inverted`** — The one permitted inversion. Full-bleed `{colors.surface-ink}`, text `{colors.ink-inverse}`, `{rounded.none}`, padding `{spacing.section}`. **Maximum one per page**, always the closing section. If a page has an inverted banner, it has no other dark surface.

### Data Display

> This group has no counterpart in either source document — both describe marketing surfaces. It extends the same grammar into CRM density.

**`data-table`** — Background `{colors.canvas}`, 1px `{colors.hairline}` outer border, rounded `{rounded.lg}`, overflow hidden. Header row on `{colors.surface-inset}` with `{typography.label}` in `{colors.ink-secondary}`. Rows separated by 1px `{colors.hairline-soft}`, 48px row height (56px on touch), cells in `{typography.body-sm}`. Numeric columns right-aligned with tabular numerals.

**`data-table-row-hover`** — Fill shifts to `{colors.surface-inset}`. No border change, no transform.

**`data-table-row-selected`** — Fill `{colors.primary-subtle}`, primary cell in `{typography.body-strong}`.

**`status-badge`** — Pill for pipeline stage and record state. Rounded `{rounded.pill}`, padding 2px × 8px, `{typography.caption}` at weight 500. Background is the semantic `-surface` tone, text the matching `-ink` tone, with an optional 6px `{rounded.full}` dot in the base tone. Neutral states use `{colors.surface-inset}` + `{colors.ink-muted}`.

**`kanban-column`** — Pipeline stage column. Background `{colors.canvas-sunken}`, rounded `{rounded.lg}`, padding `{spacing.sm}`, 300px fixed width. Header: stage name in `{typography.label}` + count in `{typography.caption}` with `{colors.ink-muted}`.

**`kanban-card`** — Deal card inside a column. Background `{colors.canvas}`, 1px `{colors.hairline}`, rounded `{rounded.lg}`, padding `{spacing.sm}` (12px). Contact name in `{typography.body-strong}`, value in `{typography.body-sm}` tabular, `{component.status-badge}` and avatar in a bottom row. Dragging state: `{shadow.overlay}` + `transform: rotate(1deg)` — the one place a card is allowed a shadow, because it is genuinely lifted.

**`empty-state`** — Centered stack on `{colors.canvas}`: icon at 32px in `{colors.ink-disabled}`, headline in `{typography.title}`, one line of `{typography.body-sm}` in `{colors.ink-muted}`, one `{component.button-primary}`. Vertical padding `{spacing.xxl}`.

**`chart`** — Operational plot inside `{component.card}`. Title in `{typography.title}` `{colors.ink}`; helper in `{typography.caption}` `{colors.ink-muted}`. Plot area height `{spacing.chart-plot}` (240px). Grid in `{colors.chart-grid}`, ticks in `{typography.caption}` with `{colors.chart-axis}` and tabular numerals. Series fills walk `{colors.chart-1}`…`{colors.chart-8}` in order; a single series uses `{colors.chart-1}`. Semantic marks (estourado, atrasado) use the semantic set, never a categorical slot. On viewports below 768px the plot keeps `{min-width.chart-track}` (640px) and scrolls horizontally inside its own frame — the page does not squeeze the ticks past legibility. Inset from plot to axis is `{spacing.xs}`. No hex and no invented px in the component: `{token.refs}` only.

### Inputs & Forms

**`text-input`** — Background `{colors.canvas}`, text `{colors.ink}` in `{typography.body}`, 1px `{colors.hairline}` border, rounded `{rounded.md}` (8px), padding 8px × 12px, min-height 40px (44px on touch). Placeholder in `{colors.ink-muted}`.
- Hover: border `{colors.hairline-strong}`.
- Focus: `{component.text-input-focus}` — border `{colors.primary}` + 2px `{colors.primary-focus}` outline at 2px offset.
- Disabled: fill `{colors.surface-inset}`, text `{colors.ink-disabled}`.

**`text-input-error`** — Border `{colors.danger}`, with a helper line below in `{typography.caption}` and `{colors.danger-ink}`. The label stays `{colors.ink-secondary}` — only the border and the helper carry the error, never the label and never the field fill.

**`field-label`** — `{typography.label}` in `{colors.ink-secondary}`, 6px above its input. Required fields carry a single `*` in `{colors.danger}`.

**`select`** — Identical to `{component.text-input}` with a chevron in `{colors.ink-muted}` at the right inset. The open menu renders as `{component.dropdown-menu}`.

**`search-input`** — `{component.text-input}` with a leading 16px search glyph in `{colors.ink-muted}` and 36px left padding. Rounded `{rounded.md}` — **not** a pill; search is an input, and inputs share one radius.

**`checkbox`** — 16 × 16px, 1px `{colors.hairline-strong}` border, rounded `{rounded.xs}`. Checked: fill `{colors.primary}`, white glyph, no border.

**`toggle-segmented`** — Pill-track control for view switching (Lista / Kanban). Track `{colors.surface-inset}`, rounded `{rounded.pill}`, padding 2px. Selected segment: `{colors.canvas}` fill, `{rounded.pill}`, `{typography.button}` in `{colors.ink}`. Deselected: transparent, `{colors.ink-muted}`.

### Overlays

**`dropdown-menu`** — Background `{colors.canvas}`, 1px `{colors.hairline}`, rounded `{rounded.lg}`, `{shadow.overlay}`, padding `{spacing.xxs}`. Items 36px tall, `{typography.body-sm}`, rounded `{rounded.sm}`, hover fill `{colors.surface-inset}`. Destructive items in `{colors.danger-ink}`.

**`markers-menu`** — The disclosure surface for a lead's warnings (ticket 12; resolves the Known Gaps entry below). It is `{component.dropdown-menu}` anchored to a single-icon trigger instead of a text button — same surface, hairline, radius, shadow and `{spacing.xxs}` padding, no new geometry invented.
- **Trigger**: `{component.button-icon}` (36 × 36px, 40px on touch) showing one warning glyph in `{colors.warning}`. When the lead carries more than one marker, a count badge overlays the trigger's corner: `{rounded.full}`, 16px diameter, `{colors.danger}` fill, `{colors.on-primary}` text in `{typography.caption}` at weight 500, positioned -4px/-4px from the trigger's top-right corner. One icon, one entry point, never one label per marker (ADR-0007, ADR-0018).
- **Panel**: opens right-aligned to the trigger, 4px offset, `min-width` 240px, `max-width` 320px.
- **Item**: 40px tall (44px on touch — taller than a plain `{component.dropdown-menu}` item because each row carries an icon **and** a two-line label, not just text), padding `{spacing.xs}` × `{spacing.sm}`, rounded `{rounded.sm}`, hover fill `{colors.surface-inset}`. Leading 16px marker icon in `{colors.warning}`; label in `{typography.body-sm}` `{colors.ink}` (the marker's PT-BR name) with an optional second line in `{typography.caption}` `{colors.ink-muted}` (short context, e.g. the other card's origin for a possible duplicate). Trailing chevron in `{colors.ink-muted}` when the item opens a resolution step inline.
- **Divider**: 1px `{colors.hairline-soft}` between items when more than one marker is present, inset `{spacing.xs}` from each edge — the same soft-internal-rule role `{colors.hairline-soft}` plays inside a `{component.card}`.
- Each item is the entry point into that marker's resolution (`NEW_FINANCING` / `SAME_FINANCING` / `INVALID_OR_SPAM` for a possible duplicate; merge into a candidate / confirm distinct people for an identity conflict) — never a dead label. The menu itself never carries a destructive action; `{colors.danger-ink}` is reserved for a genuinely irreversible item, and every resolution here is auditable and non-destructive (ADR-0007).

**`modal`** — Background `{colors.canvas}`, rounded `{rounded.xl}`, `{shadow.overlay}`, padding `{spacing.xl}` (32px), max-width 560px, over `{colors.overlay-scrim}`. Title in `{typography.title}`, footer actions right-aligned with `{component.button-tertiary}` + `{component.button-primary}`.

**`toast`** — Background `{colors.canvas}`, 1px `{colors.hairline}`, rounded `{rounded.lg}`, `{shadow.overlay}`, padding `{spacing.sm}` × `{spacing.md}`. Leading semantic dot, message in `{typography.body-sm}`. Bottom-right, auto-dismiss.

### Footer

**`footer`** — Background `{colors.canvas-sunken}`, vertical padding `{spacing.section}` (80px), 1px `{colors.hairline}` top border. Column headings in `{typography.label}` with `{colors.ink}`; link columns in `{typography.body-sm}` with `{colors.ink-muted}` at 2.0 line-height — the relaxed leading is what makes dense columns scannable. Legal row at the bottom in `{typography.micro-legal}` with `{colors.ink-disabled}`.

## Do's and Don'ts

### Do

- Use `{colors.primary}` (Action Blue #0066cc) for every interactive signal — links, primary CTAs, focus rings, selection — and nothing else.
- Build hierarchy with the ladder: sink to `{colors.canvas-sunken}`, hold on `{colors.canvas}`, inset with `{colors.surface-inset}`. Reach for a surface step before reaching for any other tool.
- Use a 1px `{colors.hairline}` border as the default elevation. On white, the hairline does the work that a shadow does elsewhere.
- Alternate white and parchment full-bleed bands for section rhythm. The surface change **is** the divider.
- Compose every button and every input at `{rounded.md}` (8px). One action grammar, no exceptions.
- Reserve `{rounded.pill}` for things that describe **state** — status badges, segmented toggles, filter chips.
- Apply negative tracking in **em** on display type, scaling from -0.030em at 64px to 0 at 14px.
- Lead every marketing section with a `{component.product-screenshot-panel}`. The product is the argument.
- Use `transform: scale(0.98)` as the pressed state on buttons — the system-wide micro-interaction.
- Set `tabular-nums` on every column of money, percentage, or date.
- Keep semantic color to status: a `{component.status-badge}`, a dot, a border, an error helper.

### Don't

- Don't ship a dark theme, a dark-mode toggle, or a dark card. The one permitted dark surface is `{component.cta-banner-inverted}`, once per page, as the closing band.
- Don't introduce a second brand accent. Semantic tones are not accents — they never fill a CTA and never fill a section. Chart series walk `{colors.chart-1}` through `{colors.chart-8}`; they never borrow a semantic tone to pad the sequence.
- Don't add a shadow to a card, a button, a table, or text. Shadow belongs to overlays that can be dismissed and to product screenshots.
- Don't pill-round buttons or inputs. The pill reads as consumer marketing and dissolves the boundary between action and status.
- Don't use gradients, spotlight cards, glows, or mesh backgrounds anywhere.
- Don't set body copy at weight 300, 500, or 700 — the ladder is 400 body / 500 UI chrome / 600 display.
- Don't run body copy at 17px. 16px is the default; 14px is the working size in dense UI.
- Don't round full-bleed sections — bands are rectangular and edge-to-edge.
- Don't compress body line-height below 1.50.
- Don't mix radius grammars. 8px for controls, 12px for cards, 16px for panels, nothing in between.
- Don't lift a card by more than one level. Skipping ladder steps is how a light system starts looking muddy.
- Don't crop, tilt, or perspective-mockup a product screenshot.
- Don't use `{colors.ink-disabled}` for any information that isn't repeated elsewhere — it does not clear AA.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | ≤ 480px | Single column; `{typography.display-xl}` scales 64px → 32px; tables become stacked cards; section padding 80px → 48px |
| Mobile-Lg | 481–768px | Single column holds; nav collapses to hamburger; kanban becomes a horizontal scroll strip; app sidebar becomes a drawer |
| Tablet | 769–1024px | Card grids 3-up → 2-up; sidebar collapses to 56px icon rail; display type scales to 48px |
| Desktop | 1025–1280px | Full layout; 3-up grids; content locks at 1280px |
| Desktop-XL | ≥ 1281px | Content holds at 1280px (1440px for data tables); margins absorb the extra width |

The structural breakpoints that matter for agents: **1280px** (content lock), **1024px** (grid and sidebar collapse), **768px** (nav hamburger, single column), **480px** (table-to-card transformation).

### Touch Targets
- Minimum 44 × 44px on any touch viewport. This is Apple's floor and it wins over Linear's 40px — a CRM is used on phones in the field.
- Buttons hold 40px on pointer viewports and grow to 44px on touch.
- Table rows hold 48px on pointer and grow to 56px on touch.
- `{component.button-icon}` is 36px on pointer, 44px on touch.

### Collapsing Strategy
- **Top nav**: full link row → hamburger below 768px. The primary CTA stays visible at every width.
- **App sidebar**: 240px rail → 56px icon rail at 1024px → off-canvas drawer below 768px.
- **Card grids**: 3-up → 2-up at 1024px → 1-up below 768px.
- **Data tables**: full table → horizontal scroll with a frozen first column at 1024px → stacked `{component.card}` per record below 480px.
- **Kanban board**: side-by-side columns → horizontal scroll-snap strip below 768px.
- **Charts**: full plot → own `overflow-x` scroller below 768px, track `{min-width.chart-track}`, so ticks stay readable. The page does not shrink the plot.
- **Display type**: `{typography.display-xl}` 64px → 48px at 1024px → 40px at 768px → 32px at 480px.

### Image Behavior
- Product screenshots preserve aspect ratio and never crop. Below 768px, the panel is allowed to scroll horizontally inside its own frame rather than shrink past legibility.
- Responsive `srcset` at every breakpoint; hero eager, everything else lazy.
- Customer logo marquee collapses 6-up → 3-up below 768px.

## Source Reconciliation

Where the two source systems disagreed, this is what was decided and why.

| Decision | Apple | Linear | Resolution | Rationale |
|---|---|---|---|---|
| Canvas | White + parchment | Near-black #010102 | **Apple** | White theme is the product requirement. Linear's canvas is inseparable from its dark surface ladder, so the ladder was inverted rather than imported. |
| Accent hue | Action Blue #0066cc | Lavender #5e6ad2 | **Apple** | Lavender is tuned against near-black and lands at 4.7:1 on white; Action Blue lands at 5.6:1 and is native to a light canvas. Accent scarcity — Linear's discipline — is kept intact. |
| Button radius | Pill (9999px) | 8px, "don't pill CTAs" | **Linear** | A pill reads as consumer marketing and, in a dense CRM, collides visually with status pills. 8px keeps action and state distinguishable. |
| Body size | 17px | 16px | **Linear** | 17px sets an editorial reading pace that fights data density. 16px default, 14px in tables. |
| Weight 500 | Absent | Buttons, card titles | **Linear** | UI chrome needs a weight between body and display. The ladder becomes 400 / 500 / 600. |
| Weights 300 & 700 | 300 used rarely | 700 resisted | **Both dropped** | 300 costs legibility on white at small sizes; 600 already carries everything 700 would. |
| Tracking unit | Absolute px | Absolute px, aggressive | **Neither — em** | Both systems specify px tracking, which breaks under responsive type scaling. Em preserves the optical cadence at every size. Linear's aggressiveness is kept; Apple's restraint at body sizes is kept. |
| Hover states | "Never document hover" | Documented | **Linear** | Apple's rule fits a marketing site scanned on touch. A CRM is pointer-first and hover is functional feedback, not decoration. |
| Press state | `scale(0.95)` | Color shift | **Both, softened** | `scale(0.98)` plus a color shift. 0.95 is too much travel on a 40px control. |
| Spacing base | 8px, with a 17px step | 4px, clean scale | **Linear** | Apple's 17px step is an artifact of its 17px body. A clean 4px scale survives contact with a component library. |
| Section padding | 80px | 96px | **Apple (80px)** | 96px is marketing cadence; 80px works on both marketing and app surfaces. 96px stays available as `{spacing.section-lg}`. |
| Container | 980 / 1440px | 1280px | **Linear (1280px)** | 1280px default, with Apple's 1440px retained for data tables and a 720px prose measure. |
| Radius scale | 5/8/11/18/pill | 4/6/8/12/16/24/pill | **Linear** | The systematic scale absorbs Apple's use cases without the odd 5/11/18 values. |
| Elevation | Surface change, one shadow | Surface ladder + hairlines | **Merged** | Both resist shadow. The ladder is Linear's, inverted for light; the hairline is Apple's; the single product shadow is Apple's, re-pointed at screenshots and softened from 0.22 → 0.12 alpha for a flat white ground. |
| Hero protagonist | Product photography | Product UI screenshots | **Linear** | The CRM interface is the product. Apple's reverence for the subject is kept — nothing within 40px, never cropped, never tilted. |
| Section divider | Light ↔ dark tile alternation | Surface-1 panel lift | **Merged** | White ↔ parchment alternation preserves Apple's "the color change is the divider" rule inside a single light theme. |
| Semantic color | None | Success green only | **Extended** | A CRM requires success / warning / danger. Constrained to status so the single-accent rule survives. |
| Focus ring | 2px solid #0071e3 | 2px accent at 50% opacity | **Apple** | Solid at 2px with a 2px offset is more legible on white and clears WCAG 2.2 focus-appearance. |

## Iteration Guide

1. Focus on ONE component at a time and reference it by its `components:` token name (`{component.data-table}`, `{component.kanban-card}`).
2. Before adding a section, decide which surface step it lives on. If the answer is "a new one," the answer is wrong.
3. Use `{token.refs}` everywhere — never inline hex, never inline px for spacing or radius.
4. Variants live as separate entries (`-hover`, `-pressed`, `-focus`, `-selected`, `-error`), never as prose inside the base component.
5. Default body to `{typography.body}` at weight 400; default dense UI to `{typography.body-sm}`.
6. Treat Action Blue as scarce: links, primary CTA, focus, selection. If a fourth use appears, it's probably a status and belongs to a semantic tone.
7. When something needs more emphasis, reach in this order: **surface step → hairline weight → type weight → accent**. Shadow is not on the list.
8. Never add a third shadow. If a new element seems to need one, it either floats (use `{shadow.overlay}`) or it doesn't (use a hairline).
9. Run `npx @google/design.md lint DESIGN.md` after edits.

## Known Gaps

- **Motion and transition timing are undocumented.** Neither source specifies durations or easing curves. Until formalized, use 150ms `ease-out` for state changes and 200ms for overlay entry, and record the tokens here once they settle.
- ~~Data visualization has no palette.~~ **Resolved by ticket 08**: categorical sequence `{colors.chart-1}`…`{colors.chart-8}`, overflow by modulo 8, axis/grid aliased from `{colors.ink-muted}` / `{colors.hairline}`, and the rule that semantic status never enters the sequence — see "Colors > Data visualization" and `{component.chart}`. Analytics and Ranking (Fase 7) inherit this; they do not invent hues in the component.
- **The Linear lavender is not carried over.** If brand strategy later favors a distinct hue over Apple's blue, the accent is the one safely swappable token — any replacement must clear 4.5:1 against `{colors.canvas}` and carry hover, pressed, focus, and subtle variants.
- **Dark mode is explicitly out of scope.** The surface ladder was designed for light only; a dark variant would need its own ladder, not an inversion of this one.
- **Email and PDF surfaces** (proposals, contracts, notification emails) are not covered. Their constraints differ enough — no backdrop-filter, limited font loading — to warrant their own token subset.
- **Density modes** (comfortable vs. compact table rows) are documented at one height only. If a compact mode ships, it needs its own row height, cell padding, and touch-target exception.
- **The exact backdrop-filter value** on frosted surfaces is platform-dependent; `saturate(180%) blur(20px)` is the documented baseline, inherited from Apple, but is not formalized as a token.
- ~~No disclosure surface for a single anchor point (popover/tooltip) is documented.~~ **Resolved by ticket 12**: the markers icon uses `{component.markers-menu}` (see "Components > Overlays"), a specified variant of `{component.dropdown-menu}` rather than a new `{component.popover}` primitive. The reasoning: a lead's warnings are always a short, enumerable list where every item leads to a resolution step — exactly the shape `{component.dropdown-menu}` already covers — so the gap was a missing *spec*, not a missing *primitive*. A generic `{component.popover}` (arbitrary floating content, no item semantics) remains undocumented and should still not be improvised inline if a future ticket needs one — it belongs here first, same as this entry.
