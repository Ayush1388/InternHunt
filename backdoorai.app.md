# backdoorai.app — Design Map + Taste DNA

Source: https://backdoorai.app/ · captured 1440×900 · measured from computed styles on the hero, the "How it works" section and the section stack. Two below-fold screenshots (dark section, mid-page) rendered blank because scroll-reveals had not fired, so those sections are measured from the DOM only.

## Design Map

**Colour** (screenshot-verified)
| Role | Value | Where |
|---|---|---|
| Page | #FFFFFF | body, 42 background hits |
| Ink | #111111 | headings, CTA fill, 52 text hits |
| Muted text | #6E6E72 | sub-copy, nav (44 hits) |
| Hairline / gray bubble | #E9E9EB | grid borders, received chat bubbles |
| Warm chip | #F5F4F1 | ChatGPT / Claude / Perplexity pills |
| Dark band | #0E0E10 | one full-width section, 741px tall |
| Hero backdrop | pale sky photo, #DCEBF5 → white by y≈850 | hero only |
| Tile pastels | peach #FFF1E6, blue #EAF2FE, butter #FEEFC3, plus mint, lilac, pink | behind phone mockups only |
| Sent bubble | iMessage blue gradient | user messages |

No coloured text, no coloured buttons. Colour lives in tile backgrounds and chat bubbles.

**Type**
- Display: Libertinus Serif 400. H1 76/76px, tracking -3.04px (-0.04em). H2 48/51.84px, -1.92px.
- UI/body: Geist. H3 16/24px weight 500, -0.4px. Dominant text size is 14px (85 hits), then 12.5px (58). Nav, chips 14.5px/500.
- Weights: 400 ×262, 600 ×37, 500 ×30. Bold (700) appears once.

**Shape & depth**
- Pills (fully rounded) for CTA, nav button, chips: 157 elements.
- Cards/tiles 22px; inner phone screens 14–16px; chat bubbles 16/16/16/5px (tail corner).
- Sections divided by 1px #E9E9EB hairlines in a 3-column grid, no card shadows.
- One tactile shadow: black CTA, `inset 0 1px 0 rgba(255,255,255,.18), 0 -2px 2px rgba(0,0,0,.5)`. Phones use `inset 0 1.9px 1.9px rgba(255,255,255,.85), inset 0 -1.9px 2.2px rgba(0,0,0,.07)` for glass.

**Layout**
- Container 1152px; hero 850px tall with 64px top padding; sections 96px top/bottom (128px for one); nav links right-aligned, logo left, one outlined "Log in" pill.
- Hero: 2 columns, copy left (~540px), phone right (~300px wide, 640px tall).
- How it works: centered H2 + one-line sub, then 3×2 hairline grid, each cell = pastel tile with phone crop (≈327×343), then 16px/500 title with a numeral and 14px muted body.

**Motion**
- Easing `cubic-bezier(0.22, 1, 0.36, 1)`: transform 0.5s, reveal = opacity + blur filter 0.38s. Colour hovers 150ms. Lenis smooth-scroll. No GSAP.

**Micro-interactions** (second pass, page scrolled in 250px steps with 220ms pauses so every reveal fired; captured with `document.getAnimations()` and a MutationObserver)
| Element | What moves | Timing |
|---|---|---|
| Section / block reveal | opacity 0→1 only, no slide, no blur | 350ms, `cubic-bezier(0.22,0.61,0.36,1)`, 50ms stagger |
| Phrase highlights in the email demo | background `transparent → rgba(217,48,37,.13)` and text `#1F1F1F → #D93025` (bad); `rgba(30,142,62,.13)` / `#137333` (good), radius 4px, padding 0 2px, `box-decoration-break: clone` | 300ms `cubic-bezier(0.22,1,0.36,1)`, 120ms stagger per phrase |
| Sticky-note labels | pill 12px/600, padding 4px 10px, butter `#FEEFC3` text `#8A5300` (bad) / blue `#D3E3FD` text `#0842A0` (good); slides `translateX(10px) rotate(0)` → `translateX(0) rotate(-1.8deg)` | 420ms, 200ms delay |
| Curly arrows to the notes | SVG path, 1.6px stroke `#F2A600`, drawn with `stroke-dashoffset 1→0` (pathLength=1) | 360ms, 280ms delay |
| "Not ~~AI slop~~" heading | hand-drawn 5px `#FF5A4E` path across the words, drawn the same way | 600ms, 400ms delay |
| Email demo | one Gmail compose window flips between "Why founders skip it" (red dot) and "How Backdoor writes it" (green dot); same frame, content swaps | auto-cycles |
| Pricing headline | price in a coral box, paragraph with inline 0.95em icon chips, hand-drawn green squiggle under "free" | static after reveal |
| Live dots | `pulse` 2s opacity 1→.5→1; one 12s linear spinner | infinite |
| Floating mascots / partners | `translateY(-6px) rotate(-1.5deg)` float | slow loop |
| Hero | sky photo (`/images/hero-sky.jpg`) under radial white wash at 74% 48% and warm glow at 90% 8%, fading to white | fades in 1200ms `cubic-bezier(0.16,1,0.3,1)` |

Lesson: motion is short and small. Nothing slides more than 10px, nothing blurs, and the drama comes from things being *drawn* (strikes, arrows, squiggles) rather than flying in.

## Taste DNA

**1. Serif for the promise, Geist for everything else**
- Trigger: a hero must feel human and a little editorial, but a product UI must stay compact.
- Decision: Libertinus Serif at 76px/400 for H1 and 48px for H2 only; every other string is Geist at 12.5–16px.
- Reason: weight 400 at huge size reads as a printed headline; the 5× size jump to 14px body means nobody has to decide what is a heading.
- Evidence: H1 76px, H2 48px, then sizes drop to 16/14/12.5px; bold used once on the page.

**2. Restraint: no brand colour at all**
- Trigger: five pastel tiles and a sky backdrop are available, so colour could be everywhere.
- Decision: ink #111 on white for every action and every word; colour is allowed only as the background behind a phone mockup or inside a chat bubble.
- Reason: the product is the colour. A single black CTA is the only heavy object, so the eye lands on it.
- Evidence: accent candidates are only #F5F4F1 and #111; the CTA is 64px tall, #111, with the only deep shadow on the page.

**3. Show the chat, not the feature list**
- Trigger: the product is a text conversation, which is hard to explain in bullets.
- Decision: every explanation is an iMessage replica (status bar, "Delivered", typing dots, SEND in a blue bubble) at real size.
- Reason: a visitor learns the interaction by reading it once, and the copy ("Send SEND") doubles as the demo.
- Evidence: hero phone ~300×640; all six How-it-works tiles are phone crops with sent/received bubbles; copy is lowercase and casual inside bubbles only.

**4. Hairlines instead of cards**
- Trigger: six similar explanations need grouping.
- Decision: a 3×2 grid separated by 1px #E9E9EB borders, tiles with 22px radius inside, no card shadow.
- Reason: structure without weight, so the pastel tile and its phone are the only things with volume.
- Evidence: shadows other than the CTA and glass insets are ≤6% black; section padding is a steady 96px.

**5. One dark band for rhythm**
- Decision: a single #0E0E10 section, 741px tall, between white sections.
- Reason: breaks 9,400px of white without adding a second palette.
