---
trigger: always_on
---

# UI design rule — WareTrack theme

Before creating or changing any UI (HTML, CSS, or code that renders UI) in `extension/` or `panel/`:

1. Read `design/DESIGN.md` in full, and use the variables in `design/tokens.css`. Never type a new hex
   value into a component.
2. Follow it over your own defaults. If a request conflicts with it, say so and ask before breaking a rule.
3. Before you say the change is done, go through the checklist in section 8 of `design/DESIGN.md`.
   Check light **and** dark mode, and run `npm run sim` in `extension/` when the extension's UI changed.

The non-negotiables:
- No emojis in the UI.
- One teal accent, and one solid primary button per area.
- Every text/background pair is AA in both modes.
- Body text is 16px or larger.
- No flashing on the high-risk tier.
