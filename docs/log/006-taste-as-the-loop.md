---
date: 2026-02-27
entry: 6
title: "Taste as the Loop: Sculpting Code Through Listening"
work: "States of Being — Song Blender vocal phrase extraction"
dimensions: [process-and-tooling, product-strategy, architecture]
---

# Entry 6: Taste as the Loop: Sculpting Code Through Listening

## What I Built

A song processing pipeline for States of Being that takes an uploaded song, separates it into stems (drums, bass, vocals, other) via Demucs on Replicate, analyzes song structure (verse/chorus/bridge) via allin1, then chops each stem into musically meaningful loops. The vocal chopping went through four iterations in a single session — from naive section cuts to RMS-based voice activity detection that extracts individual vocal phrases, each snapped to silence at both ends.

## What I Learned

Something paradigmatic happened during this session. The pipeline has three layers: hosted ML models (Demucs, allin1), our post-processing code, and the output audio files. The models are fixed — we can't retrain them. The output is what the user hears. The post-processing code is the only thing we control, and it's where all the taste lives.

What emerged was a workflow I hadn't planned: I'd listen to the output, describe what was wrong in human terms ("it's cutting right before the word 'chant' instead of after"), and Claude would translate that into a code change (directional snap-to-silence, searching forward instead of backward). Then I'd listen again, give more feedback ("there are huge silent gaps between the vocal phrases"), and Claude would translate that into a fundamentally different algorithm (voice activity detection instead of section-based chopping).

The interesting thing is that my feedback was never technical. I never said "lower the RMS threshold" or "use a rolling average." I said things like "it ended just slightly before it would have been optimal" and "there's a chant that happens over and over and it would be nice to just have one." The translation from embodied listening experience to code was the agent's job. My job was to be a human with ears and taste.

This feels like a pattern that will keep showing up: model-driven applications where the models do the heavy ML work, humans evaluate the output with their senses, and the code between the two gets sculpted through conversation. The human brings embodied experience — what sounds right, what feels musical, what's "slightly before optimal." The agent brings the ability to translate those impressions into algorithms. Neither could do it alone.

The LEARNINGS.md file we created during the session is part of this too. It's not just documentation — it's the institutional memory of taste decisions. When we come back to this pipeline in a month, that file tells us why the silence threshold is 0.008 and not 0.01, why vocal cuts search forward and not symmetrically, why front-loaded loops get filtered. Each entry is a listening session crystallized into a rule.

## The Bigger Picture

The cost structure of AI-assisted development keeps surprising me. The ML models cost ~$0.14 per song on Replicate. The agent time to iterate on post-processing was maybe an hour of conversation. But the actual value — the thing that made the output go from "244 identical loops" to "4 perfect vocal phrases" — was listening. Paying attention. Having taste. That's the human contribution that can't be automated, and it's the thing that makes the output actually good instead of just technically correct.

I think "taste as the loop" might be the defining pattern of this era of building. The models give you raw capability. The agent gives you translation speed. But the human ear (or eye, or intuition) is still the thing that closes the loop.
