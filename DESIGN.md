---
name: Kaleb Cole Personal Publication
description: A candid, hand-marked personal publication built around writing and visible human authorship.
colors:
  light-ground: "oklch(0.975 0.004 260)"
  light-ink: "oklch(0.18 0.01 270)"
  light-blue: "oklch(0.49 0.21 267)"
  light-coral: "oklch(0.64 0.21 28)"
  light-muted: "oklch(0.42 0.02 260)"
  light-mount: "oklch(1 0 0)"
  dark-ground: "oklch(0.17 0.045 265)"
  dark-ink: "oklch(0.94 0.015 260)"
  dark-blue: "oklch(0.72 0.17 267)"
  dark-coral: "oklch(0.70 0.19 28)"
  dark-muted: "oklch(0.73 0.035 260)"
  dark-mount: "oklch(0.965 0.008 260)"
typography:
  homepage-display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 9vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "-0.035em"
  page-title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 7vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  section-title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 4vw, 3.2rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.035em"
  writing-title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.1rem, 2vw, 1.45rem)"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.05rem, 1.6vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.58
  note:
    fontFamily: "Recursive, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "\"CASL\" 1, \"CRSV\" 1"
  metadata:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  focus: "2px"
  media: "4px"
  code: "6px"
  control: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
  12: "48px"
  16: "64px"
  24: "96px"
  32: "128px"
components:
  theme-control-light:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.control}"
    height: "44px"
    width: "44px"
  theme-control-dark:
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.control}"
    height: "44px"
    width: "44px"
  filter-control-light:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  filter-control-dark:
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  portrait-mount:
    backgroundColor: "{colors.light-mount}"
    textColor: "{colors.light-ink}"
    rounded: "0"
    width: "min(300px, 100%)"
  note-mount:
    backgroundColor: "{colors.light-mount}"
    textColor: "{colors.light-ink}"
    typography: "{typography.note}"
    rounded: "0"
    padding: "16px"
---

# Design System: Kaleb Cole Personal Publication

## 1. Overview

**Creative North Star: "The Hand-Marked Page"**

The site should feel like a sturdy page Kaleb has marked up by hand: clear
enough for sustained reading, energetic enough to show enthusiasm, and
specific enough that it cannot be mistaken for a generic portfolio. The design
is typographic, asymmetric, and physical without becoming editorial costume.
It preserves visible human authorship rather than polishing the publication
into a professional persona.

The light scene is a cool true near-white with committed cobalt and small coral
physical marks. Its counterpart is a blue-hour workshop: deep blue-black,
restrained cobalt light, and the same coral material cue. Dark mode is
art-directed, not a mechanical inversion. Both modes preserve identical
content, source order, hierarchy, and interaction.

**Key Characteristics:**

- One strong introduction, one quiet portrait, then writing, followed by a
  lower-weight recommendations sibling.
- Ruled lists instead of interchangeable card grids.
- Large Bricolage type, brief Recursive handwriting, and restrained Azeret
  metadata.
- Natural imagery treated as source material, not decoration.
- Tactile settling and crisp state changes that never gate content.
- WCAG 2.2 AA, resilient enhancement, and lean delivery as release conditions.

### Composition and spacing

Use a 4px base with the normative steps in frontmatter. Small steps bind one
idea; 48–128px steps separate ideas. Avoid uniform section padding.
Exact component dimensions and optical offsets named below are approved
exceptions to the spacing scale; do not silently round them to the nearest
step.

- Main shell: `min(1180px, calc(100% - clamp(2rem, 8vw, 8rem)))`.
- Navigation: 86px minimum height with a 2px ink rule.
- Homepage hero: asymmetric `1.35fr / 0.65fr` grid, `61vh` minimum height,
  `clamp(2rem, 7vw, 7rem)` gap, and 64px vertical padding.
- Recent writing and recent recommendations: `0.4fr / 1fr` grids with the same
  gap and a 2px top rule.
- Reading measure: 57–70 characters; target 65–70 characters for articles.
- Article rows: 18px vertical padding, one-pixel rules, and no card container.
- Detailed media breakout: centered on the prose column and capped near 56rem.

The introduction owns the opening view; recent writing arrives in the first
deliberate scroll. A compact, capped recent-recommendations sibling may follow
recent writing. Do not add Projects, metrics, credentials, or conversion calls
to action below it.

### Responsive foundation

- Above 760px, retain the asymmetric homepage and writing grids.
- At 760px and below, every multi-column composition becomes one continuous
  source-ordered column.
- Homepage mobile order is navigation, complete introduction, portrait, then
  recent writing. Never put the portrait before the words or squeeze it beside
  a narrowed paragraph.
- At 320px, display type must fit without clipping or page-level horizontal
  scrolling. Lower a fluid minimum when the actual heading copy requires it.
- At 200% text size and 400% browser zoom, preserve source order, content, and
  actions without overlap or loss.
- Large shells stop at their approved maximum; reading measure never expands to
  fill a wide viewport.

### Implementation sequence

Implement in this order so foundations are validated before dependent
compositions:

1. Self-host approved font subsets; establish semantic light and blue-hour
   tokens, mode initialization, skip link, landmarks, focus treatment, and the
   responsive shell.
2. Produce and wire the open-tail KC asset set and shared navigation/head
   metadata.
3. Build the homepage introduction, portrait, recent-writing transition, and
   final approved copy.
4. Build the Writing index, then article layout, reading elements, measured
   breakouts, sign-off, and onward navigation.
5. Restyle the already-functional Recommends page without changing its accepted
   chronology, URL filter behavior, same-tab links, feed, or visible-tag
   removal.
6. Build the hand-authored Projects index, then reconcile the shared footer,
   404, RSS discovery, and remaining public-route states.
7. Run the complete validation matrix in both modes and fix failures without
   weakening the identity.

Social-preview composition, per-project detail routes, owner authentication,
in-browser editing, draft storage, and Git-backed publishing are deliberately
deferred. They are not blockers for this production redesign.

## 2. Colors

The normative OKLCH values are in frontmatter. Derived rules and soft surfaces
must use `color-mix(in oklch, ...)` from the active mode rather than introducing
new ad hoc hues.

### Primary

- **Workshop Cobalt** (`light-blue`, `dark-blue`): links, focus, selected states,
  headline emphasis, the KC stroke, and restrained blue-hour light.

### Secondary

- **Coral Mark** (`light-coral`, `dark-coral`): portrait and note offset shadows,
  the KC endpoint, and occasional physical marks. Light coral is decorative
  because it does not meet body-text contrast on the light ground.

### Neutral

- **Cool Ground** (`light-ground`): the light page field; true near-white, never
  cream, sand, beige, parchment, or warm paper.
- **Blue-Hour Ground** (`dark-ground`): deep blue-black for the art-directed
  counterpart.
- **Ink** (`light-ink`, `dark-ink`): primary text, strong rules, and structural
  outlines.
- **Muted Ink** (`light-muted`, `dark-muted`): secondary text and metadata only.
- **Print Mount** (`light-mount`, `dark-mount`): portrait and handwritten note
  mounts.

Create `--rule` as 18% active ink mixed into the light ground and 22% active ink
mixed into the dark ground. Create `--soft-blue` as 8% active blue mixed into
the light ground and 11% active blue mixed into the dark ground.

Measured contrast against each ground:

| Role | Light | Blue-hour |
| --- | ---: | ---: |
| Ink | 17.5:1 | 16.08:1 |
| Cobalt | 6.2:1 | 7.36:1 |
| Muted ink | 7.87:1 | 8.02:1 |
| Coral | Decorative only | 6.6:1 |

**The Blue-Hour Rule.** Dark mode preserves the cobalt/coral material
relationship on a blue-black scene. Never invert the light palette or add a
generic purple gradient.

**The Coral Rule.** Coral may carry information only when its exact pairing
passes the applicable contrast requirement and a non-color cue communicates
the same state.

**The One-Palette Rule.** The favicon, portrait treatment, page chrome,
writing, and Recommends all use this palette. Do not invent local color systems.

## 3. Typography

**Primary voice:** Bricolage Grotesque variable, optical size `12..96`, weights
400, 600, and 800. Use it for display type, navigation, body copy, and titles.

**Margin-note voice:** Recursive variable with `"CASL" 1` and `"CRSV" 1`.
Reserve it for brief first-person notes, `Why this now`, My thoughts, and
portrait captions. Never use it for paragraphs or repeated utility labels.

**Metadata voice:** Azeret Mono 400 and 600. Reserve it for dates, compact
publishing metadata, filters when needed, and code-adjacent material.

Fallbacks are `system-ui, sans-serif` for Bricolage and Recursive and
`ui-monospace, monospace` for Azeret. Self-host WOFF2 subsets for only the
approved axes and weights. Use `font-display: swap`; text must remain readable
and structurally stable if fonts fail.

### Hierarchy

The normative sizes are in frontmatter. Use the committed roles rather than
creating many adjacent sizes:

- **Homepage display:** one opening statement only.
- **Page title:** Writing, Recommends, and article titles.
- **Section title:** major page transitions such as Recent writing.
- **Writing title:** archive and recommendation titles.
- **Body:** introductions and sustained prose.
- **Note:** brief, visibly personal annotations only.
- **Metadata:** dates, read time, media, sources, and compact filing data.

Display tracking may tighten to `-0.035em`; never go tighter. Body, notes, and
metadata remain at normal tracking. Apply `text-wrap: balance` to headings and
`text-wrap: pretty` to prose. On blue-hour surfaces, add 0.05–0.1 line-height
when a light text role needs additional breathing room.

**The One Primary Voice Rule.** Bricolage carries the publication. Recursive
and Azeret are accents with named jobs, never competing display families.

**The Quiet Reading Rule.** Article typography supports sustained reading:
ordinary semantic lists, ink headings, cobalt underlined links, restrained
blockquotes, and no decorative side rail.

## 4. Elevation

The system is flat by default. Depth comes from strong rules, tonal washes,
asymmetry, rotation, and hard physical offset shadows rather than ambient card
elevation.

### Physical shadow vocabulary

- **Portrait rest** (`10px 12px 0 active coral`): physical print offset.
- **Portrait hover** (`14px 18px 0 active coral`): paired with a 6px lift and
  straightening over 300ms.
- **Note mount** (`8px 10px 0 active coral`): the tilted `Why this now` note and
  other explicitly personal mounted notes.

Natural thumbnails in Recommends may use a smaller ink outline and coral offset
derived from the same vocabulary. Ordinary rows, filters, navigation, code,
and prose never receive decorative drop shadows.

**The Flat-by-Default Rule.** If a surface can be understood with spacing,
rules, and hierarchy, it stays flat.

**The Physical-Only Rule.** Hard coral offsets belong only to objects presented
as handled material: the portrait, a personal note, or real source artwork.
Never use them to decorate every container.

## 5. Components

Components are semantic first. Visual order must match DOM and reading order.
Every state must work in both modes, forced colors, keyboard operation,
coarse-pointer input, JavaScript failure, and reduced motion.

### Shared navigation and mode control

- Use semantic `nav` inside the page header, with Kaleb first, Writing and
  Recommends available, Projects available as a quiet peer destination, feed
  discovery clear, and the current page exposed with `aria-current`.
- Place a visible-on-focus skip link before navigation and target the unique
  `main`.
- The 86px navigation may wrap. At narrow widths Kaleb remains first and the
  mode control remains a 44px target.
- On first load, follow `prefers-color-scheme`. Persist an explicit light or
  blue-hour choice without a wrong-theme flash.
- The control names the action or resulting mode accessibly and remains usable
  when storage is unavailable. An icon or color alone is never its label.
- Without JavaScript, CSS follows `prefers-color-scheme` and no inert mode
  control is rendered. JavaScript adds the labelled control and persistence as
  an enhancement.
- Focus uses a solid 2px active-cobalt perimeter with 3px offset and at least
  3:1 contrast between focused and unfocused pixels.

### Open-tail KC identity and icon assets

The **open-tail KC** is a custom, font-free, single-stroke drawing: a loose
cobalt K continues into an open C and ends at one coral point. Preserve the
same geometry at 16px, 32px, and larger sizes. Do not substitute a simplified
micro-mark, place it in a rounded square, or return to the old serif K.

Required assets:

| Asset | Requirement |
| --- | --- |
| `/favicon.svg` | Adaptive primary icon; internal `prefers-color-scheme`; no embedded font; exact geometry |
| `/favicon-16x16.png` | Raster fallback rendered from approved 16px geometry |
| `/favicon-32x32.png` | Raster fallback rendered from approved 32px geometry |
| `/favicon.ico` | Root legacy fallback containing 16px and 32px images |
| `/apple-touch-icon.png` | Opaque 180×180 PNG; cool near-white ground; centered mark; no baked-in radius |

Declare ICO and PNG fallbacks before the SVG primary, followed by the Apple
touch icon, with correct MIME types and sizes. Do not add 192px/512px PWA icons
or a web manifest unless the site later becomes installable. Verify true 16px
and 32px tabs in light and dark browser chrome, a clean favicon-cache load, and
zero missing icon requests.

### Homepage

- Open with one candid introduction and one quiet natural-color portrait.
- Preserve the large cobalt-emphasis headline, asymmetry, and visible
  first-person authorship.
- Portrait: 4:5 crop, centered `object-fit: cover`, maximum 300px wide on large
  screens and 190px on narrow screens, 10px side/top mount, 44px caption area,
  2px ink outline, 10px by 12px coral offset, and 2-degree rotation.
- A short Recursive caption may sit in the mount. It must sound like Kaleb and
  must not describe the layout.
- Print mounts retain dark `light-ink` text on the near-white mount in both
  modes. Do not place blue-hour light ink on `dark-mount`.
- On phones, complete the introduction first, then begin the portrait 1.25rem
  below it with a further 0.5rem optical offset.
- Move directly into the three newest published pieces using the approved split
  composition. End with one `All writing →` link.
- Follow with a compact, capped recent-recommendations sibling using the same
  split composition, rules, row rhythm, and responsive collapse. Omit imagery
  consistently, retain medium, title, source or author, UTC date, and optional
  My thoughts, then end with `All recommendations →`.
- Omit the recommendations sibling when no published recommendations exist.
  Do not add a Projects section, credential strip, metrics, or conversion CTA.

Entrance choreography, always from an already-visible default:

| Element | Motion |
| --- | --- |
| Navigation | Settle down over 1100ms |
| Hero copy | Settle up over 1400ms after 180ms |
| Portrait | Enter from 30px by 25px and 8-degree rotation over 1550ms after 350ms; rest at 2 degrees |
| Recent writing | Settle up over 1250ms after 700ms |

Use `cubic-bezier(.16, 1, .3, 1)`. Writing rows move 0.55rem toward the reading
direction over 240ms on hover while changing to cobalt. The portrait
straightens, lifts 6px, and extends its shadow over 300ms.

### Portrait and editorial imagery

Keep imagery in natural color. Do not apply grayscale, duotone, rounded-corner,
or print-mount treatment to every image. Writing images and video remain source
material, scale to their reading container, and use captions only when they add
context. Meaningful media needs contextual alternatives; decorative media uses
empty alternatives.

Every image and video declares intrinsic dimensions or `aspect-ratio`.
Responsive raster media uses AVIF or WebP with a supported fallback, `srcset`,
and accurate `sizes`; no candidate exceeds twice its largest rendered CSS
width. The LCP image is eager and high priority. Below-fold media is lazy.

### Shared footer, feeds, and error route

- The footer is shared page chrome outside each route's `main`; it does not
  count as another homepage content section.
- It contains plain GitHub, LinkedIn, and Email links plus a concise copyright
  line. Keep links in one wrapping row and expose specific accessible names.
- Keep canonical Writing URLs at `/blog` and `/blog/[slug]`; preserve existing
  permalinks. Keep the Writing feed at `/rss.xml`.
- Label `/rss.xml` as the Writing feed in navigation and metadata. Advertise it
  on the homepage, Writing index, and article routes. Recommends advertises
  `/recommends/rss.xml` instead; never combine the two feeds.
- The 404 route uses the shared shell, one `h1` reading `Page not found`, one
  candid sentence, and plain links to Home and Writing. It includes no search,
  illustration requirement, or automatic redirect.

### Projects index

- Route: `/projects`, linked from shared navigation.
- Projects are hand-authored entries in `src/content/projects`, ordered by an
  explicit `order` field rather than a date or an external service. The site
  does not fetch pinned repositories.
- Open with a `Projects` page title and one candid sentence, then show projects
  as ruled rows: an image on the left, and on the right the project name as a
  same-tab external link, a text status, a candid description, an optional role
  note, and an optional technology line.
- Every row reserves the same 16:9 image mount so the column rhythm holds. An
  entry without artwork shows a typographic initial mark inside that mount
  instead of collapsing the row.
- Status is one of `idea`, `in progress`, `shipped`, or `archived`. It is
  always rendered as words next to a `Status` label, never as color alone.
- Images are decorative-free: an entry that sets an image must also set
  alternative text, and the content schema rejects one without the other.
- Rows stack to a single column below 540px, use a flexible image column from
  540px, and settle to a fixed 11rem image column from 760px.
- Do not add project metrics, case-study framing, client-style outcomes, a
  featured-project carousel, filters, or an RSS feed. Projects is a short
  hand-kept list, not a portfolio.
- An empty index keeps the heading and states `Nothing here yet.` without
  removing the route from navigation.

### Writing index

- Treat the newest published piece as **pinned writing** with a large title,
  publication date, tags, and a separate tilted `Why this now` note.
- Populate the note from the article description. Do not require extra metadata
  or repeat the description beneath the pinned title.
- Earlier writing follows in reverse chronological order as ruled rows with
  title, description, and date. Group a longer archive by year without breaking
  the single chronology.
- Do not add topic filters, cards, a featured-content carousel, or a handwritten
  explanation beside the Writing heading.
- Dates may move below titles before title measure becomes cramped.
- The heading, pinned piece, and archive may settle upward in a short stagger
  with the standard easing. No writing content depends on that animation.

### Writing article

Open every article with:

1. A visible `← Writing` return link.
2. A large Bricolage title.
3. The article description as a one-sentence summary.
4. Publication date, estimated reading time, and tags in restrained metadata;
   show an updated date when present.

Compute estimated reading time from rendered plain-text word count at 200 words
per minute, rounded up to a minimum of one minute. It is derived presentation
data, not author-managed frontmatter.

Do not add a table of contents, facts box, automatic margin note, author bio, or
side rail. Tags are compact filing metadata, not pill controls.

- Prose stays at 65–70 characters.
- Headings use Bricolage and ink without decorative underline or shadow.
- Links use cobalt underlines with visible hover, visited, and focus states.
- Lists remain ordinary semantic lists.
- Blockquotes use a full outline or subtle blue wash; never a colored side
  stripe, coral offset, or oversized centered treatment.
- Inline code uses Azeret on a subtle wash.
- Substantial code uses Azeret on a dark code surface, with local horizontal
  scrolling only when wrapping would damage meaning.
- Images, video, and substantial code may break out to roughly 56rem. At 760px
  and below they collapse to the container and never widen the page.
- Video exposes native controls, captions when speech conveys information, a
  transcript for substantive spoken content, and a download fallback.
- Article prose and media remain still; do not animate while someone reads.

End each piece with the actual publication date:

```text
- Kaleb

July 22, 2026
```

Follow with simple `← All writing` and next-piece links. Stack them on narrow
screens. If no next piece exists, show only the return link.

### Recommends

Recommends is subordinate to Writing and uses one compact newest-first stream.
Introduce it exactly as: **Things I thought were interesting.**

- Place All / Read / Watch / Listen filters above the list.
- Preserve newest-first order within every filter.
- Use native buttons with 44px coarse-pointer targets, visible focus,
  `aria-pressed`, shareable URL state, and a polite atomic result announcement.
- Keep zero-result media available. Use `No [medium] recommendations yet.` for
  a filtered empty state and `Nothing here yet.` when the collection is empty.
- Each ruled row shows medium, source, date, title, optional author, and optional
  **My thoughts** in Recursive.
- Topic tags are not visible on the page. They may remain content metadata and
  RSS categories.
- Open external source links in the same tab and include a visible and
  programmatic external-link cue.
- Show real source artwork when supplied. When absent, use a simple medium mark
  without reserving an empty image slot or synthesizing a thumbnail.
- At 760px, reflow toolbar and rows. At 540px, stack real thumbnails above text.
- Remove settling transforms under reduced motion.

Expose a dedicated Recommends RSS feed in visible page copy and a
`rel="alternate"` head link. Keep it separate from Writing. Feed items link
directly to the source, carry medium and topic categories, and include My
thoughts when present.

Render the filter choices as ordinary query links first so `?medium=read`,
`watch`, and `listen` remain understandable without scripting and the complete
newest-first list remains visible. After JavaScript initializes, replace or
enhance that baseline toolbar with native buttons, `aria-pressed`, in-place
filtering, URL updates, and the live result count. Never leave inert buttons in
the no-JavaScript experience.

### States, motion, and resilience

- Hover, focus, visited, active, selected, disabled, empty, loading, and error
  states use the active palette and a non-color cue.
- Content exists before animation starts. Never gate visibility on a loaded,
  observed, or hydration class.
- Under `prefers-reduced-motion: reduce`, remove entrance, scroll-linked,
  parallax, rotation, translation, and smooth-scrolling effects. Preserve
  immediate color and focus changes.
- Default motion causes no layout shift, blocks no input, does not replay on
  routine navigation, and holds 60fps on a representative mid-range phone.
- With JavaScript disabled or failed, all content, links, feeds, native media,
  and navigation remain available. Recommends shows the complete chronology;
  filter query links remain navigable and the unfiltered chronology remains
  visible. The system color preference applies and no inert mode control is
  shown.
- Dynamic filter and empty-result updates announce a concise complete status
  without moving focus.

### Accessibility and responsive release gates

A public surface does not ship while any gate fails:

- Text and images of text reach 4.5:1, or 3:1 for text at least 24px regular or
  18.5px bold. Required boundaries, icons, selected states, and focus indicators
  reach 3:1. Ratios are never rounded up.
- Verify all token pairings in both modes and hover, visited, focus, active,
  disabled, and forced-colors states.
- Every page has one descriptive `h1`, logical headings, unique names, semantic
  landmarks, native elements, and DOM order matching visual order.
- Every action works with keyboard alone, has no trap, uses no positive
  `tabindex`, and keeps focus unobscured. Temporary surfaces return focus to
  their initiating control.
- Non-inline targets meet WCAG 2.2 AA's 24px size or spacing rule; standalone
  and navigation targets reach 44px on coarse pointers.
- At 200% text size and 400% zoom/320px content width, nothing is clipped,
  overlapped, reordered, truncated, or lost, and the page does not scroll
  horizontally. Two-dimensional code or media may scroll inside a labelled
  local region.
- WCAG text-spacing overrides of 1.5 line height, 2em paragraph spacing, 0.12em
  letter spacing, and 0.16em word spacing cause no loss.
- Long titles, URLs, sources, tags, 200%-length translated strings, and
  unbroken code-like text wrap or remain in a local overflow region.
- Fixed or sticky content never obscures focus or more than 20% of a
  320px-wide viewport. Safe-area insets are honored when `viewport-fit=cover`.

### Browser, performance, and validation matrix

Support current and previous stable Chrome, Edge, Firefox, and Safari, plus
current and previous iOS Safari and Chrome for Android. Progressive enhancement
may differ visually; content and core journeys remain equivalent.

Field data passes only when mobile and desktop 75th percentiles independently
meet LCP ≤2.5s, INP ≤200ms, and CLS ≤0.1. Before representative field data
exists, each representative route must achieve Lighthouse mobile performance
≥90, accessibility 100, and total blocking time ≤200ms on a production build
with cold cache, mobile CPU throttling, and simulated slow 4G.

Per-route cold-cache budgets:

| Resource | Budget |
| --- | ---: |
| Compressed HTML | ≤50KiB |
| Compressed CSS | ≤50KiB |
| Compressed first-party JavaScript | ≤50KiB |
| Compressed fonts | ≤220KiB |
| LCP image | ≤300KiB |
| Complete initial route | ≤800KiB and ≤25 requests |
| Third-party JavaScript | 0 by default |

Test widths 320, 360, 390, 540, 760, 1024, 1440, and 1920 CSS pixels; phone
landscape at 667×375; 200% text; 400% zoom; coarse pointer; fine pointer with
and without hover; DPR 2; and at least one real iPhone and Android device.

| Check | Coverage | Pass threshold |
| --- | --- | --- |
| Build and static accessibility | Every route template including 404, both modes | Valid production build; zero axe serious/critical violations; Lighthouse accessibility 100 |
| Keyboard | Homepage, Writing index, article, Recommends filters, mode control | Complete Tab, Shift+Tab, Enter, Space, and Escape journey; no missing, obscured, or trapped focus |
| Screen reader | NVDA + Firefox; VoiceOver + Safari | Accurate names, roles, states, headings, landmarks, alternatives, and status announcements |
| Visual accessibility | Both modes, forced colors, reduced motion, text/zoom/spacing stress | No WCAG 2.2 AA failure, loss, overlap, page overflow, or essential motion |
| Responsive and input | Entire stress matrix and real iPhone/Android | No clipping, unreachable action, hover-only behavior, unsafe-area collision, or unexpected overflow |
| Browser and resilience | Support matrix with JavaScript on and off | Core content and journeys complete without uncaught errors |
| Performance | Homepage, Writing index, longest article, Recommends | Every lab, transfer, request, and field threshold passes |
| Identity assets | 16px/32px light/dark tabs and 180px touch icon | Exact geometry remains legible; declarations resolve; zero missing requests |

Any exception names the route, failed criterion, user impact, owner, and expiry
issue. An undocumented exception is a release failure. A budget changes only
through an explicit decision backed by measured user benefit.

## 6. Do's and Don'ts

### Do

- **Do** let visitors meet a person before presenting publishing modes.
- **Do** keep the homepage to introduction, portrait, and recent Writing.
- **Do** preserve first-person uncertainty, enthusiasm, humor, and changing
  interests in copy.
- **Do** use cobalt links, underlines, programmatic state, and a 2px/3px-offset
  focus treatment so interaction never depends on color alone.
- **Do** use natural imagery, intrinsic dimensions, contextual alternatives,
  and responsive sources.
- **Do** use rules, spacing, asymmetry, and physical mounts instead of card
  grids.
- **Do** keep the complete page useful before fonts, JavaScript, imagery, or
  animation finish loading.
- **Do** validate both modes and the full accessibility, responsive, browser,
  identity, and performance matrix before release.

### Don't

- **Don't** create a polished personal-brand resume built from achievement
  metrics, showcase projects, client-style case studies, conversion calls to
  action, or "thought leader" copy.
- **Don't** ship generic AI-polished minimalism: tasteful but interchangeable
  design and copy that could belong to anyone.
- **Don't** turn the homepage into a content dashboard or give Projects and
  Recommends competing homepage sections.
- **Don't** show recommendation topic tags, restore a priority subtype, or
  divide Recommends into importance tiers.
- **Don't** mechanically invert light mode, use cream/sand paper, add purple
  gradients, or invent page-local palettes.
- **Don't** use gradient text, glassmorphism, side-stripe callouts, nested cards,
  repeated tiny uppercase eyebrows, numbered section scaffolding, or identical
  icon-card grids.
- **Don't** use Recursive for paragraphs, Azeret as technical costume, or coral
  as light-mode body text.
- **Don't** animate article prose, hide content pending animation, require
  hover, or preserve transforms under reduced motion.
- **Don't** force external links into a new tab, use unlabeled icon controls, or
  allow sticky elements to obscure focus.
- **Don't** replace real missing artwork with a synthetic thumbnail or empty
  image slot.
- **Don't** add a table of contents, facts box, automatic margin note, author
  bio, side rail, writing filters, or featured-content carousel.
- **Don't** add PWA icon sizes or a web manifest until installability becomes an
  explicit product decision.
