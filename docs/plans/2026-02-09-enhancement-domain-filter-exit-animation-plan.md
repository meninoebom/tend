---
title: "enhancement: Inline domain picker replaces cycle interaction"
type: enhancement
date: 2026-02-09
issue: "#18"
---

# Inline Domain Picker

## Overview

The current domain assignment interaction (click to cycle through domains) breaks when combined with domain filtering: the task disappears on the first click because it immediately moves to the next domain. The user never gets to *choose* — they're forced into the next domain in the sequence. Replace the cycle interaction with an inline dot picker that expands on click.

## Problem Statement

The original issue (#18) was about the task vanishing when cycled out of a filter. But the deeper problem is that **cycling doesn't offer choice**:

1. User has "Work" filter active
2. User wants to change a task from "Work" to "Health" (3rd domain)
3. User clicks the domain dot — task cycles to "Personal" and immediately disappears
4. User never got to pick "Health"

The cycle interaction works fine when there's no filter. But with a filter active, the first non-matching cycle removes the task from view, making it impossible to reach the desired domain.

## Proposed Solution

**Domain dot popover** — click the domain dot to open a small popover below it showing all domains as colored dots. Tap the one you want. Closes after selection.

### Interaction flow

1. User clicks the domain dot on a task
2. A small popover appears below the dot showing colored dots (one per domain + an "×" to clear)
3. The current domain is visually indicated (ring outline)
4. User clicks the desired domain dot
5. API call fires, popover closes, `onMutate()` refreshes the list
6. Clicking outside the popover or pressing Escape closes it without changes
7. Opening a picker on one task auto-closes any other open picker

### Visual design

```
Before click:  [checkbox] [●] Task text here...
                           ^— domain dot (filled with domain color)

After click:   [checkbox] [●] Task text here...
                          ┌─────────────┐
                          │ ● ● ● ● ● × │
                          └─────────────┘
                           ^— popover with domain dots + clear
                           Current domain has ring outline
```

The popover is positioned absolutely below the domain dot. It doesn't push the task text or affect the row layout. Dots use each domain's color. The "×" clears the domain (sets to null). Each dot is sized for comfortable touch targets (~28px with spacing, fitting 5 domains + clear in a compact row).

### This replaces the cycle interaction

The `cycleDomain()` function is removed entirely from `TaskItem`. The new picker is a direct selection — no cycling, no guessing, no disappearing.

The cycle interaction in `TaskInput` (the new-task input bar) is a separate question. It works fine there because there's no filtering context — the user is just picking a default domain for a new task. Leave it as-is for now.

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/task-item.tsx` | Replace `cycleDomain()` and the domain dot button with a popover picker. New state: `isPickerOpen`. Click domain dot → open popover. Click a dot → `updateTask()` → close → `onMutate()`. Escape/click-outside → close. Use `position: absolute` so the popover doesn't affect row layout. |
| `frontend/src/app/(app)/today/page.tsx` | No changes needed — the filter still works, and now the user explicitly picks a domain so they know exactly what they're choosing. |
| `frontend/src/app/(app)/bucket/[b]/page.tsx` | No changes needed. |

No backend changes. No new dependencies.

## Acceptance Criteria

- [ ] Clicking a task's domain dot opens a popover showing all domains as colored dots plus an "×" for clearing
- [ ] Opening a picker on one task closes any other open picker
- [ ] The current domain is visually distinguished (ring outline or similar)
- [ ] Clicking a domain dot in the picker updates the task's domain via API, closes the picker, and refreshes
- [ ] Clicking "×" clears the domain (sets to null), closes the picker, and refreshes
- [ ] Clicking outside the picker or pressing Escape closes it without changes
- [ ] Tasks with no domain show the picker starting from the unset state (no dot highlighted)
- [ ] The picker works correctly whether or not a domain filter is active — the user always picks explicitly
- [ ] Completed tasks still don't show the picker (existing behavior)

## Edge Cases

- **No domains configured:** Don't show the domain dot at all (existing behavior — domains.length === 0 guard).
- **Only one domain:** Picker still shows — user might want to clear it. Shows one dot + "×".
- **Picker open + task gets refreshed:** Picker should close (the task data changed underneath). Setting `isPickerOpen = false` in the render when props change handles this.
- **Network error on update:** Show error state (existing red border pattern), keep picker open so user can retry or close.

## What this does NOT do

- No changes to the `TaskInput` domain cycle (that interaction is fine in the new-task context)
- No exit animation needed — the user explicitly chooses, so disappearing from a filter is an expected outcome of their deliberate action
- No dropdown menu or modal — the picker is a flat row of dots in a small popover
- No drag-and-drop or reordering

## References

- Issue: #18
- Current domain cycling: `frontend/src/components/task-item.tsx` `cycleDomain()` function
- Domain filter: `frontend/src/app/(app)/today/page.tsx` lines 36-38
- TaskInput cycle (not changing): `frontend/src/components/task-input.tsx` `cycleDomain()` function
