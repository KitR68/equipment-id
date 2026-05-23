# Equipment ID — Design Brainstorm

The user explicitly requested a clean, dark-blue and white, centered single-page layout that matches their existing "Property Risk Report" app. Three stylistic interpretations of that brief were considered before committing to one.

<response>
<text>
## Approach A — "Industrial Dossier" (selected)

**Design Movement.** Mid-century industrial documentation meets modern Swiss minimalism — think the visual language of Rolex service manuals, Patek service tags, or the inspection sheets used by aerospace QA teams. Calm authority over flash.

**Core Principles.**
1. *Quiet authority.* The interface should look like a tool a field engineer trusts, not a consumer toy.
2. *Document-first hierarchy.* Each result reads like a stamped certificate field, not a chat bubble.
3. *Restraint with one accent.* A single deep navy carries the brand; everything else is paper-white, ink-black, and one warm ember accent for confidence indicators.
4. *Evidence over decoration.* Every visual element must carry information (source of finding, confidence, raw OCR snippet).

**Color Philosophy.**
- Background: pure paper white `#FFFFFF` with a faint cool tint.
- Primary navy: `#0B2545` (deep, slightly desaturated — closer to ink than to royal blue).
- Secondary navy: `#13315C` for hover/active states.
- Hairline border: `#E2E8F0`.
- Accent ember: `#B45309` used *only* for the confidence chip, never for buttons or links.
- Subtle parchment tint on result cards: `#F8FAFC` so the cards read as inspection slips.

**Layout Paradigm.** A single centered column, max-width 720px, on a generous off-white field. The header sits as a thin nameplate (literal nameplate metaphor) with a hairline rule beneath it. The upload region is a tall dashed rectangle reminiscent of a film negative holder. Results stack vertically as four labeled "field cards" — each with a left-side label gutter (uppercase, tracked) and a right-side value area. This mirrors how a real equipment dataplate is laid out: label on the left, stamped value on the right.

**Signature Elements.**
1. *Nameplate header* — a thin horizontal bar with the title set in a condensed serif, four screw-head dots in the corners (pure CSS), evoking a riveted dataplate.
2. *Field-card label gutter* — every result card has a 120px left column with the field name in `font-mono` uppercase, separated from the value by a vertical hairline. This single motif ties the whole page together.
3. *Confidence chip* — a small pill that reads `HIGH · serial pattern matched` or `INFERRED · web-researched` in tabular numerals.

**Interaction Philosophy.** Interactions should feel like stamping a form, not animating a toy. Buttons depress 1px on press; cards fade-and-rise 6px on mount with a 60ms stagger. No bouncy springs, no parallax, no gradients in motion. The drag-over state on the upload zone simply darkens the dashed border and reveals a faint crosshair — like a viewfinder locking on.

**Animation.**
- Card mount: `opacity 0→1, translateY(6px→0)`, 220ms, `cubic-bezier(0.23, 1, 0.32, 1)`, staggered 60ms.
- Spinner: a thin rotating arc, navy, 1.4s linear — calm, not urgent.
- Button press: `scale(0.98)`, 140ms ease-out.
- Upload hover: border color transition only, 160ms.
- All motion gated behind `prefers-reduced-motion`.

**Typography System.**
- Display / headings: **Fraunces** (variable serif, optical size + soft contrast) at weight 500-600. Used for the app title and field values, giving results the gravitas of a stamped certificate.
- Body / UI: **Inter** at 400/500 — but only for secondary UI text (helper copy, buttons). Never for headings or values.
- Mono / labels: **JetBrains Mono** at 500, uppercase, tracked +0.08em, used for the left-gutter field labels and the confidence chip. This is the signature voice of the page.
- Hierarchy: title 28px Fraunces 600, section labels 11px JetBrains Mono uppercase, values 18px Fraunces 500, helper 13px Inter 400.
</text>
<probability>0.07</probability>
</response>

<response>
<text>
## Approach B — "Glass Console"
A glassmorphic dark-mode console with frosted navy panels, neon-cyan accents, and animated gradient mesh background. Beautiful but the user asked for white-and-navy clarity matching their existing app, and glass aesthetics don't read as "engineering tool." Rejected.
</text>
<probability>0.03</probability>
</response>

<response>
<text>
## Approach C — "Brutalist Datasheet"
Hard-edged Helvetica, no rounded corners, black-on-yellow caution stripes, monospace everywhere. Has personality but conflicts with the user's "clean, modern minimalist" requirement and would clash with the sister Property Risk Report app. Rejected.
</text>
<probability>0.02</probability>
</response>

---

## Selected: Approach A — "Industrial Dossier"

Every component will reinforce the dataplate metaphor: nameplate header, label-gutter result cards, mono-tracked field labels, calm navy on paper white, no gradients, no purple, no rounded-everything. Fraunces + Inter + JetBrains Mono.
