---
date: 2026-02-08
entry: 3
title: "Premature Workflow Optimization"
work: "PR #10 merge conflict resolution"
dimensions: [process-and-tooling]
---

# Entry 3: Premature Workflow Optimization

## What I Built

Resolved a merge conflict in PR #10 caused by branching two features off the same commit that both modified `task-item.tsx`. The fix was simple (merge main, combine both sides), but the conflict was avoidable — I should have branched #10 off #9 or waited for #9 to merge first.

## What I Learned

I feel this strong temptation to optimize for having multiple agents or multiple Claude Code instances working on the project in parallel. The effort to set that up is low, and it *feels* productive. But at this point it won't necessarily speed me up, and my thinking will not be clear.

The merge conflict was a small example of what happens when you parallelize before you're ready — two streams of work collided in the same file. The fix took five minutes, but in a more complex project with more moving parts, that kind of thing compounds.

The general principle: **avoid premature optimization of your workflow.** This is a big temptation in the world of agentic AI-assisted coding. The cost of spinning up parallel work streams is so low that it feels free. But the coordination cost — keeping your mental model coherent across multiple branches, resolving conflicts, ensuring features compose correctly — is not free. It's the same trap as premature code optimization: you're spending effort on speed before you know where the bottleneck is.

For now, sequential is fine. One branch, one feature, one PR. When the project gets complex enough that I'm genuinely blocked waiting for builds or reviews, *then* parallelize.
