# Doorstep design system

One look for the landing page and the app. The landing page (`client/src/Landing.jsx`, `landing.css`) is the benchmark; the app (`client/src/app/`) reuses its tokens and pieces. The palette was taken from a `/taste` analysis of backdoorai.app (see `backdoorai.app.md`), the layout and copy are our own.

## Principles
- White page, near-black ink, one blue accent. Colour appears in small, meaningful places: pastel tiles behind icons and tags, red and green for status.
- Big, tight headings; small, calm body text. Every page opens with a headline that rises in word by word and one hand-drawn blue underline.
- Pills and rounded cards (28px). Hairline borders and soft shadows, never heavy boxes.
- Motion is short and small: fades and 12px lifts, things being *drawn* (underline, strike, squiggle). Everything respects `prefers-reduced-motion`.
- Honest content: example data is labelled as an example.

## Tokens (`app/app.css`, scoped under `.ih`)
| Token | Value | Use |
|---|---|---|
| `--ink` | `#111111` | text, primary buttons, selected state |
| `--ink2` | `#3c3c43` | body text on photos and cards |
| `--muted` | `#6e6e72` | secondary text |
| `--line` | `#e9e9eb` | hairlines, card borders |
| `--bg2` / `--bg3` | `#f5f4f1` / `#ebe9e3` | chips, inactive controls, hover |
| `--brand` | `#3aa5f6` (gradient `#62bffb → #3aa5f6`) | the logo, draft counts, “why this fits” notes |
| `--sky` | `#3aa5f6` | the hand-drawn underline (it matches the sky photo) |
| `--t-peach/blue/butter/mint/lilac/pink/red` | pastel tints | tiles, tags, avatars |
| `--green`, `--red` | `#1e8e3e`, `#d93025` | open / closing, Gmail-style highlights |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | all movement |

Type: Geist (variable) for everything, Geist Mono for code-like chips, Caveat only for handwritten notes on the email comparison. Headings use weight 600 with tracking between -0.03em and -0.05em.

## Pieces
- **Buttons** `.btn` (+ `dark` glossy, `light`, `chip`, `sky`, `ghost`; sizes `sm`, `lg`, `icon`).
- **Chips** `.fchip` (aria-pressed toggles), `.tag` (+ `blue mint butter peach red ink line yc`), `.seg` (segmented control), `.chiprow` + `.chips` (labelled, horizontally scrolling filter row).
- **Surfaces** `.card` (+ `hov`, `glow` for the cursor spotlight), `.band` (the dark card), `.empty`, `.deck` (a card holding a page's main controls).
- **Layers** (native `<dialog>`): `.modal`, `.panel` (right sheet, bottom sheet on phones), `.palette`; menus `.menu`; toasts `.toast`.
- **Page opener** `.hero` (+ `.photo` for the cloud photo, `/hero-sky.jpg`), `Words` for the rising headline, `Hand` for the underline.
- **Data** `Avatar` (pastel monogram), `CountUp`, `Skel` shimmer, `JobCard` / `CompanyGroup` / `JobPanel` in `app/jobs.jsx`.

## Pages
| Page | Purpose | Composition |
|---|---|---|
| Explore | every internship and job, worldwide | photo hero with a big search; one control deck (All / Internships / Jobs, Backed by YC or Techstars, Where, Role); results as company cards |
| For you | roles ranked against your resume, GitHub or portfolio | sticky profile builder on the left (three sources, editable skills), matches with a fit score and reasons on the right, a dark selection tray |
| Who's recruiting | coming soon | explanation, example list, early-access form |
| Drafts | review and approve emails | list on the left; editor on the right with recipient (labelled verified / on site / best guess), subject, body, live checks, the facts used, Approve and send |
| Pipeline | everything you found, drafted, sent | stat tiles, a board with Found, Drafted, Sent, Replied, Interview (drag between columns) |
| Settings | Telegram, Gmail, limits, data | one card per topic; delete needs typing “delete” |

## Landing additions
- The Telegram section (`#telegram`, `landing-tg.css`) plays an example chat: typing dots, a pick, a draft with SEND / EDIT / SKIP, then “sent”. It is labelled “Example chat”.
- Reveal-on-scroll marks elements with both `.in` and `[data-in]`; React can drop the class on re-render but never the attribute, so nothing that has appeared can vanish again (the FAQ bug).

## Rules for new pages
1. Start from `.hero` and a headline with one `mark` word.
2. Put the page's main controls in one `.deck` card; do not scatter filters.
3. Reuse a class before adding one. New colours or sizes need a reason; use tokens.
4. Lists use `.card` rows with `rv` reveal and `--d` stagger; empty and loading states use `Empty` and `Skel`.
5. Check it at 1440px and 390px, with the keyboard, and with reduced motion on.
