---
date: 2026-02-09
entry: 5
title: "The Cost of Code Fell, So Design Review Changed"
work: "#23-#30 → PR #31"
dimensions: [ux-design, process-and-tooling, product-strategy]
---

# Entry 5: The Cost of Code Fell, So Design Review Changed

## What I Built

Implemented 8 design fixes identified by an automated UX audit — an agent launched the app, navigated every screen, took screenshots, and filed issues in English describing what looked off. SVG nav icons, touch-friendly action buttons, empty states with personality, a hero nudge bar, labeled domain pickers, typography hierarchy, and a danger zone for destructive settings. All 8 issues went from screenshot critique → code → three-agent review → merged in a single session.

## What I Learned

The thing that hit me is that agents can now *see*. An agent spun up the app, looked at actual rendered UI, and gave design feedback grounded in what was on screen — not just what was in the code. That's a fundamentally different feedback loop. I could have English-language conversations about spacing, visual weight, and touch targets without opening a design tool.

What this means practically: the cost of getting to "good enough" design just collapsed. The agent is pattern-matching against thousands of real-world examples, so its feedback nudges you toward what the average user would find acceptable. It catches the obvious stuff — icons that look janky at small sizes, buttons that don't meet touch target minimums, empty states that say nothing useful. That's baseline quality, and it's now nearly free.

But here's the framework I landed on: there are two phases of design quality. **Baseline** is agent-driven — get the product to where nothing feels broken or weird. **Distinction** is human-driven — the opinionated choices, the personality, the moments where the product feels like *yours*. Agents are incredible at phase one. Phase two still requires taste, and that's where tools like Figma, collaborators with design expertise, or just my own deeper investment will matter.

The strategic insight is knowing which phase you're in. Right now Tend is pre-validation. Over-investing in distinction before the product concept has proven itself is waste. The agent-driven review loop lets me squeeze maximum value out of prototype-quality feedback at minimal cost, reserving the expensive design work for when the product has earned it.

## Broader Context

This connects to a broader shift in software: when the cost of code falls, the bottleneck moves. It used to be "can we build it?" Now it's "should we build it?" and "does it feel right?" The same cost collapse is happening to design polish — automated review makes baseline quality trivially cheap, which means the differentiator moves upstream to product taste and downstream to craft excellence. The middle ground of "competent but generic" is getting commoditized. That's fine for a prototype. It's not where you want to stay.
