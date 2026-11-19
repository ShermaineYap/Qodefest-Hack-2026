# Design guide — WareTrack theme

Read this before changing any UI in this repo: the extension's side panel (`extension/src/panel/`),
warning page (`extension/src/warning/`), in-chat badges (`extension/src/content.ts`), and the web
panel (`panel/`). The colour values are in [`tokens.css`](tokens.css); use them through CSS variables
and never type a hex value into a component.

**Theme:** WareTrack teal. It comes from the warehouse app, in its Atura rebrand form, as recorded in
the team lead's palette library. It's a calm deep-teal app with one teal accent, flat surfaces and
plain words. In dark mode, mint is the accent.

**Who it's for:** older adults deciding whether a link is safe, often under pressure from the message
that carried it. Every design choice serves one thing: **make the safe choice the obvious, easy,
calm one.** Use no alarm styling beyond what the risk tier calls for, and no clever UI.

---

## 1. Colour

All pairs below pass WCAG AA (at least 4.5:1). Check any new pair before you use it.

### Light (default)

| Role | Token | Value | Use |
|---|---|---|---|
| Ground | `--bg` | `#EDF2F1` | Page background, a cool green-grey |
| Surface | `--surface` | `#FFFFFF` | Cards, panels, dialogs |
| Border | `--border` | `#D5DFDD` | Fields, dividers, outlined buttons |
| Text | `--text` | `#222222` | Body and headings (15.9:1 on surface) |
| Muted | `--muted` | `#5F6B69` | Secondary lines, captions (5.5:1 on surface, 4.9:1 on ground) |
| Brand | `--brand` | `#003439` | Deep teal: headers on the ground, active tab, progress, links (12:1) |
| Primary button | `--primary` | `#00796B` | The one solid button per area, with **white** text (5.3:1) |
| Primary hover | `--primary-hover` | `#00695C` | |
| Success / low risk | `--success` | `#2E7D32` | |
| Warning / medium risk | `--warning` | `#B45309` fill with white text · `#A34A07` as text | Never use `#FF8F00`: the team lead rejected it |
| Danger / high risk | `--danger` | `#C62828` | Destructive actions and the high tier only |
| Info | `--info` | `#1565C0` | |
| Unknown / not checked | `--unknown` | `#5F6B69` | Same as muted, with a dashed outline |

### Dark

| Role | Value | Notes |
|---|---|---|
| Ground | `#111111` | |
| Surface | `#1E1E1E` | Raised: `#262626` |
| Border | `#333836` | |
| Text | `#EEEEEE` | 14.4:1 |
| Muted | `#AAAAAA` | 7.2:1 |
| Brand and accent | `#00C896` (mint) | Mint is the accent in dark mode. Never use it in light mode: it's too loud there and fails with white text |
| Primary button | `#00C896` fill with `#06201D` text | 7.9:1 |
| Success | `#66BB6A` | Lifted for dark: the light values fail on `#1E1E1E` |
| Warning | `#F5A524` | |
| Danger | `#FF6B6B` · button text `#1A0505` | |
| Info | `#64B5F6` | |

- Dark mode follows the system setting (`prefers-color-scheme`), not a toggle.
- Don't make the dark header a teal bar: the team lead rejected the old `#003028` header. Dark headers sit on the ground.

### Rules

- **One accent, locked.** Teal (mint in dark) marks the primary action, the active state and progress. Nothing else is teal. No new hue appears on a later screen.
- **Risk colours are not the accent.** Green, amber and red mean risk tier and nothing else, so never use them for decoration.
- **One grey family, the cool one.** Every grey comes from the tokens; don't add warm greys such as `#e2ded4` or `#f7f6f2`. The current panel CSS uses warm greys, so replace them.
- **Flat surfaces.** No gradients, no patterned backgrounds.

---

## 2. Type

- **IBM Plex Sans** for all UI, and **IBM Plex Mono** for domains, URLs and request IDs, so that `l`, `1` and `I` look different, which matters when reading `paypaI.com`.
  - Bundle the fonts' `.woff2` files (OFL licence) in the extension. Don't load Google Fonts: the extension promises that nothing leaves the device beyond the redacted payload.
  - Fall back to `system-ui`.
- **Use tabular figures** (`font-variant-numeric: tabular-nums`) wherever numbers appear.

| Style | Size / weight | Use |
|---|---|---|
| Display | 22px / 700 | Once per screen: the verdict headline |
| Title | 18px / 600 | Section and card titles |
| Body | 16px / 400, line-height 1.5 | Default. Never smaller for anything the user must read |
| Small | 14px / 500 | Captions, "What I checked" |
| Code | 15px Plex Mono | Domains and URLs |

- Nothing is smaller than 12px. The audience is older, so keep 16px body text as the floor for sentences.
- Show emphasis with weight, never with another font.

---

## 3. Shape, space, depth

- **Corners:** 8 for buttons, inputs and chips (pills are 999). Cards and panels are 12, dialogs and the warning card 16. No other radius.
- **Spacing:** multiples of 4, and 8 for layout gaps. Space siblings with the parent's `gap`, not margins on each child.
- **Cards are flat:** they're separated from the page by their fill, with no border and no shadow. A shadow means something is floating above the page (a dialog or popover).
- **Touch targets:** at least 44px tall for every button and link-button.

---

## 4. Components

- **Buttons:**
  - One solid primary button per area. Everything else is outlined (border plus teal text) or a text button in teal.
  - Labels are in sentence case and name the action: "Go back to safety", "Check this link". Never "Submit" or "OK".
  - Red is only for destructive actions. On the warning page, **"Go back to safety" is the solid primary**. "Continue anyway" is a quiet text link in muted colour, with no button styling, but still underlined so it looks clickable.
- **Risk tier indicator:** this is the core component. **No emojis**, so replace 🟢🟡🔴⚠︎ with inline SVG icons. Each tier differs **in shape as well as colour**, so colour-blind users can tell them apart:

  | Tier | Icon | Colour | Label |
  |---|---|---|---|
  | low | circle with ✓ | success | "Looks safe" |
  | medium | triangle with ! | warning | "Be careful" |
  | high | octagon with ! | danger | "Likely scam" |
  | not checked | dashed circle with ? | unknown | "Not checked" |
  | checking | three-dot pulse (static under reduced motion) | muted | "Checking…" |

  - In chat, the badge is a 16px icon with its label in the tooltip and `aria-label`.
  - Badges sit on WhatsApp, Telegram and Messenger backgrounds, which can be light or dark. Give each icon a 1.5px surface-coloured ring so it reads on either.
- **Status in text:** a coloured icon plus coloured text, never a tinted background block. The exception is the warning page's domain box, which is the one tinted area.
- **Fields:**
  - 44px tall, with a 1px border and a 2px teal focus ring offset by 2px.
  - The error goes under the field, never only in a toast.
- **Domain display:** in Plex Mono, with the registrable part (`login-verify.top`) in bold and the rest in muted, so the real owner of the link stands out.
- **Loading:** never a blank panel. Show a skeleton the shape of the result card.
- **Empty and failed states** say why, plus the way out: "Couldn't reach the checker — Try again. Links on this page are marked Not checked."

---

## 5. Motion

- 150–200ms ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`). Things leave at about 0.7× their entrance time.
- Entrances fade in from 95% scale, never from zero.
- Presses respond within about 120ms: buttons scale to 0.97.
- `prefers-reduced-motion: reduce` turns every animation into an instant change or a 150ms fade.
- **Nothing in the high-risk tier flashes, shakes or pulses.** Calm is the point.

---

## 6. Copy

- Use plain words at roughly a 12-year-old reading level, and keep each sentence short. Speak to the reader as "you".
- Say what is wrong, then what to do: "This link pretends to be Maybank. Don't enter your password."
- Write dates as "19 Nov 2026" and times as "8:34 PM".
- One label per intent: "Check this link" is the same everywhere.
- Never blame the user, and never use fear words like "DANGER" or "HACKED". The red tier is enough.

---

## 7. Per surface

| Surface | What to apply first |
|---|---|
| **Warning page** | Ground `--bg`, one 16-radius surface card, the octagon icon plus the display headline, the domain box, "Go back to safety" as the solid primary, "Continue anyway" as a muted text link, and "What I checked" in small muted text |
| **Side panel** | About 360px wide. 16px side padding. The textarea and "Check this link" (primary) come first. The result card uses the tier icon plus the headline. The redaction list is in Plex Mono |
| **Chat badges** | SVG tier icons (above), no emoji, with a tooltip and `aria-label`. Keep them tiny and never let them move the chat layout |
| **Web panel (`panel/`)** | Same tokens and type. A brand header on the ground, in deep-teal text (light) or mint (dark) |

---

## 8. Before you finish a UI change

- [ ] Colours come only from `tokens.css` variables, and there are no new hex values
- [ ] Every new text/background pair is AA (4.5:1) in **both** light and dark
- [ ] No emojis anywhere in the UI
- [ ] One solid primary button per area. Destructive or high-risk actions are never the easy default
- [ ] Body text is 16px or larger, targets are 44px or larger, and focus rings are visible
- [ ] Reduced motion is respected, and nothing flashes
- [ ] Checked in light **and** dark (`npm run sim` saves screenshots to `extension/sim-output/`)
