---
name: ui-gotchas
description: Hard-won, stack-agnostic UI and design-system gotchas — the traps that make an interface look slightly wrong without anyone being able to say why. Covers dark mode done right (not inverted), surface ladders, control heights, borders vs outlines, icon sizing and stroke, line-height, bevels and depth, color-mix pitfalls, generated-component cleanup, motion mistakes, and the states nobody builds. Use when building, reviewing or debugging any UI, when something "works but feels off", when adding dark mode, when setting up tokens or a component library, or before shipping a screen.
---

# UI gotchas

Lessons collected while building design systems on Tailwind, shadcn-style components and headless primitives, written so they apply to any stack. Each entry is a trap, why it bites, and the fix. Scan the section that matches the work; use the checklist at the end before calling anything done.

Values given (34px, 4px, 12px, 300ms) are the ones that worked for us. Pick your own, but pick them once and put them in tokens.

## 1. Tokens: three layers, complete in both themes

Primitives → semantic roles → component variants. Primitives are the raw scales (gray-0…950, radii, durations). Semantic tokens name roles (`--surface-base`, `--border`, `--muted-foreground`) and exist in both a light and a dark block. Component variants (`.color-brand`, `.color-destructive`) set a fixed set of CSS variables that components read.

- **A role added to only one theme silently falls back.** Every new semantic token goes in both blocks the same day. Keep the contract symmetrical and check it in a diff.
- **No raw colour values outside the token files.** A `#hex` or `oklch()` in a component cannot be themed and will drift. Rule of thumb: semantic role first, palette step when no role fits, raw value never.
- **If you wipe the framework's default palette, unknown classes become silent no-ops.** `bg-zinc-100` renders nothing and throws nothing. Grep for stray default-palette classes in review; they are the easiest bug to miss.
- **Make the neutral scale theme-aware, keep hues literal.** Define gray so that step number = distance from the base surface in both themes. Then `bg-gray-100` means "one step nested" everywhere, and you rarely need `dark:` overrides. Hues (brand, destructive) stay literal light values; components reach them through a `color` prop whose class carries the dark mapping.
- **Write components once against CSS variables, never branch per colour.** The colour class sets `--cv-solid`, `--cv-soft`, `--cv-text` …; the component uses `bg-(--cv-soft)`. Adding a colour is then one CSS block, not edits in every component.
- **`dark:` must follow your resolved theme, not only the OS.** If there is a light/system/dark switcher, drive the variant from `data-theme` on `<html>`; a media-query variant ignores the switcher.
- **Mix a hue into gray in OKLAB, not OKLCH.** OKLCH interpolates hue, so `color-mix(in oklch, gray, orange)` wanders through every hue between them on the way and comes out muddy or the wrong colour. `color-mix(in oklab, …)` goes straight there.
- **Keep generator aliases, author with your own names.** Component generators (shadcn and friends) expect `--background`, `--card`, `--popover`. Alias them to your surfaces so the generated output resolves, then restyle to your names. Nobody writes `bg-card` by hand.
- **Mark what you invented.** Anything not from the design file (all dark values, usually) is provisional. Keep a "Derived" list so nobody defends a guess as a decision.

## 2. Dark mode is a second palette, not an inversion

Flipping the light scale gives muddy surfaces, glowing borders and vibrating colour.

- **Closer = lighter in dark; closer = darker in light.** Nested regions step one shade darker in light and one shade lighter in dark. With a theme-aware gray scale this is automatic.
- **Compress the dark end.** Dark surfaces need small lightness steps to read as layers (our steps 0–400 covered 16% → 30% L). Text steps then jump (40% → 99%) to keep contrast.
- **Borders need a bigger step in dark.** A 24% border on a 22% surface disappears. Go two steps up, not one.
- **Shadows barely register on dark surfaces.** Express elevation with lightness first, shadow second. Floating layers (menus, popovers) in dark are lighter than everything under them and carry a much stronger, larger shadow than in light.
- **Tinted surfaces are the hue mixed into the dark surface, not the 900/950 step of the hue.** A saturated 950 reads as a coloured slab; a 10–15% mix reads as a tint.
- **Solid fills stay vivid.** A 500 fill is fine on dark. What must change is everything around it: bevel light, text, borders.
- **Coloured text moves up the scale.** Light mode uses 600–800 for coloured text; dark uses 200–400.
- **No pure white text.** Top text step around 96% L; reserve 99% for rare maximum emphasis.
- **A near-white primary flips your bevel.** If the primary button is near-black in light and near-white in dark, its highlight/shade pair must be restated for dark or the "shade" ends up brighter than the fill.
- **White inner glows look like bugs on dark.** Bevel light becomes a whisper (~7% white); bevel shade goes to the deepest step.
- **Check both themes on every change**, on a living reference page, not from memory.

## 3. Surfaces and depth

- **Name surfaces by what they do, not by colour:** base (app chrome) → elevated (frames, panes) → raised (cards, nested regions) → overlay (floating, or a thumb that sits on a control). Nest one step at a time. Never jump two.
- **Overlay is the exception to the ladder.** A floating menu goes back to near-white in light and carries a shadow; it is not "one more step darker".
- **The bevel recipe for a physical-feeling control is four layers:** a 1px border, a thin inner light on the top edge (`inset 0 1px 2px`), a thin inner shade on the bottom edge (`inset 0 -1px 2px`), and a soft halo (`0 0 6px` at ~6% black). Pressed swaps the light for shade on both edges, so the control reads as pushed in.
- **A bevel is an edge, not a band.** The first draft is almost always too loud. Our design file had 4px/5px insets and an 80% white glint; the shipped values were 1px/2px and 45%. Quiet it until you can barely see it, then stop.
- **Reuse the recipe, never hand-write shadows.** Put the bevel in a shared CSS variable resolved per element so it picks up that element's colour.
- **Translucent chrome:** never stack two light translucent surfaces; legibility collapses. Bigger surfaces get stronger blur and deeper shadow than small chips. Honour `prefers-reduced-transparency` (go solid) and `prefers-contrast: more` (solid + defined border). Keep transition-time `filter: blur()` under 20px; it is expensive, especially in Safari.

## 4. Controls: one height, border included

- **Every default-size control is exactly one height, border included.** Buttons, icon buttons, inputs, select triggers, menu items, segmented controls (the whole group), nav rows. Put it in a token (`--spacing-control: 34px` → `h-control`) and use the token.
- **Never derive height from padding + line-height.** That is how a 36px button ends up beside 34px ones. Fix the height; let text and padding sit inside it.
- **Borderless variants carry a transparent 1px border** so ghost, outlined and filled all have the same box and align in a row.
- **A group is one control.** A segmented control is the control height as a whole, border included. Its items are height − 2×border − 2×inset; that is where the thumb's padding comes from.
- **Never mix control sizes in one row.** A small size exists for genuinely dense spots only.
- **Edges are borders; outlines are for focus rings only.** A 1px border inside the box, counted in the size. The focus ring is `outline` (2px, offset 2px), so it can never collide with a control's edge or shift layout.
- **All four states, always:** hover (fill or colour shift), pressed (`:active`: bevel swap plus a 0.97–0.98 scale), focus-visible (ring), disabled (50% opacity, no pointer events). Transitions on a fast duration with ease-out.
- **Icon-only controls need an `aria-label`.** Every one. Same height as text buttons.
- **A switch, checkbox or small glyph still sits in a full-height row** so its label and hit area line up with neighbours.
- **Concentric radii.** A child inside a padded, rounded parent reads best when inner radius = outer radius − padding. Items inside containers get the smaller step, controls the medium step, cards and frames the larger ones.
- **4px grid for spacing.** Decide a few values (1px inset in a track, 4px between items in a group, 12px padding and gap in cards and chrome) and stop choosing.

## 5. Icons

- **Icon size = adjacent font-size + 4px.** 16px text → 20px icon, 14px → 18px, 12px → 16px. Make it automatic with `width: calc(1em + 4px)` on the icon element so it follows the text wherever it goes; then never set a manual size next to text.
- **Icon stroke matches the text's stem weight.** A regular-weight sans has a stem around 9–11% of its font size (measure your face). Set `stroke-width: calc(1em × ratio)` and add `vector-effect: non-scaling-stroke` on the paths so the stroke stays in screen pixels at any icon size. Heavier text next to the icon needs a heavier ratio.
- **Kill library defaults that fight your rule.** Generated components ship `[&_svg]:size-4` and a fixed `strokeWidth`. Remove them, or your icon rule never applies.
- **Centre with `align-items: center`, not manual nudges.** If it still looks off, the line-height is missing (see Type).
- **Optical padding:** the side of a button that has an icon gets 2px less padding (12 vs 14) so the label does not read as off-centre.
- **One icon family, one stroke logic.** Never mix filled and outlined icons in one row.
- **Rows with icons align on fixed-width slots.** `flex-shrink: 0` on the icon slot and the trailing action; gap alone will not align columns across rows of different content.

## 6. Type

- **Every piece of text sets its line-height explicitly.** Unset line-height is the usual cause of "the icon is 1px off" and "the button is 2px taller than the other one". Control text is a fixed pair (14/20); body is relaxed (~1.6).
- **The control's height does not come from its text.** Fix the height, then text size and padding can change independently.
- **Tracking is size-specific.** Negative on large display and subheads (−0.02em…−0.025em), near zero on body, slightly positive on tiny all-caps labels.
- **Leading tracks size inversely.** Tight on headings, loose on body, tighter again for dense data UI.
- **Floor at 12px.** Below ~14px, do not use your lowest-contrast text step; use the muted step instead.
- **Hierarchy from size, colour and family before weight.** Regular (400) nearly everywhere, one heavier weight for headings and the wordmark.
- **One text family.** A monospace face only for counts, timestamps and code, where tabular figures matter. Two sans faces in one UI always look like an accident.
- **`@font-face` is lazy.** A family downloads only when text actually renders in it, so unused families cost nothing, but a rarely-used style will flash the first time it appears. Set `font-synthesis: none` so missing weights are not faked.
- **Scale layout with the text.** Spacing in rem/em where a larger font setting should grow the layout; fixed px only where the box is truly fixed (control height).

## 7. Colour use

- **Neutral first.** Most UI is dark grey on neutral grey. Colour is intent, routed through a component's `color` prop (neutral | brand | destructive), never a decorative accent.
- **One colour per region.** A card with a brand-coloured eyebrow does not also get a brand button. A categorical hue and the brand hue do not share a card.
- **Destructive is only for destructive actions.** Never a general "red accent".
- **Categorical colours tell entities apart, never intent.** Use the hue for a mark (dot, tint); text stays in text tokens or takes the hue mixed at least halfway toward the foreground, and you check 4.5:1. If the brand hue is in your categorical set, drop it from the set.
- **Hover/highlight needs a visible step.** A highlight fill chosen from a design file can become invisible when the surface it sits on shifts by a step. Verify on the real surface.

## 8. Layout and shell

- **`html, body, #root { height: 100% }` and `body { margin: 0 }`** or every "full height" pane is wrong by a few pixels.
- **Accidental scrollbars come from stray margins.** A pane that fills its frame should have no margin on its outermost child; check each pane at a non-default viewport.
- **A dev-only living reference page** (`/dev/design-system`, excluded from production) pays for itself the first week. Every component, every variant, both themes, a theme switcher. Review every change there, not in the feature.
- **Build in the feature folder first; promote to the shared library on second use**, or immediately if the component exists in the design file.

## 9. Generated components and headless primitives

- **Generators edit your global CSS.** Scaffolding a component may add `:root { --background: … }` blocks or extra `@import`s to your globals. Preview with a dry run, and revert those edits; your contract lives in your own token file.
- **Generators may add stray dependencies.** A registry may write `import { cn } from "cn"` and install an npm package of that name. Point it at your one `cn` helper and remove the package. Keep one `cn` (clsx + tailwind-merge).
- **Restyle, do not accept the default look.** Replace `bg-background` / `bg-card` / `bg-popover` with your surface names, fix the control height, borders instead of rings, your radii, your bevel, your state attributes.
- **Headless libraries use `render`, not `asChild` (Base UI).** Composition patterns differ between libraries; check before copying a pattern across.
- **Some primitives throw on structure**, e.g. a menu Label must be inside a Group in Base UI. Read the error, do not fight it.
- **HTML already has a `color` attribute.** When you add a `color` prop, type it as `Omit<ComponentProps<"button">, "color"> & { color?: … }` or TypeScript will fight you.
- **Use the primitive's state attributes** (`data-pressed`, `data-highlighted`, `data-popup-open`, `data-starting-style` / `data-ending-style`) for styling and enter/exit, not your own JS state.
- **Popovers, menus and tooltips scale from their trigger.** Positioning primitives expose the anchor side as a CSS variable; set `transform-origin` from it. A centred origin on an anchored popover is the single most common motion bug. Modals are exempt.

## 10. Motion: never ship

Decide first whether the thing animates at all. Anything triggered 100+ times a day (keyboard shortcuts, command palette, core navigation) does not animate. Hover and frequent toggles get near-nothing. Modals, drawers and toasts get standard motion. The delight budget lives in rare, first-time moments only.

| Never | Instead |
| --- | --- |
| `transition: all` | Name the properties |
| `scale(0)` entrance | `scale(0.95)` + `opacity: 0`; nothing appears from nothing |
| `ease-in` on UI | `ease-out`; ease-in delays the moment the user is watching |
| Built-in `ease` on deliberate motion | A real curve in a token, e.g. `cubic-bezier(0.22, 1, 0.36, 1)` |
| A new inline `cubic-bezier` from memory | A token |
| UI duration over 300ms without a reason | 150–250ms for menus, 100–160ms for press |
| Keyframes on toasts, toggles, anything rapid | Transitions; they retarget, keyframes restart from zero |
| Animating width/height/margin/padding/top/left | `transform` and `opacity` only (`clip-path` as the third) |
| A CSS variable on a parent driving a child's transform | Set `transform` on the element itself |
| Motion-library `x`/`y`/`scale` shorthands on a busy page | The full `transform` string (runs off the main thread) |
| Ungated `:hover` motion | `@media (hover: hover) and (pointer: fine)`; touch fakes hover |
| Missing `prefers-reduced-motion` | A gentler variant (crossfade), not zero feedback |
| Enter and exit along different paths | Same path both ways; that is what makes swipe-to-dismiss obvious |
| Everything entering at once | 30–80ms stagger, lists seen occasionally only |
| Respond on click | Highlight on pointer-down; waiting for release feels dead |

**Gesture extras:** animate from the live on-screen value when interrupted, never from the logical target; ignore new touch points once a drag has begun; ~10px hysteresis before committing to a drag direction; decide reverse-or-commit by velocity sign at release, not position; percentages in `translate()` are relative to the element's own size, so prefer them over pixels.

**Debugging feel:** slow it to 10% in the DevTools Animations panel, step frame by frame, test gestures on a real phone over the LAN, and look again tomorrow.

## 11. States nobody builds

The happy path gets built. Trust is won in the other states.

- **Acknowledge within ~400ms of any action:** pressed style, label change, spinner on the control, or an optimistic update. The result can take longer; the acknowledgment cannot.
- **Load in place, shaped like the content.** Skeletons the size of the real thing so nothing jumps. Keep previous content while refreshing and mark it stale rather than blanking.
- **First-use empty ≠ no results ≠ all done.** Three different messages and actions.
- **Errors go where the problem is**, in plain words, saying whether the work is safe and what to do next. Never lose input on an error. Never a code as the message.
- **Nothing important lives only in a vanishing toast.**
- **Explain disabled controls** in text nearby or on hover/focus.
- **More than colour for error, warning and success:** icon and words too.
- **Confirm with the same verb as the button** ("Publish" → "Published").
- **Undo over confirmation for reversible actions**; confirm only what is irreversible and costly. Over-confirming trains people to click through.
- **Announce changes to assistive tech**; move focus to the message when the person must act.

## 12. Process

- **Pull exact values from the design tool's API, never from a screenshot.** Screenshots lie about colour, blur and anti-aliased sizes.
- **When code and the design file disagree, do not silently fix either.** Log an open question with the choice the code is making meanwhile.
- **Good defaults beat options.** Make the call, state it in one line, ship it. Do not present styling options as a menu.
- **Handle edge cases invisibly:** pause timers when the tab is hidden, fill the gaps between stacked items so hover does not flicker, capture the pointer during a drag.
- **Fresh eyes the next day catch what a long session cannot.**

## Pre-ship checklist

- [ ] No raw colour values or default-palette classes in component or feature code
- [ ] Renders correctly in both themes; in dark, nothing closer to the viewer is darker than what is beneath it
- [ ] Surfaces nest one step at a time; floating layers use the overlay surface and a shadow
- [ ] Every default-size control measures exactly the control height, border included; no mixed sizes in a row
- [ ] Edges are 1px borders; the only outline is the focus ring
- [ ] Hover, pressed, focus-visible and disabled on everything interactive; icon-only controls have `aria-label`
- [ ] Icons have no manual size or stroke; they size from the text and sit on `align-items: center`
- [ ] Every text element has an explicit line-height; nothing under 12px
- [ ] Radii from the scale, spacing on the grid, concentric where nested
- [ ] Motion: transform/opacity only, ease-out, under 300ms, origin at the trigger, reduced-motion variant present
- [ ] Loading, empty (first use and no results), error and success states exist and keep the layout stable
- [ ] Anything invented rather than designed is marked as derived
