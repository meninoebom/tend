---
date: 2026-02-08
entry: 1
title: "Speed Bumps for Cheap Code"
work: "#5 → PR #9"
dimensions: [ux-design, frontend, process-and-tooling, product-strategy]
---

# Entry 1: Speed Bumps for Cheap Code

## What I Built

Added inline text editing to tasks in Tend. Click a task's text to edit it in place — Enter saves, Escape cancels, clicking away saves. For tasks with subtasks, single-click still expands/collapses the subtask list, so editing is accessed via double-click or a hover pencil icon. Completed tasks are read-only. No backend changes needed — the PATCH endpoint already existed.

But the more interesting thing I built today was this log itself.

## What I Learned

The challenge for builders right now isn't the overwhelming friction of producing working code, or planning carefully to avoid sunk costs from building the wrong thing. Now the risks are on the other side of that curve. The cost of code is so low that the dangers come in the form of having too much code — or not enough friction to think clearly about your outcomes and your customers.

So I added friction on purpose. I integrated a "learning in public" system into my Claude Code workflow. When it notices that something we've worked on together warrants reflection, it asks me productive questions to help me reflect and bake in learning. This could be a personal project log, something shared among a team, or — in my case — something I force myself to share with a wider audience. The underlying principle is the same: **you need speed bumps when you can produce so much code so quickly**, to force yourself to do some of the planning and reflection that you used to have to do by virtue of the cost of producing code.

This particular update was quick because the sequencing I'm committed to is schema-first:

1. Map the domain to primitives, then build a sound data model and schemas
2. Build the backend on top of that
3. Build UIs that utilize that (hopefully robust) data model and backend

Because there was already a PATCH endpoint, adding richness to the UI — inline editing — was straightforward. That's the payoff of investing in the foundation first. I hope I can keep that discipline baked into my process.

## Broader Context

I'll be honest: product instinct is at the edge of my skill set. Of the remaining open issues — onboarding, changing a task's domain, adding subtasks — I don't know which matters most for a first-time user. Maybe I won't know until I dogfood this thing, or until I get other users on it. Someone with more product experience might have an instinct here. I don't, and that's something I'm watching closely.

That gap is part of why this log exists. Building a product isn't just code — it's the decisions about what to build next, and the honesty to say when you're guessing.
