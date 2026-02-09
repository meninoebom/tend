---
date: 2026-02-09
entry: 4
title: "Dogfooding, Emotional Attachment, and Christopher Alexander"
work: "#18 → PR #19"
dimensions: [ux-design, product-strategy, business-and-growth]
---

# Entry 4: Dogfooding, Emotional Attachment, and Christopher Alexander

## What I Built

Replaced the domain cycle button (click to rotate through domains) with an inline dot picker popover. The cycle interaction broke when combined with domain filtering — clicking the dot moved the task to the next domain and it vanished before you could choose. The picker lets you explicitly pick the domain you want.

## What I Learned

I found this bug by accident, while trying to use Tend to manage my own tasks. Dogfooding works. I would not have seen this coming without actually using the app — the cycle interaction seemed perfectly fine in isolation. It was only when I was filtered to a domain and tried to reassign a task that the problem became obvious. Lesson: get a prototype out and start playing with it as soon as possible.

There was a temptation to solve the symptom rather than the cause. The initial plan was a fade-out animation — smooth, polished, technically interesting. But the real problem wasn't that the task disappeared too abruptly. The real problem was that the interaction model didn't give the user a choice. I was emotionally attached to the simplicity of the little cycling button — it's so much nicer than a dropdown with lots of text — and that attachment was pulling me toward complicated workarounds to preserve it. I had to let go of that with the faith that if what I land on is too clunky, I'll make it better.

## Broader Context

Now that the cost of prototyping has plummeted, we have an opportunity to build software the way Christopher Alexander talked about building architecture: through close listening to the people who are going to live in a space. Alexander believed you could discover a design through what amounts to an anthropological study of use patterns — watching how people actually inhabit a place, not guessing what they need.

That's always been true of software in theory, but the iteration cycle was too slow and expensive to do it well. If it takes months to ship a prototype, you can't afford to throw it away based on what you learn. But if you can go from idea to working UI in a day, you can build, watch, listen, and rebuild — letting the design form itself to real needs rather than imagined ones.

The practical question this raises for Tend: how do I structure my development process so I'm constantly getting actionable feedback from real users, and making the cycle from feedback to release as short as possible? Dogfooding is step one — I'm one user. But ten users would breathe ten times the life into the design. The next step is figuring out how to get it in front of people and how to listen well.
