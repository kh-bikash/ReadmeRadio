# README Radio visual identity

## Style Prompt

README Radio uses Notion's warm, paper-calm productivity aesthetic: a warm off-white canvas (`#f6f5f4`), near-black Inter type with tight negative tracking at display sizes, and a single confident Notion blue (`#0075de`) reserved for the active signal, links, and progress. A playful multi-colour sticker palette (sky, teal, green, pink, orange) decorates diagram node-type indicators without ever painting structure. The single dark moment is the indigo "night" intro/outro band (`#213183`) — one inverted island in an otherwise daylight document. Motion is calm, purposeful, and synchronized to narration.

## Colors

- `#f6f5f4` — warm paper canvas (primary background)
- `#ffffff` — surface (cards, panels)
- `#000000` — ink (primary text)
- `#31302e` — ink secondary (body copy)
- `#615d59` — ink muted (supporting text)
- `#a39e98` — ink faint (captions, metadata, unmentioned nodes)
- `#e6e6e6` — hairline (borders, dividers)
- `#0075de` — Notion blue (single structural accent: active node, active word, progress, links)
- `#005bab` — pressed blue
- `#213183` — deep indigo (night intro/outro band)
- `#62aef0` / `#2a9d99` / `#1aae39` / `#ff64c8` / `#dd5b00` — sticker palette (decorative node-type dots only)

## Typography

- Inter (substitute for NotionInter) for all roles
- Display: 54-64px, weight 700, negative letter-spacing (-1.875 to -2.125px)
- Headings: 26-40px, weight 700, negative tracking
- Body: 15-16px, weight 400, line-height 1.5
- Eyebrow/mono: 12-13px, weight 500-600, for labels and timecodes

## Motion

- Short spring entrances with soft deceleration
- Narration-synced: diagram nodes highlight when the script mentions them (not on a timer)
- Karaoke word-by-word caption highlight using exact TTS word timings
- Camera dolly toward the active node
- Signal particles pulse along edges at narration beats
- Respect `prefers-reduced-motion`
- All motion is frame-driven and deterministic (no browser-time animation in rendered video)

## Shapes

- Cards: 12px radius (`rounded.lg`)
- Large containers: 16px radius (`rounded.xl`)
- Badges/pills: full radius (`rounded.full`)
- Utility: 8px radius (`rounded.md`)
- Form fields: 4px radius (`rounded.xs`)

## Elevation

- Level 0: hairline border only (default cards)
- Level 1: barely-there layered micro-shadow (raised/active cards)
- No heavy drop-shadows — many near-transparent layers

## What NOT to Do

- No structural fills in sticker-palette colours — those are decoration only
- No second structural accent alongside Notion blue
- No heavy shadows — elevation is hairline + barely-there layers
- No body copy in heavy weight — 400 for readability, 700 for headlines only
- No pure clinical white for full-page backgrounds — the warm canvas is core
- No continuous browser-time animations in rendered video
- No fake progress or decorative controls without behaviour
