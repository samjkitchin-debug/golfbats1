# BaseCamp Layout & Rhythm Contract

## Purpose
BaseCamp uses a strict vertical rhythm system so that all instruments align consistently
regardless of content height, completion state, or control complexity.

Spacing must be deterministic and owned by the layout system, not by instruments.

---

## Structural Rules

Each instrument section consists of:

- Outer wrapper (scroll anchor + identity)
- Inner content block (controls vertical breathing room)
- Optional divider (hairline only, no spacing)

All vertical spacing must come from the content block.
Dividers must never introduce spacing via margins or padding.

---

## Density Modes

### Normal Density

Used for:
- editable instruments  
- status controls  
- multi-line bodies  
- empty states  
- pills / buttons / complex UI  

Layout:
- content block: py-6  
- internal stack: flex flex-col gap-3  
- divider: plain hairline, no margin or padding  

This produces symmetric breathing room above and below content regardless of body height.

---

### Compact Density (Completed Jobs only)

Used only when:
- instrument.kind === "job"  
- isDone(event) === true  
- compactWhenDone === true  

Layout:
- content block: py-3  
- internal stack: flex flex-col gap-1  
- spacer before divider: h-1  
- divider: plain hairline, no margin or padding  

This produces a collapsed, summary-like appearance while maintaining optical centering between dividers.

---

## Divider Contract

Dividers are always plain hairlines:

```
border-t border-border
```

Never add:
- margins (mt-*, mb-*)
- padding (pt-*, pb-*)
- spacing classes

Dividers are visual separators only. All breathing room comes from the content block above.

---

## Header Contract

The header row contains:
- title (left-aligned)
- optional right-side slot (tick icon or action)

When an instrument is done (job only):
- green check icon appears in the right slot
- tick color: `text-[rgb(var(--brand-green))]`
- tick size: `w-4 h-4`

Status control instruments never show ticks (kind === "status_control").

---

## Scroll Anchoring

The outer wrapper receives:
- id (for scroll targeting)
- scroll-mt-24 (for offset compensation)

This ensures smooth navigation to instrument sections from links or anchors.

---

## Ownership

InlineInstrumentSection owns:
- all vertical spacing
- all dividers
- all header chrome
- all scroll anchors

Instrument components own:
- body content only
- no margins, no padding, no chrome
