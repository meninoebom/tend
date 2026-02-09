---
date: 2026-02-08
entry: 2
title: "The Sentinel Pattern: When Null Means Two Things"
work: "#6 → PR #10"
dimensions: [backend, architecture]
---

# Entry 2: The Sentinel Pattern: When Null Means Two Things

## What I Built

Added click-to-cycle domain assignment on tasks. But the interesting part was a backend bug I had to fix first: the API couldn't distinguish between "the client didn't send `domain_id`" and "the client sent `domain_id: null` to clear it." Both arrived as Python `None`.

## What I Learned

This is the **sentinel pattern** — you replace a default value of `None` with a unique object that can't be confused with any real value:

```python
_UNSET = object()

def update_task(..., domain_id=_UNSET):
    if domain_id is not _UNSET:
        task.domain_id = domain_id  # None clears it, UUID sets it
```

Now `None` means "clear the domain" and `_UNSET` means "don't touch it." On the route side, Pydantic's `model_fields_set` tells you which fields the client actually sent in the JSON body, so you only pass what was explicit.

This is a common problem in any PATCH endpoint where fields are optional AND nullable. If you only check `if value is not None`, you can never clear a nullable field. The sentinel makes the API honest — every state the user can reach in the UI has a corresponding API call that works.
